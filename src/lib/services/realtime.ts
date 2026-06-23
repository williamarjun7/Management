import { insforge } from '../core/insforge';
import { queryClient } from '../core/query-client';
import { recordTelemetry } from './telemetry';
import { processMutationQueue, isIdempotencyProcessed } from './mutation-queue';
import { logger } from './logger';
import { contestLeadership } from './queue-leader';
import { debouncedInvalidateMany, setInvalidateFn, backoffWithJitter } from './sync';
import type { SystemEvent } from '../../types';

const STORAGE_PREFIX = 'highlands_replay_';
const REPLAY_CHUNK_SIZE = 50;
const STALE_CHANNEL_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const STALE_REPLAY_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const RECONNECT_DEBOUNCE_MS = 2000;

let realtimeInitialized = false;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let authReady = false;
let connectPending = false;

interface ChannelInfo {
  key: string;
  subscribedAt: number;
  cleanup: (() => void) | null;
  messageCount: number;
  errorCount: number;
  lastMessageAt: number;
}

interface ChannelHealth {
  key: string;
  subscribedAt: number;
  messageCount: number;
  errorCount: number;
  lastMessageAt: number;
  ageMs: number;
}

const activeChannels = new Map<string, ChannelInfo>();
const subscribedChannelSet = new Set<string>();

// ── Duplicate event suppression ──

const seenEventIds = new Set<string>();

export function markEventSeen(eventId: string): void {
  seenEventIds.add(eventId);
  if (seenEventIds.size > 1000) {
    const iter = seenEventIds.values();
    for (let i = 0; i < 200; i++) {
      const val = iter.next();
      if (val.done) break;
      seenEventIds.delete(val.value);
    }
  }
}

export function isEventSeen(eventId: string): boolean {
  return seenEventIds.has(eventId);
}

export function clearSeenEvents(): void {
  seenEventIds.clear();
}

function getLastEventId(channel: string): string {
  try {
    return localStorage.getItem(STORAGE_PREFIX + channel) || '';
  } catch {
    return '';
  }
}

function setLastEventId(channel: string, id: string): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + channel, id);
  } catch {
    /* localStorage full — skip */
  }
}

const SYNC_EVENTS: Record<string, string[]> = {
  SYNC_BOOKING_CREATED: ['bookings', 'rooms', 'today-bookings', 'external-bookings'],
  SYNC_BOOKING_UPDATED: ['bookings', 'rooms', 'sync-logs'],
  SYNC_BOOKING_CANCELLED: ['bookings', 'rooms', 'today-bookings', 'sync-logs'],
  SYNC_BOOKING_CHECKED_IN: ['bookings', 'rooms', 'today-bookings', 'sync-logs'],
  SYNC_BOOKING_CHECKED_OUT: ['bookings', 'rooms', 'today-bookings', 'invoices', 'sync-logs'],
};

const EVENT_QUERY_MAP: Record<string, string[]> = {
  ORDER_CONFIRMED: ['kitchen-orders', 'orders'],
  PAYMENT_RECEIVED: ['invoices'],
  PAYMENT_REVERSED: ['invoices'],
  ROOM_CHECKED_IN: ['rooms', 'bookings', 'today-bookings'],
  ROOM_CHECKED_OUT: ['rooms', 'bookings', 'invoices'],
  ROOM_STATUS_CHANGED: ['rooms'],
  BOOKING_CREATED: ['bookings', 'rooms', 'today-bookings'],
  STOCK_LOW: ['products'],
  ORDER_CREATED: ['orders', 'kitchen-orders', 'tables'],
  ORDER_STATUS_CHANGED: ['orders', 'kitchen-orders'],
  TABLE_STATUS_CHANGED: ['tables'],
  TABLE_SESSION_STARTED: ['table-sessions', 'tables'],
  TABLE_SESSION_CLOSED: ['table-sessions', 'tables'],
  WORKFLOW_STEP_CHANGED: ['workflows'],
  BILL_GENERATED: ['invoices', 'orders'],
  PAYMENT_PROCESSED: ['invoices', 'orders', 'tables'],
  FONEPAY_PAYMENT_INITIATED: ['invoices', 'orders'],
  FONEPAY_PAYMENT_CONFIRMED: ['invoices', 'orders', 'tables'],
  PAYMENT_COMPLETED: ['invoices', 'orders', 'tables'],
  ...SYNC_EVENTS,
};

