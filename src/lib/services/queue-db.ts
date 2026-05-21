import Dexie, { type Table } from 'dexie';
import { logger } from './logger';
import { attachLogStore } from './logger';

export interface StoredMutation {
  id: string;
  operation: string;
  params: Record<string, unknown>;
  idempotencyKey: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead';
  createdAt: string;
  retryCount: number;
  lastError: string | null;
  version: number;
  processingStartedAt?: string;
  processorTabId?: string;
}

export interface StoredDeadLetter {
  id: string;
  originalMutationId: string;
  operation: string;
  params: Record<string, unknown>;
  idempotencyKey: string;
  failCount: number;
  lastError: string;
  createdAt: string;
  failedAt: string;
  version: number;
  processingStartedAt?: string;
  processorTabId?: string;
}

export interface StoredTelemetry {
  id?: number;
  type: string;
  key: string;
  payload: Record<string, unknown>;
  tabId: string;
  deviceId: string;
  timestamp: string;
}

export interface StoredReplayState {
  channel: string;
  sequenceId: number;
  updatedAt: string;
}

export interface StoredMetadata {
  key: string;
  value: unknown;
}

interface Migration {
  version: number;
  description: string;
  migrate: (db: MutationQueueDB) => Promise<void>;
}

const migrations: Migration[] = [];

const CURRENT_SCHEMA_VERSION = 1;

class MutationQueueDB extends Dexie {
  mutations!: Table<StoredMutation, string>;
  deadLetters!: Table<StoredDeadLetter, string>;
  telemetry!: Table<StoredTelemetry, number>;
  replayState!: Table<StoredReplayState, string>;
  metadata!: Table<StoredMetadata, string>;

  constructor() {
    super('HighlandsQueueDB');

    this.version(1).stores({
      mutations: 'id, status, createdAt, idempotencyKey',
      deadLetters: 'id, originalMutationId, createdAt',
      telemetry: '++id, type, timestamp',
      replayState: 'channel',
      metadata: 'key',
    });
  }

  async runMigrations(): Promise<void> {
    const currentVersion = await this.metadata.get('schema_version');
    const fromVersion = (currentVersion?.value as number) ?? 0;

    for (const m of migrations) {
      if (m.version > fromVersion) {
        await m.migrate(this);
        await this.metadata.put({ key: 'schema_version', value: m.version });
      }
    }
  }
}

export const queueDB = new MutationQueueDB();

attachLogStore({
  add: async (entry) => {
    await queueDB.telemetry.add({
      type: 'log',
      key: entry.tabId,
      payload: entry as unknown as Record<string, unknown>,
      tabId: entry.tabId,
      deviceId: entry.deviceId || '',
      timestamp: entry.timestamp,
    });
  },
});

export async function enqueueMutationTransactional(
  item: StoredMutation
): Promise<void> {
  await queueDB.transaction('rw', queueDB.mutations, async () => {
    const existing = await queueDB.mutations
      .where('idempotencyKey')
      .equals(item.idempotencyKey)
      .and(i => i.status === 'pending')
      .first();
    if (existing) return;
    await queueDB.mutations.add(item);
  });
}

export async function updateMutationStatusTransactional(
  id: string,
  updates: Partial<StoredMutation>
): Promise<void> {
  await queueDB.transaction('rw', queueDB.mutations, async () => {
    const item = await queueDB.mutations.get(id);
    if (!item) return;
    Object.assign(item, updates);
    await queueDB.mutations.put(item);
  });
}

export async function moveToDeadLetter(
  item: StoredMutation
): Promise<void> {
  await queueDB.transaction('rw', [queueDB.mutations, queueDB.deadLetters], async () => {
    await queueDB.mutations.delete(item.id);
    await queueDB.deadLetters.add({
      id: crypto.randomUUID(),
      originalMutationId: item.id,
      operation: item.operation,
      params: item.params,
      idempotencyKey: item.idempotencyKey,
      failCount: item.retryCount,
      lastError: item.lastError || 'Unknown',
      createdAt: item.createdAt,
      failedAt: new Date().toISOString(),
      version: item.version,
    });
  });
}

