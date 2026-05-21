import type { MutationQueueItem } from '../../types';
import { recordTelemetry } from './telemetry';
import { insforge } from '../core/insforge';
import { logger } from './logger';
import { amILeader } from './queue-leader';
import { queueDB, enqueueMutationTransactional, updateMutationStatusTransactional, moveToDeadLetter } from './queue-db';
import type { StoredMutation } from './queue-db';
import { isCircuitOpen, recordFailure, recordSuccess } from './circuit-breaker';
import { createMutex, backoffWithJitter } from './sync';

const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const PENDING_STUCK_THRESHOLD_MS = 300000;
const REPLAY_CHECKPOINT_KEY = 'highlands_replay_checkpoint';
const PROCESSED_KEYS_KEY = 'highlands_processed_idempotency';

// ── Processing mutex prevents concurrent drain across callers in same tab ──

const drainMutex = createMutex();

// ── In-memory processing lock ──

const processingLock = new Set<string>();
const MAX_PROCESSED_KEYS = 500;
const processedIdempotencyKeys = new Set<string>();

function loadProcessedKeys(): void {
  try {
    const raw = localStorage.getItem(PROCESSED_KEYS_KEY);
    if (raw) {
      const keys: string[] = JSON.parse(raw);
      keys.forEach(k => processedIdempotencyKeys.add(k));
    }
  } catch { /* silent */ }
}
loadProcessedKeys();

function persistProcessedKeys(): void {
  try {
    const arr = Array.from(processedIdempotencyKeys).slice(-500);
    localStorage.setItem(PROCESSED_KEYS_KEY, JSON.stringify(arr));
  } catch { /* silent */ }
}

export function markIdempotencyProcessed(key: string): void {
  processedIdempotencyKeys.add(key);
  if (processedIdempotencyKeys.size > MAX_PROCESSED_KEYS) {
    const iter = processedIdempotencyKeys.values();
    const toDelete = processedIdempotencyKeys.size - MAX_PROCESSED_KEYS;
    for (let i = 0; i < toDelete; i++) {
      const val = iter.next();
      if (val.done) break;
      processedIdempotencyKeys.delete(val.value);
    }
  }
  persistProcessedKeys();
}

export function isIdempotencyProcessed(key: string): boolean {
  return processedIdempotencyKeys.has(key);
}

// ── Replay checkpoint ──

export function getReplayCheckpoint(): string | null {
  try {
    return localStorage.getItem(REPLAY_CHECKPOINT_KEY);
  } catch { return null; }
}

export function setReplayCheckpoint(id: string): void {
  try {
    localStorage.setItem(REPLAY_CHECKPOINT_KEY, id);
  } catch { /* silent */ }
}

// ── Dual-write mode (Step 7: Safe Migration Layer) ──
export let dualWriteMode = true;
export function enableDualWrite() { dualWriteMode = true; }
export function disableDualWrite() { dualWriteMode = false; }

const STORAGE_KEY = 'highlands_mutation_queue';