function invalidateForEvent(eventType: string): void {
  const keys = EVENT_QUERY_MAP[eventType];
  if (keys) debouncedInvalidateMany(keys);
}

function processSocketMessage(payload: Record<string, unknown>): void {
  const data = payload?.data as Record<string, unknown> | undefined;
  const event = payload?.event as string | undefined;

  const eventId = payload?.id as string | undefined;
  if (eventId && isEventSeen(eventId)) return;
  if (eventId) markEventSeen(eventId);

  if (data?.event_type) {
    invalidateForEvent(data.event_type as string);
  }
  if (event === 'new_order' || event === 'order_update') {
    debouncedInvalidateMany(['kitchen-orders', 'orders', 'tables']);
  }
  if (event === 'status_change') {
    debouncedInvalidateMany(['orders', 'kitchen-orders']);
  }
  if (event === 'table_status_change') {
    debouncedInvalidateMany(['tables']);
  }
  if (event === 'checked_in' || event === 'checked_out') {
    debouncedInvalidateMany(['rooms', 'bookings']);
  }
  if (event === 'low_stock') {
    debouncedInvalidateMany(['products']);
  }
  if (event === 'payment_received') {
    debouncedInvalidateMany(['invoices']);
  }
  if (event === 'workflow_step' || event === 'billing_event') {
    debouncedInvalidateMany(['invoices', 'orders', 'tables']);
  }
}

// Register debounced invalidation with queryClient
setInvalidateFn((keys: string[]) => {
  for (const key of keys) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
});

async function replayMissedEvents(channel: string): Promise<void> {
  const lastId = getLastEventId(channel);
  if (!lastId) return;

  let cursor = lastId;
  const MAX_REPLAY_ITERATIONS = 20;

  for (let iter = 0; iter < MAX_REPLAY_ITERATIONS; iter++) {
    const { data, error } = await insforge.database
      .from('system_events')
      .select('id, event_type, entity_type, entity_id, payload, created_at')
      .gt('id', cursor)
      .order('created_at', { ascending: true })
      .limit(REPLAY_CHUNK_SIZE);

    if (error || !data || data.length === 0) {
      if (error) logger.error('replay_query_failed', 'realtime', { metadata: { error, channel } });
      break;
    }

    logger.info('replay_batch_processing', 'realtime', {
      metadata: { channel, count: data.length, fromId: cursor },
      operation: 'replay',
    });

    const events = data as unknown as SystemEvent[];
    let skippedStale = 0;
    let skippedDuplicate = 0;
    const now = Date.now();
    let newCursor = cursor;

    for (const event of events) {
      const eventTime = new Date(event.created_at).getTime();
      if (now - eventTime > STALE_REPLAY_THRESHOLD_MS) {
        skippedStale++;
        if (Number(event.id) > Number(newCursor)) newCursor = String(event.id);
        continue;
      }

      const eventId = String(event.id);
      if (isEventSeen(eventId)) {
        skippedDuplicate++;
        if (Number(event.id) > Number(newCursor)) newCursor = String(event.id);
        continue;
      }
      markEventSeen(eventId);

      const idempotencyKey = (event.payload?.idempotency_key as string) || '';
      if (idempotencyKey && isIdempotencyProcessed(idempotencyKey)) {
        skippedDuplicate++;
        if (Number(event.id) > Number(newCursor)) newCursor = String(event.id);
        continue;
      }

      invalidateForEvent(event.event_type);
      if (Number(event.id) > Number(newCursor)) newCursor = String(event.id);
    }

    setLastEventId(channel, newCursor);

    recordTelemetry('replay_batch', channel, {
      count: events.length,
      from_id: cursor,
      to_id: newCursor,
      skipped_stale: skippedStale,
      skipped_duplicate: skippedDuplicate,
    });

    if (events.length < REPLAY_CHUNK_SIZE) break;
    cursor = newCursor;
  }
}

function cleanupStaleSubscriptions(): void {
  const now = Date.now();
  for (const [key, info] of activeChannels.entries()) {
    if (now - info.subscribedAt > STALE_CHANNEL_MS) {
      try {
        if (info.cleanup) info.cleanup();
        insforge.realtime.unsubscribe(key);
      } catch (err) {
        logger.error('stale_channel_cleanup_failed', 'realtime', {
          metadata: { channel: key, error: (err as Error)?.message },
        });
      }
      activeChannels.delete(key);
      logger.info('stale_channel_cleaned', 'realtime', {
        metadata: { channel: key, ageMs: now - info.subscribedAt, messageCount: info.messageCount },
        operation: 'cleanup',
      });
    }
  }
}

