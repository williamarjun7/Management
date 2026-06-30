import { queueDB } from './queue-db';
import type { StoredTelemetry } from './queue-db';
import { logger } from './logger';

const TELEMETRY_KEY = 'highlands_telemetry';
const MAX_EVENTS = 5000;
const BATCH_INTERVAL_MS = 5000;
const RETENTION_DAYS = 30;
const IDB_FLUSH_THRESHOLD = 50;
const MAX_IN_MEMORY_EVENTS = 200;

// In-memory write cache to avoid full JSON load/save on every recordTelemetry call
let telemetryCache: TelemetryEvent[] | null = null;
let telemetryCacheDirty = false;
let telemetryFlushTimer: ReturnType<typeof setTimeout> | null = null;

export type TelemetryEventType =
  | 'order_confirmed'
  | 'order_completed'
  | 'order_cancelled'
  | 'kitchen_prep_start'
  | 'kitchen_prep_ready'
  | 'payment_attempt'
  | 'payment_success'
  | 'payment_failed'
  | 'payment_idempotent_replay'
  | 'reconnect'
  | 'replay_batch'
  | 'mutation_queued'
  | 'mutation_processed'
  | 'mutation_failed'
  | 'offline_start'
  | 'offline_end'
  | 'confirm_cancelled'
  | 'retry_exceeded'
  | 'inventory_reservation_expired'
  | 'optimistic_rollback'
  | 'rpc_latency'
  | 'websocket_connected'
  | 'websocket_disconnected'
  | 'websocket_reconnect'
  | 'auth_login'
  | 'auth_logout'
  | 'auth_refresh'
  | 'auth_refresh_failed'
  | 'auth_session_restored'
  | 'page_view'
  | 'page_performance'
  | 'queue_processing'
  | 'realtime_event_received'
  | 'workflow_step'
  | 'circuit_state_change'
  | 'websocket_silent_disconnect'
  | 'suspicious_activity'
  | 'rate_limit_exceeded'
  | 'role_fallback_staff';

export interface TelemetryEvent {
  ts: number;
  type: TelemetryEventType;
  trace_id: string;
  correlation_id?: string;
  workflow_id?: string;
  workflow_step?: string;
  session_id?: string;
  payload: Record<string, unknown>;
}

export interface TelemetryMetrics {
  total: number;
  totalEvents: number;
  lastHour: number;
  today: number;
  counts: Record<string, number>;
  avgKitchenPrepMs: number | null;
  avgPaymentMs: number | null;
  avgRpcLatencyMs: number | null;
  reconnectCount: number;
  failedMutationCount: number;
  idempotentReplayCount: number;
  cancelConfirmCount: number;
  queueUsage: number;
  offlineDurationMs: number;
  rpcCallCount: number;
  slowRpcCount: number;
  websocketEventCount: number;
  authEventCount: number;
  pageViewCount: number;
  circuitOpenCount: number;
  realtimeEventCount: number;
  storageTelemetryCount: number;
}

let _tabId: string | undefined;
let _deviceId: string | undefined;

function getTabId(): string {
  if (!_tabId) _tabId = logger.getTabId();
  return _tabId;
}

function getDeviceId(): string {
  if (!_deviceId) _deviceId = logger.getDeviceId();
  return _deviceId;
}

function getSessionId(): string {
  let id = sessionStorage.getItem('highlands_session_id');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('highlands_session_id', id);
  }
  return id;
}

export function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

export function getCorrelationId(): string {
  let id = sessionStorage.getItem('highlands_correlation_id');
  if (!id) {
    id = generateCorrelationId();
    sessionStorage.setItem('highlands_correlation_id', id);
  }
  return id;
}

export function setCorrelationId(id: string): void {
  sessionStorage.setItem('highlands_correlation_id', id);
}

export function clearCorrelationId(): void {
  sessionStorage.removeItem('highlands_correlation_id');
}