function writeToLocalStorage(item: StoredMutation): void {
  if (!dualWriteMode) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const queue: MutationQueueItem[] = raw ? JSON.parse(raw) : [];
    const existing = queue.findIndex((i: MutationQueueItem) => i.id === item.id);
    if (existing >= 0) {
      queue[existing] = item;
    } else {
      queue.push(item);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch { /* localStorage full — non-critical */ }
}

function removeFromLocalStorage(id: string): void {
  if (!dualWriteMode) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const queue: MutationQueueItem[] = raw ? JSON.parse(raw) : [];
    const filtered = queue.filter((i: MutationQueueItem) => i.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch { /* silent */ }
}

// ── Public API (all async, IndexedDB-backed) ──

export async function getMutationQueue(): Promise<StoredMutation[]> {
  return await queueDB.mutations
    .where('status')
    .anyOf('pending', 'processing')
    .toArray();
}

export async function enqueueMutation(
  operation: string,
  params: Record<string, unknown>,
  idempotencyKey: string
): Promise<string> {
  if (isIdempotencyProcessed(idempotencyKey)) {
    logger.info('mutation_skipped_already_processed', 'mutation-queue', {
      metadata: { operation, idempotencyKey },
      operation,
    });
    return '';
  }

  const existing = await queueDB.mutations
    .where('idempotencyKey')
    .equals(idempotencyKey)
    .and(i => i.status === 'pending')
    .first();
  if (existing) return existing.id;

  const item: StoredMutation = {
    id: crypto.randomUUID(),
    operation,
    params,
    idempotencyKey,
    status: 'pending',
    createdAt: new Date().toISOString(),
    retryCount: 0,
    lastError: null,
    version: 1,
  };

  await enqueueMutationTransactional(item);
  writeToLocalStorage(item);
  recordTelemetry('mutation_queued', idempotencyKey, { operation, trace_id: idempotencyKey });
  logger.info('mutation_enqueued', 'mutation-queue', {
    metadata: { operation, idempotencyKey, queueItemId: item.id },
    operation,
    queueItemId: item.id,
  });
  return item.id;
}

export async function updateMutationStatus(
  id: string,
  status: StoredMutation['status'],
  error?: string | null
): Promise<void> {
  const item = await queueDB.mutations.get(id);
  if (!item) return;

  const updates: Partial<StoredMutation> = { status };
  if (error !== undefined) updates.lastError = error;
  if (status === 'processing') {
    updates.retryCount = (item.retryCount || 0) + 1;
  }

  await updateMutationStatusTransactional(id, updates);
  Object.assign(item, updates);
  writeToLocalStorage(item as StoredMutation);

  if (status === 'failed' && (item.retryCount || 0) >= MAX_RETRIES) {
    recordTelemetry('mutation_failed', item.idempotencyKey, {
      operation: item.operation,
      retryCount: item.retryCount,
      lastError: item.lastError,
    });
  }
}

// ── Queue health ──

export interface QueueHealthMetrics {
  queueSize: number;
  pendingCount: number;
  processingCount: number;
  deadLetterCount: number;
  completedCount: number;
  failedCount: number;
  oldestItemAgeMs: number;
  avgProcessingTimeMs: number;
  retryDistribution: Record<number, number>;
  lastDrainTimestamp: string | null;
  lastDrainDurationMs: number | null;
  throughputPerMinute: number;
  processingLockCount: number;
  processedIdempotencyCount: number;
}

const drainTimestamps: number[] = [];
const processingDurations: number[] = [];

function trackDrainDuration(startMs: number) {
  const duration = Date.now() - startMs;
  processingDurations.push(duration);
  if (processingDurations.length > 100) processingDurations.shift();
  drainTimestamps.push(Date.now());
  if (drainTimestamps.length > 100) drainTimestamps.shift();
}

export async function getQueueHealth(): Promise<QueueHealthMetrics> {
  const now = Date.now();
  const [totalItems, pendingCount, processingCount, deadCount, completedCount, failedCount, oldestItem] = await Promise.all([
    queueDB.mutations.count(),
    queueDB.mutations.where('status').equals('pending').count(),
    queueDB.mutations.where('status').equals('processing').count(),
    queueDB.mutations.where('status').equals('dead').count(),
    queueDB.mutations.where('status').equals('completed').count(),
    queueDB.mutations.where('status').equals('failed').count(),
    queueDB.mutations.orderBy('createdAt').first(),
  ]);

  const oldestItemAgeMs = oldestItem
    ? Math.max(0, now - new Date(oldestItem.createdAt).getTime())
    : 0;

  const oneMinAgo = now - 60000;
  const throughputPerMinute = drainTimestamps.filter(t => t > oneMinAgo).length;

  return {
    queueSize: totalItems,
    pendingCount,
    processingCount,
    deadLetterCount: deadCount,
    completedCount,
    failedCount,
    oldestItemAgeMs,
    avgProcessingTimeMs: processingDurations.length
      ? processingDurations.reduce((a, b) => a + b, 0) / processingDurations.length
      : 0,
    retryDistribution: {},
    lastDrainTimestamp: drainTimestamps.length
      ? new Date(drainTimestamps[drainTimestamps.length - 1]).toISOString()
      : null,
    lastDrainDurationMs: drainTimestamps.length
      ? processingDurations[processingDurations.length - 1] ?? null
      : null,
    throughputPerMinute,
    processingLockCount: processingLock.size,
    processedIdempotencyCount: processedIdempotencyKeys.size,
  };
}

// ── Stuck-processing recovery ──

const PROCESSING_TIMEOUT_MS = 120000;

export async function recoverStuckProcessingItems(): Promise<number> {
  const now = Date.now();
  let recovered = 0;

  // Recover stuck processing items
  const stuckItems = await queueDB.mutations
    .where('status')
    .equals('processing')
    .toArray();

  for (const item of stuckItems) {
    if (!item.processingStartedAt) {
      item.status = 'pending';
      item.processingStartedAt = undefined;
      item.processorTabId = undefined;
      await queueDB.mutations.put(item);
      recovered++;
      continue;
    }

    const elapsed = now - new Date(item.processingStartedAt).getTime();
    if (elapsed > PROCESSING_TIMEOUT_MS) {
      item.status = 'pending';
      item.processingStartedAt = undefined;
      item.processorTabId = undefined;
      processingLock.delete(item.id);
      await queueDB.mutations.put(item);
      recovered++;
      logger.warn('stuck_processing_item_recovered', 'mutation-queue', {
        metadata: {
          itemId: item.id,
          operation: item.operation,
          elapsedMs: elapsed,
          timeoutMs: PROCESSING_TIMEOUT_MS,
        },
        operation: 'lease_timeout',
        queueItemId: item.id,
      });
    }
  }

  // Also check for orphaned pending items that never got processed
  const pendingItems = await queueDB.mutations
    .where('status')
    .equals('pending')
    .toArray();

  for (const item of pendingItems) {
    const createdAt = new Date(item.createdAt).getTime();
    if (now - createdAt > PENDING_STUCK_THRESHOLD_MS && item.retryCount === 0) {
      // Force a retry attempt — increment retry to trigger processing
      item.retryCount = 1;
      await queueDB.mutations.put(item);
      recovered++;
      logger.warn('stuck_pending_item_refreshed', 'mutation-queue', {
        metadata: {
          itemId: item.id,
          operation: item.operation,
          pendingMs: now - createdAt,
        },
        operation: 'pending_timeout',
        queueItemId: item.id,
      });
    }
  }

  if (recovered > 0) {
    logger.info('stuck_processing_recovery_complete', 'mutation-queue', {
      metadata: { recoveredCount: recovered },
    });
  }

  return recovered;
}

// ── Processing ──

function getPriority(item: StoredMutation): number {
  return (item.params?.priority as number) ?? 0;
}

export async function processMutationQueue(): Promise<void> {
  if (!amILeader()) {
    logger.info('skipping_drain_not_leader', 'mutation-queue');
    return;
  }

  if (drainMutex.isLocked()) {
    logger.info('skipping_drain_already_running', 'mutation-queue');
    return;
  }

  const release = await drainMutex.acquire();
  try {
    if (isCircuitOpen()) {
      logger.warn('circuit_open_skipping_drain', 'mutation-queue');
      return;
    }

    const online = navigator.onLine;
    if (!online) return;

    await recoverStuckProcessingItems();

    const items = await queueDB.mutations
      .where('status')
      .anyOf('pending', 'processing')
      .sortBy('createdAt');

    if (items.length === 0) return;

    const drainStart = Date.now();

    for (const item of items) {
      if (processingLock.has(item.id)) continue;

      if (isIdempotencyProcessed(item.idempotencyKey) && item.status !== 'failed') {
        item.status = 'completed';
        await queueDB.mutations.put(item);
        removeFromLocalStorage(item.id);
        continue;
      }

      if (item.retryCount >= MAX_RETRIES) {
        await moveToDeadLetter(item);
        removeFromLocalStorage(item.id);
        logger.error('mutation_dead_letter', 'mutation-queue', {
          metadata: { operation: item.operation, retryCount: item.retryCount, lastError: item.lastError },
          operation: item.operation,
          queueItemId: item.id,
        });
        continue;
      }

      processingLock.add(item.id);

      item.status = 'processing';
      item.processingStartedAt = new Date().toISOString();
      item.processorTabId = logger.getTabId();
      await queueDB.mutations.put(item);
      writeToLocalStorage(item);

      logger.info('mutation_processing', 'mutation-queue', {
        metadata: { operation: item.operation, retryCount: item.retryCount, priority: getPriority(item) },
        operation: item.operation,
        queueItemId: item.id,
      });

      const startMs = Date.now();
      try {
        const { error } = await insforge.database.rpc(item.operation, item.params);
        if (error) {
          recordFailure();
          throw new Error(typeof error === 'string' ? error : error.message || 'Mutation failed');
        }
        recordSuccess();
        markIdempotencyProcessed(item.idempotencyKey);
        processingLock.delete(item.id);
        item.status = 'completed';
        item.processingStartedAt = undefined;
        item.processorTabId = undefined;
        await queueDB.mutations.put(item);
        writeToLocalStorage(item);
        recordTelemetry('mutation_processed', item.idempotencyKey, { operation: item.operation, durationMs: Date.now() - startMs });
        logger.info('mutation_completed', 'mutation-queue', {
          metadata: { operation: item.operation, durationMs: Date.now() - startMs, priority: getPriority(item) },
          operation: item.operation,
          queueItemId: item.id,
          durationMs: Date.now() - startMs,
        });
      } catch (err) {
        const msg = (err as Error)?.message || 'Unknown error';
        recordFailure();
        item.status = 'failed';
        item.lastError = msg;
        item.processingStartedAt = undefined;
        item.processorTabId = undefined;
        await queueDB.mutations.put(item);
        writeToLocalStorage(item);
        processingLock.delete(item.id);
        logger.error('mutation_failed', 'mutation-queue', {
          metadata: { operation: item.operation, error: msg, retryCount: item.retryCount },
          operation: item.operation,
          queueItemId: item.id,
          retryCount: item.retryCount,
        });
        await new Promise((resolve) => setTimeout(resolve, backoffWithJitter(item.retryCount + 1, INITIAL_BACKOFF_MS, MAX_BACKOFF_MS)));
      }
    }

    trackDrainDuration(drainStart);
    const health = await getQueueHealth();
    logger.info('queue_drain_complete', 'mutation-queue', {
      metadata: health as unknown as Record<string, unknown>,
      operation: 'drain',
    });
  } finally {
    release();
  }
}

// ── Helper functions ──

export async function clearCompletedMutations(): Promise<void> {
  const toDelete = await queueDB.mutations
    .where('status')
    .anyOf('completed')
    .toArray();
  const ids = toDelete.map(i => i.id);

  await queueDB.transaction('rw', queueDB.mutations, async () => {
    for (const id of ids) {
      await queueDB.mutations.delete(id);
    }
  });

  if (dualWriteMode) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const queue: MutationQueueItem[] = raw ? JSON.parse(raw) : [];
      const filtered = queue.filter((i) => i.status !== 'completed');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch { /* silent */ }
  }
}

export async function hasPendingMutations(): Promise<boolean> {
  const count = await queueDB.mutations
    .where('status')
    .anyOf('pending', 'processing')
    .count();
  return count > 0;
}

export async function getPendingCount(): Promise<number> {
  return await queueDB.mutations
    .where('status')
    .equals('pending')
    .count();
}

export async function getFailedCount(): Promise<number> {
  const failed = await queueDB.mutations
    .where('status')
    .equals('failed')
    .count();
  const dead = await queueDB.mutations
    .where('status')
    .equals('dead')
    .count();
  return failed + dead;
}

export async function retryFailedMutation(id: string): Promise<void> {
  const item = await queueDB.mutations.get(id);
  if (item && (item.status === 'failed' || item.status === 'dead')) {
    item.status = 'pending';
    item.retryCount = 0;
    item.lastError = null;
    item.processingStartedAt = undefined;
    item.processorTabId = undefined;
    await queueDB.mutations.put(item);
    writeToLocalStorage(item);
  }
}

// ── Sync wrapper for backward compatibility ──
function loadQueueSync(): MutationQueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** @deprecated Use async getMutationQueue() instead */
export function getMutationQueueSync(): MutationQueueItem[] {
  return loadQueueSync().filter((item) => item.status === 'pending' || item.status === 'processing');
}

/** @deprecated Use async hasPendingMutations() instead */
export function hasPendingMutationsSync(): boolean {
  return loadQueueSync().some((item) => item.status === 'pending' || item.status === 'processing');
}

/** @deprecated Use async getPendingCount() instead */
export function getPendingCountSync(): number {
  return loadQueueSync().filter((item) => item.status === 'pending').length;
}

/** @deprecated Use async getFailedCount() instead */
export function getFailedCountSync(): number {
  return loadQueueSync().filter((item) => item.status === 'failed' || item.status === 'dead').length;
}

/** @deprecated Use async retryFailedMutation() instead */
export function retryFailedMutationSync(id: string): void {
  const queue = loadQueueSync();
  const item = queue.find((i) => i.id === id);
  if (item && (item.status === 'failed' || item.status === 'dead')) {
    item.status = 'pending';
    item.retryCount = 0;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  }
}

/** @deprecated Use clearCompletedMutations() async instead */
export function clearCompletedMutationsSync(): void {
  const queue = loadQueueSync().filter(
    (item) => item.status === 'pending' || item.status === 'processing' || item.status === 'failed'
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

// ── Auto-process on online transitions ──

let onlineListenerRegistered = false;

export function enableAutoProcessing(): void {
  if (onlineListenerRegistered) return;
  onlineListenerRegistered = true;

  window.addEventListener('online', () => {
    logger.info('online_detected_processing_queue', 'queue');
    processMutationQueue();
  });

  window.addEventListener('offline', () => {
    logger.warn('offline_detected_queue_paused', 'queue', {
      metadata: { pendingCount: getPendingCountSync() },
    });
  });
}

// Auto-register on module load (safe for SPA since guard prevents duplicate)
if (typeof window !== 'undefined') {
  enableAutoProcessing();
}