function trackChannel(key: string, cleanup: (() => void) | null): void {
  const existing = activeChannels.get(key);
  if (existing) {
    if (existing.cleanup) existing.cleanup();
    existing.subscribedAt = Date.now();
    existing.cleanup = cleanup;
    return;
  }
  activeChannels.set(key, {
    key,
    subscribedAt: Date.now(),
    cleanup,
    messageCount: 0,
    errorCount: 0,
    lastMessageAt: Date.now(),
  });
  subscribedChannelSet.add(key);
  recordTelemetry('realtime_event_received', key, { action: 'subscribe' });
}

function removeChannel(key: string): void {
  const existing = activeChannels.get(key);
  if (existing?.cleanup) existing.cleanup();
  activeChannels.delete(key);
  subscribedChannelSet.delete(key);
  recordTelemetry('realtime_event_received', key, { action: 'unsubscribe' });
}

export function getChannelHealth(): ChannelHealth[] {
  const now = Date.now();
  return Array.from(activeChannels.entries()).map(([key, info]) => ({
    key,
    subscribedAt: info.subscribedAt,
    messageCount: info.messageCount,
    errorCount: info.errorCount,
    lastMessageAt: info.lastMessageAt,
    ageMs: now - info.subscribedAt,
  }));
}

let shutdownCleanup: (() => void) | null = null;

export function shutdownRealtime(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  stopHealthCheck();
  if (shutdownCleanup) {
    shutdownCleanup();
    shutdownCleanup = null;
  }
  realtimeInitialized = false;
}

export async function initRealtime(): Promise<void> {
  if (realtimeInitialized) return;
  realtimeInitialized = true;

  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  const reconnectToChannels = () => {
    for (const key of subscribedChannelSet) {
      try {
        insforge.realtime.subscribe(key);
      } catch (err) {
        logger.error('realtime_resubscribe_failed', 'realtime', {
          metadata: { channel: key, error: (err as Error)?.message },
        });
      }
    }
  };

  const handleOnline = () => {
    const now = Date.now();
    if (now - tracking.lastConnect < RECONNECT_DEBOUNCE_MS) return;
    tracking.lastConnect = now;

    // Jittered reconnect to prevent thundering herd
    const jitterMs = backoffWithJitter(tracking.reconnectCount, 200, 5000);
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(async () => {
      tracking.reconnectCount++;
      recordTelemetry('websocket_reconnect', 'realtime', { reconnectCount: tracking.reconnectCount });
      await safeConnect();
      tracking.reconnectCount = 0;
      tracking.lastConnect = Date.now();
      recordTelemetry('websocket_connected', 'realtime', { afterReconnect: true });
      reconnectToChannels();
      processMutationQueue();
    }, jitterMs);
  };

  window.addEventListener('online', handleOnline);

  if (authReady) {
    try {
      await insforge.realtime.connect();
      tracking.reconnectCount = 0;
      tracking.lastConnect = Date.now();
      recordTelemetry('websocket_connected', 'realtime');
    } catch (err) {
      logger.error('websocket_initial_connect_failed', 'realtime', {
        metadata: { error: (err as Error)?.message },
      });
    }
  } else {
    connectPending = true;
  }

  contestLeadership(
    () => {
      logger.info('became_queue_leader', 'realtime');
      processMutationQueue();
    },
    () => {
      logger.info('lost_queue_leadership', 'realtime');
    }
  );

  if (!cleanupTimer) {
    cleanupTimer = setInterval(cleanupStaleSubscriptions, CLEANUP_INTERVAL_MS);
  }

  startHealthCheck();

  shutdownCleanup = () => {
    stopHealthCheck();
    window.removeEventListener('online', handleOnline);
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
  };
}

const tracking = { lastConnect: 0, reconnectCount: 0, lastMessageAt: Date.now() };

// Periodic health check to detect silent WebSocket drops
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
const HEALTH_CHECK_INTERVAL_MS = 30000;
const MAX_SILENT_MS = 60000;