export function generateWorkflowId(): string {
  return `wf-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;
}

function loadFromStorage(): TelemetryEvent[] {
  try {
    const raw = localStorage.getItem(TELEMETRY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function flushCacheToStorage(): void {
  if (!telemetryCacheDirty || !telemetryCache) return;
  try {
    const trimmed = telemetryCache.slice(-MAX_EVENTS);
    localStorage.setItem(TELEMETRY_KEY, JSON.stringify(trimmed));
    telemetryCacheDirty = false;
  } catch {
    /* storage full — silently drop */
  }
}

function load(): TelemetryEvent[] {
  if (!telemetryCache) {
    telemetryCache = loadFromStorage();
  }
  return telemetryCache;
}

function getOrInitCache(): TelemetryEvent[] {
  if (!telemetryCache) {
    telemetryCache = loadFromStorage();
  }
  return telemetryCache;
}

function scheduleCacheFlush(): void {
  if (telemetryFlushTimer) clearTimeout(telemetryFlushTimer);
  telemetryFlushTimer = setTimeout(() => {
    telemetryFlushTimer = null;
    flushCacheToStorage();
  }, 2000);
}

export function recordTelemetry(
  type: TelemetryEventType,
  trace_id: string,
  payload: Record<string, unknown> = {},
): void {
  const correlationId = getCorrelationId();
  const event: TelemetryEvent = {
    ts: Date.now(),
    type,
    trace_id,
    correlation_id: correlationId,
    session_id: getSessionId(),
    payload,
  };
  const events = getOrInitCache();
  events.push(event);
  if (events.length > MAX_IN_MEMORY_EVENTS) {
    const excess = events.length - MAX_IN_MEMORY_EVENTS;
    events.splice(0, excess);
  }
  telemetryCacheDirty = true;
  scheduleCacheFlush();
  scheduleBatchFlush();
}

export function recordTelemetryWithWorkflow(
  type: TelemetryEventType,
  trace_id: string,
  workflow_id: string,
  workflow_step: string,
  payload: Record<string, unknown> = {},
): void {
  const correlationId = getCorrelationId();
  const event: TelemetryEvent = {
    ts: Date.now(),
    type,
    trace_id,
    correlation_id: correlationId,
    workflow_id,
    workflow_step,
    session_id: getSessionId(),
    payload,
  };
  const events = getOrInitCache();
  events.push(event);
  if (events.length > MAX_IN_MEMORY_EVENTS) events.splice(0, events.length - MAX_IN_MEMORY_EVENTS);
  telemetryCacheDirty = true;
  scheduleCacheFlush();
  scheduleBatchFlush();
}

export function recordTelemetryBatch(
  events: Array<{ type: TelemetryEventType; trace_id: string; payload?: Record<string, unknown> }>,
): void {
  const correlationId = getCorrelationId();
  const sessionId = getSessionId();
  const now = Date.now();
  const stored = getOrInitCache();
  for (const e of events) {
    stored.push({
      ts: now,
      type: e.type,
      trace_id: e.trace_id,
      correlation_id: correlationId,
      session_id: sessionId,
      payload: e.payload ?? {},
    });
  }
  if (stored.length > MAX_IN_MEMORY_EVENTS) stored.splice(0, stored.length - MAX_IN_MEMORY_EVENTS);
  telemetryCacheDirty = true;
  scheduleCacheFlush();
  scheduleBatchFlush();
}

export function getTelemetry(
  type?: TelemetryEventType,
  since?: number,
): TelemetryEvent[] {
  let events = load();
  if (type) events = events.filter((e) => e.type === type);
  if (since) events = events.filter((e) => e.ts >= since);
  return events;
}

export function getTelemetryMetrics(): TelemetryMetrics {
  const events = load();
  const now = Date.now();
  const oneHour = now - 3600000;
  const today = now - 86400000;

  const recent = events.filter((e) => e.ts >= oneHour);
  const todayEvents = events.filter((e) => e.ts >= today);

  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.type] = (counts[e.type] || 0) + 1;
  }

  const prepTimes = todayEvents
    .filter((e) => e.type === 'kitchen_prep_ready')
    .map((e) => e.payload.duration_ms as number)
    .filter(Boolean);

  const paymentTimes = todayEvents
    .filter((e) => e.type === 'payment_success')
    .map((e) => e.payload.duration_ms as number)
    .filter(Boolean);

  const rpcLatencies = todayEvents
    .filter((e) => e.type === 'rpc_latency')
    .map((e) => e.payload.duration_ms as number)
    .filter(Boolean);

  const reconnectCount = todayEvents.filter((e) => e.type === 'reconnect').length;
  const failedMutationCount = todayEvents.filter((e) => e.type === 'mutation_failed').length;
  const idempotentReplayCount = todayEvents.filter((e) => e.type === 'payment_idempotent_replay').length;
  const cancelConfirmCount = todayEvents.filter((e) => e.type === 'confirm_cancelled').length;
  const rpcCallCount = todayEvents.filter((e) => e.type === 'rpc_latency').length;
  const websocketEventCount = todayEvents.filter(
    (e) => e.type === 'websocket_connected' || e.type === 'websocket_disconnected' || e.type === 'websocket_reconnect',
  ).length;
  const authEventCount = todayEvents.filter(
    (e) => e.type.startsWith('auth_'),
  ).length;
  const pageViewCount = todayEvents.filter((e) => e.type === 'page_view').length;
  const circuitOpenCount = todayEvents.filter((e) => e.type === 'circuit_state_change').length;
  const realtimeEventCount = todayEvents.filter((e) => e.type === 'realtime_event_received').length;

  return {
    total: events.length,
    totalEvents: events.length,
    lastHour: recent.length,
    today: todayEvents.length,
    counts,
    avgKitchenPrepMs: prepTimes.length
      ? Math.round(prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length)
      : null,
    avgPaymentMs: paymentTimes.length
      ? Math.round(paymentTimes.reduce((a, b) => a + b, 0) / paymentTimes.length)
      : null,
    avgRpcLatencyMs: rpcLatencies.length
      ? Math.round(rpcLatencies.reduce((a, b) => a + b, 0) / rpcLatencies.length)
      : null,
    reconnectCount,
    failedMutationCount,
    idempotentReplayCount,
    cancelConfirmCount,
    queueUsage: todayEvents.filter((e) => e.type === 'mutation_queued').length,
    offlineDurationMs: todayEvents
      .filter((e) => e.type === 'offline_end')
      .reduce((sum, e) => sum + ((e.payload.duration_ms as number) || 0), 0),
    rpcCallCount,
    slowRpcCount: rpcCallCount,
    websocketEventCount,
    authEventCount,
    pageViewCount,
    circuitOpenCount,
    realtimeEventCount,
    storageTelemetryCount: 0,
  };
}

export function getTelemetrySummary() {
  return getTelemetryMetrics();
}

export function clearTelemetry(): void {
  telemetryCache = null;
  telemetryCacheDirty = false;
  try {
    localStorage.removeItem(TELEMETRY_KEY);
  } catch { /* noop */ }
}

// ── IndexedDB persistence ──

let batchFlushScheduled = false;

function scheduleBatchFlush(): void {
  if (batchFlushScheduled) return;
  batchFlushScheduled = true;
  setTimeout(() => {
    batchFlushScheduled = false;
    flushToIndexedDB().catch(() => {});
  }, BATCH_INTERVAL_MS);
}

export async function flushToIndexedDB(): Promise<number> {
  const events = load();
  if (events.length === 0) return 0;

  const now = new Date().toISOString();
  const toStore: StoredTelemetry[] = events.slice(-IDB_FLUSH_THRESHOLD).map((e) => ({
    type: e.type,
    key: e.trace_id,
    payload: {
      ...e.payload,
      _correlation_id: e.correlation_id,
      _workflow_id: e.workflow_id,
      _workflow_step: e.workflow_step,
      _session_id: e.session_id,
      _ts: e.ts,
    },
    tabId: getTabId(),
    deviceId: getDeviceId(),
    timestamp: now,
  }));

  try {
    await queueDB.telemetry.bulkAdd(toStore);
    return toStore.length;
  } catch (err) {
    logger.warn('telemetry_idb_flush_failed', 'telemetry', {
      metadata: { error: (err as Error)?.message, count: toStore.length },
    });
    return 0;
  }
}

export async function cleanupOldTelemetry(): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString();

  try {
    const deleted = await queueDB.telemetry
      .where('timestamp')
      .below(cutoffStr)
      .delete();
    logger.info('telemetry_cleanup_complete', 'telemetry', {
      metadata: { deletedCount: deleted, retentionDays: RETENTION_DAYS },
    });
    return deleted;
  } catch (err) {
    logger.warn('telemetry_cleanup_failed', 'telemetry', {
      metadata: { error: (err as Error)?.message },
    });
    return 0;
  }
}

export async function getStorageTelemetryCount(): Promise<number> {
  try {
    return await queueDB.telemetry.count();
  } catch {
    return 0;
  }
}

export async function getTelemetryByType(
  type: string,
  limit = 100,
): Promise<StoredTelemetry[]> {
  try {
    return await queueDB.telemetry
      .where('type')
      .equals(type)
      .reverse()
      .limit(limit)
      .toArray();
  } catch {
    return [];
  }
}

export async function startTelemetryCleanupScheduler(intervalMs = 3600000): Promise<ReturnType<typeof setInterval>> {
  const interval = setInterval(() => {
    cleanupOldTelemetry().catch(() => {});
  }, intervalMs);
  return interval;
}
