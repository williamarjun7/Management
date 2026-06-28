import { logger } from './logger';
import { queueDB } from './queue-db';

export interface CleanupResult {
  telemetryRemoved: number;
  completedMutationsRemoved: number;
  totalDurationMs: number;
}

const TELEMETRY_RETENTION_DAYS = 30;
const MUTATION_RETENTION_DAYS = 7;

async function cleanupTelemetry(retentionDays = TELEMETRY_RETENTION_DAYS): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
    const count = await queueDB.telemetry
      .where('timestamp')
      .below(cutoff)
      .delete();
    return count;
  } catch (err) {
    logger.warn('cleanup_telemetry_failed', 'system', {
      metadata: { error: (err as Error)?.message },
    });
    return 0;
  }
}

async function cleanupCompletedMutations(retentionDays = MUTATION_RETENTION_DAYS): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
    const count = await queueDB.mutations
      .where('createdAt')
      .below(cutoff)
      .and(item => item.status === 'completed')
      .delete();
    return count;
  } catch (err) {
    logger.warn('cleanup_mutations_failed', 'system', {
      metadata: { error: (err as Error)?.message },
    });
    return 0;
  }
}

export async function runCleanup(options?: {
  telemetryRetentionDays?: number;
  mutationRetentionDays?: number;
}): Promise<CleanupResult> {
  const startMs = performance.now();
  const [telemetryRemoved, completedMutationsRemoved] = await Promise.all([
    cleanupTelemetry(options?.telemetryRetentionDays),
    cleanupCompletedMutations(options?.mutationRetentionDays),
  ]);
  const totalDurationMs = performance.now() - startMs;
  logger.info('cleanup_complete', 'system', {
    metadata: { telemetryRemoved, completedMutationsRemoved, durationMs: totalDurationMs },
  });
  return { telemetryRemoved, completedMutationsRemoved, totalDurationMs };
}

export async function scheduleCleanup(intervalMs = 86400000): Promise<() => void> {
  const id = setInterval(async () => {
    try {
      await runCleanup();
    } catch (err) {
      logger.error('scheduled_cleanup_failed', 'system', {
        metadata: { error: (err as Error)?.message },
      });
    }
  }, intervalMs);
  return () => clearInterval(id);
}