function startHealthCheck(): void {
  if (healthCheckTimer) return;
  healthCheckTimer = setInterval(() => {
    const now = Date.now();
    const silentDuration = now - tracking.lastMessageAt;
    if (silentDuration > MAX_SILENT_MS && subscribedChannelSet.size > 0) {
      logger.warn('websocket_silent_disconnect_detected', 'realtime', {
        metadata: { silentDuration, subscribedChannels: subscribedChannelSet.size },
      });
      recordTelemetry('websocket_silent_disconnect', 'realtime', { silentDuration });
      safeConnect().then(() => {
        tracking.lastMessageAt = Date.now();
        tracking.reconnectCount = 0;
      });
    }
  }, HEALTH_CHECK_INTERVAL_MS);
}

function stopHealthCheck(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}

// Called by any message handler to update the last message timestamp
function recordChannelActivity(key: string): void {
  const info = activeChannels.get(key);
  if (info) {
    info.messageCount++;
    info.lastMessageAt = Date.now();
  }
  tracking.lastMessageAt = Date.now();
}

export function getReconnectCount(): number {
  return tracking.reconnectCount;
}

export function subscribeKitchenOrders(onNewOrder?: () => void): () => void {
  const channelKey = 'kitchen-orders';

  insforge.realtime.subscribe(channelKey);
  replayMissedEvents(channelKey).catch((err) => {
    logger.error('replay_missed_events_failed', 'realtime', {
      metadata: { channel: channelKey, error: (err as Error)?.message },
    });
  });

  const handler = (payload: Record<string, unknown>) => {
    recordChannelActivity(channelKey);
    const event = payload?.event as string | undefined;
    if (event === 'new_order' && onNewOrder) {
      onNewOrder();
    }
    processSocketMessage(payload);
  };

  insforge.realtime.on(channelKey, handler);

  const cleanup = () => {
    insforge.realtime.off(channelKey, handler);
    insforge.realtime.unsubscribe(channelKey);
  };

  trackChannel(channelKey, cleanup);

  return () => {
    removeChannel(channelKey);
    cleanup();
  };
}

export function subscribeOrder(orderId: string): () => void {
  const channelKey = `order:${orderId}`;

  insforge.realtime.subscribe(channelKey);

  const handler = () => {
    recordChannelActivity(channelKey);
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
    queryClient.invalidateQueries({ queryKey: ['tables'] });
  };

  insforge.realtime.on(channelKey, handler);

  const cleanup = () => {
    insforge.realtime.off(channelKey, handler);
    insforge.realtime.unsubscribe(channelKey);
  };

  trackChannel(channelKey, cleanup);

  return () => {
    removeChannel(channelKey);
    cleanup();
  };
}

export function subscribeRoom(roomId: string): () => void {
  const channelKey = `room:${roomId}`;

  insforge.realtime.subscribe(channelKey);

  const handler = () => {
    recordChannelActivity(channelKey);
    queryClient.invalidateQueries({ queryKey: ['rooms'] });
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
  };

  insforge.realtime.on(channelKey, handler);

  const cleanup = () => {
    insforge.realtime.off(channelKey, handler);
    insforge.realtime.unsubscribe(channelKey);
  };

  trackChannel(channelKey, cleanup);

  return () => {
    removeChannel(channelKey);
    cleanup();
  };
}

export function subscribeNotifications(): () => void {
  const channelKey = 'notifications';

  insforge.realtime.subscribe(channelKey);

  const handler = (payload: Record<string, unknown>) => {
    recordChannelActivity(channelKey);
    processSocketMessage(payload);
  };

  insforge.realtime.on(channelKey, handler);

  const cleanup = () => {
    insforge.realtime.off(channelKey, handler);
    insforge.realtime.unsubscribe(channelKey);
  };

  trackChannel(channelKey, cleanup);

  return () => {
    removeChannel(channelKey);
    cleanup();
  };
}