export async function migrateFromLocalStorage(): Promise<{
  migrated: number;
  failed: number;
  errors: string[];
}> {
  const raw = localStorage.getItem('highlands_mutation_queue');
  if (!raw) return { migrated: 0, failed: 0, errors: [] };

  let items: StoredMutation[];
  try {
    items = JSON.parse(raw) as StoredMutation[];
  } catch {
    logger.error('localstorage_queue_corrupted', 'queue-db', {});
    return { migrated: 0, failed: 1, errors: ['Queue data corrupted in localStorage'] };
  }

  const errors: string[] = [];
  let migrated = 0;

  for (const item of items) {
    try {
      const existing = await queueDB.mutations.get(item.id);
      if (!existing) {
        await queueDB.mutations.add({ ...item, version: CURRENT_SCHEMA_VERSION });
      }
      migrated++;
    } catch (e) {
      errors.push(`Item ${item.id}: ${(e as Error).message}`);
    }
  }

  if (errors.length === 0) {
    localStorage.removeItem('highlands_mutation_queue');
    logger.audit('localstorage_queue_migrated', 'queue-db', {
      metadata: { count: migrated },
      operation: 'migration',
    });
  }

  return { migrated, failed: errors.length, errors };
}

export async function checkQueueIntegrity(): Promise<{
  valid: boolean;
  corruptionCount: number;
  totalItems: number;
  details: string[];
}> {
  const details: string[] = [];
  let corruptionCount = 0;

  const items = await queueDB.mutations.toArray();
  for (const item of items) {
    if (!item.id || !item.operation || !item.idempotencyKey) {
      details.push(`Invalid mutation: ${item.id}`);
      corruptionCount++;
      continue;
    }
    if (!['pending', 'processing', 'completed', 'failed', 'dead'].includes(item.status)) {
      details.push(`Invalid status on ${item.id}: ${item.status}`);
      corruptionCount++;
    }
  }

  return {
    valid: corruptionCount === 0,
    corruptionCount,
    totalItems: items.length,
    details,
  };
}

export async function recoverCorruptedQueue(): Promise<void> {
  const integrity = await checkQueueIntegrity();
  if (integrity.valid) return;

  logger.warn('queue_corruption_recovering', 'queue-db', {
    metadata: { corruptionCount: integrity.corruptionCount, details: integrity.details },
  });

  for (const detail of integrity.details) {
    const idMatch = detail.match(/^Invalid.*: (.+)$/);
    if (idMatch) {
      await queueDB.mutations.delete(idMatch[1]);
    }
  }

  logger.audit('queue_corruption_recovered', 'queue-db', {
    metadata: { removedCount: integrity.corruptionCount },
    operation: 'recovery',
  });
}

const STORAGE_KEY = 'highlands_mutation_queue';

export async function verifyParity(): Promise<{
  inSync: boolean;
  indexDbCount: number;
  localStorageCount: number;
  mismatches: string[];
}> {
  const idbItems = await queueDB.mutations.toArray();
  let lsItems: Array<Record<string, unknown>> = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) lsItems = JSON.parse(raw);
  } catch { /* empty */ }

  const mismatches: string[] = [];
  const idbMap = new Map(idbItems.map(i => [i.id, i]));

  for (const ls of lsItems) {
    const idb = idbMap.get(ls.id as string);
    if (!idb) {
      mismatches.push(`Item ${ls.id} missing from IndexedDB`);
      continue;
    }
    if (idb.status !== ls.status || idb.retryCount !== ls.retryCount) {
      mismatches.push(`Item ${ls.id}: status ${idb.status} vs ${ls.status} or retry ${idb.retryCount} vs ${ls.retryCount}`);
    }
  }

  return {
    inSync: mismatches.length === 0 && idbItems.length === lsItems.length,
    indexDbCount: idbItems.length,
    localStorageCount: lsItems.length,
    mismatches,
  };
}

export async function shouldDisableLocalStorage(): Promise<boolean> {
  const parity = await verifyParity();
  if (!parity.inSync) {
    logger.warn('parity_check_failed_keeping_dual_write', 'queue-db', {
      metadata: { mismatches: parity.mismatches },
    });
    return false;
  }

  const checkKey = 'highlands_parity_checks';
  const raw = localStorage.getItem(checkKey);
  const checks: boolean[] = raw ? JSON.parse(raw) : [];

  checks.push(true);
  if (checks.length > 10) checks.shift();
  localStorage.setItem(checkKey, JSON.stringify(checks));

  return checks.length >= 10 && checks.every(Boolean);
}

export { CURRENT_SCHEMA_VERSION };