export function subscribeRooms(onEvent?: () => void): () => void {
  const channelKey = 'rooms';

  insforge.realtime.subscribe(channelKey);
  replayMissedEvents(channelKey).catch((err) => {
    logger.error('replay_missed_events_failed', 'realtime', {
      metadata: { channel: channelKey, error: (err as Error)?.message },
    });
  });

  const handler = (payload: Record<string, unknown>) => {
    recordChannelActivity(channelKey);
    processSocketMessage(payload);
    const event = payload?.event as string | undefined;
    if (event && ['checked_in', 'checked_out', 'room_status_change', 'booking_created'].includes(event)) {
      onEvent?.();
    }
  };

  insforge.realtime.on(channelKey, handler);

  const cleanup = () => {
    insforge.realtime.off(channelKey, handler);
    insforge.realtime.unsubscribe(channelKey);
  };

  trackChannel(channelKey, cleanup);

  return () => {
    removeChannel(channelKey);
    cleanup();
  };
}

export function subscribeTableUpdates(tableId: string): () => void {
  const channelKey = `table:${tableId}`;

  insforge.realtime.subscribe(channelKey);

  const handler = () => {
    recordChannelActivity(channelKey);
    queryClient.invalidateQueries({ queryKey: ['tables'] });
    queryClient.invalidateQueries({ queryKey: ['orders'] });
  };

  insforge.realtime.on(channelKey, handler);

  const cleanup = () => {
    insforge.realtime.off(channelKey, handler);
    insforge.realtime.unsubscribe(channelKey);
  };

  trackChannel(channelKey, cleanup);

  return () => {
    removeChannel(channelKey);
    cleanup();
  };
}

export function subscribeFonepayPayment(
  transactionId: string,
  onPaid: (payload: Record<string, unknown>) => void,
): () => void {
  const channelKey = `fonepay:${transactionId}`;

  insforge.realtime.subscribe(channelKey);

  const handler = (payload: Record<string, unknown>) => {
    recordChannelActivity(channelKey);
    const event = payload?.event as string | undefined;
    if (event === 'payment_confirmed') {
      onPaid(payload?.data as Record<string, unknown> || payload);
    }
  };

  insforge.realtime.on(channelKey, handler);

  const cleanup = () => {
    insforge.realtime.off(channelKey, handler);
    insforge.realtime.unsubscribe(channelKey);
  };

  trackChannel(channelKey, cleanup);

  return () => {
    removeChannel(channelKey);
    cleanup();
  };
}

export interface PaymentStatusEvent {
  invoice_id: string;
  status: string;
  payment_method?: string;
  transaction_id?: string;
  gateway_reference?: string;
  paid_amount?: number;
}

export function subscribePaymentStatus(
  invoiceId: string,
  onPaid: (event: PaymentStatusEvent) => void,
): () => void {
  const channelKey = `payment:${invoiceId}`;

  insforge.realtime.subscribe(channelKey);

  const handler = (payload: Record<string, unknown>) => {
    recordChannelActivity(channelKey);
    const data = payload?.data as Record<string, unknown> | undefined;
    const event = payload?.event as string | undefined;

    if (event === 'payment_received' || event === 'PAYMENT_RECEIVED') {
      onPaid({
        invoice_id: invoiceId,
        status: 'paid',
        ...(data as Record<string, unknown>),
      } as PaymentStatusEvent);
    }
  };

  insforge.realtime.on(channelKey, handler);

  const cleanup = () => {
    insforge.realtime.off(channelKey, handler);
    insforge.realtime.unsubscribe(channelKey);
  };

  trackChannel(channelKey, cleanup);

  return () => {
    removeChannel(channelKey);
    cleanup();
  };
}

export function connectAfterAuth(): void {
  authReady = true;
  if (connectPending) {
    connectPending = false;
    insforge.realtime.connect().then(() => {
      tracking.reconnectCount = 0;
      tracking.lastConnect = Date.now();
      recordTelemetry('websocket_connected', 'realtime');
    }).catch((err) => {
      logger.error('websocket_connect_after_auth_failed', 'realtime', {
        metadata: { error: (err as Error)?.message },
      });
    });
  }
}

async function safeConnect(): Promise<void> {
  try {
    await insforge.realtime.connect();
  } catch {
    /* SDK logs its own WebSocket errors */
  }
}

export function getRealtimeDiagnostics() {
  return {
    channelCount: activeChannels.size,
    channels: Array.from(activeChannels.keys()),
    cleanupIntervalMs: CLEANUP_INTERVAL_MS,
    replayChunkSize: REPLAY_CHUNK_SIZE,
    staleThresholdMs: STALE_CHANNEL_MS,
    totalReconnects: tracking.reconnectCount,
    seenEventCount: seenEventIds.size,
  };
}
