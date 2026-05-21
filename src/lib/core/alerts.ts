import { logger } from '../services/logger';
import { getCircuitState } from '../services/circuit-breaker';
import { getQueueHealth } from '../services/mutation-queue';
import { verifyParity, queueDB } from '../services/queue-db';
import { getTelemetry } from '../services/telemetry';

export type AlertSeverity = 'info' | 'warning' | 'critical' | 'immediate';

export interface AlertRule {
  name: string;
  description: string;
  severity: AlertSeverity;
  check: () => Promise<AlertResult | null>;
  cooldownMs: number;
  lastFiredAt?: number;
}

export interface AlertResult {
  triggered: true;
  message: string;
  metadata?: Record<string, unknown>;
}

const RULES: AlertRule[] = [
  {
    name: 'dead_letters_detected',
    description: 'Dead letters > 0',
    severity: 'immediate',
    cooldownMs: 60000,
    check: async () => {
      const { queueDB } = await import('../services/queue-db');
      const count = await queueDB.deadLetters.count();
      if (count > 0) return { triggered: true, message: `${count} dead letter(s) in queue`, metadata: { count } };
      return null;
    },
  },
  {
    name: 'queue_stalled',
    description: 'Queue oldest item > 5 min',
    severity: 'warning',
    cooldownMs: 120000,
    check: async () => {
      const health = await getQueueHealth();
      if (health.queueSize > 0 && health.oldestItemAgeMs > 300000) {
        return {
          triggered: true,
          message: `Queue stalled: oldest item ${Math.round(health.oldestItemAgeMs / 1000)}s old, ${health.queueSize} items`,
          metadata: { oldestAgeMs: health.oldestItemAgeMs, queueSize: health.queueSize },
        };
      }
      return null;
    },
  },
  {
    name: 'circuit_open_prolonged',
    description: 'Circuit OPEN > 2 min',
    severity: 'critical',
    cooldownMs: 120000,
    check: async () => {
      const circuit = getCircuitState();
      if (circuit.state === 'OPEN') {
        return { triggered: true, message: 'Circuit breaker is OPEN — RPC calls blocked', metadata: { failuresInWindow: circuit.failuresInWindow } };
      }
      return null;
    },
  },
  {
    name: 'parity_mismatch',
    description: 'IndexedDB / localStorage parity mismatch',
    severity: 'critical',
    cooldownMs: 300000,
    check: async () => {
      const parity = await verifyParity();
      if (!parity.inSync) {
        return {
          triggered: true,
          message: `Parity mismatch: IndexedDB has ${parity.indexDbCount} items, localStorage has ${parity.localStorageCount}`,
          metadata: { mismatches: parity.mismatches },
        };
      }
      return null;
    },
  },
  {
    name: 'payment_retry_spike',
    description: 'Payment retry count spikes',
    severity: 'warning',
    cooldownMs: 300000,
    check: async () => {
      const { queueDB } = await import('../services/queue-db');
      const highRetries = await queueDB.mutations
        .where('retryCount')
        .above(3)
        .toArray();
      if (highRetries.length > 0) {
        return {
          triggered: true,
          message: `${highRetries.length} mutation(s) with retryCount > 3`,
          metadata: { items: highRetries.map(i => ({ id: i.id, operation: i.operation, retryCount: i.retryCount, lastError: i.lastError })) },
        };
      }
      return null;
    },
  },
  {
    name: 'fatal_errors',
    description: 'Sentry fatal errors detected',
    severity: 'immediate',
    cooldownMs: 60000,
    check: async () => {
      const { queueDB } = await import('../services/queue-db');
      const count = await queueDB.deadLetters.count();
      if (count > 0) {
        const dead = await queueDB.deadLetters.limit(20).toArray();
        return {
          triggered: true,
          message: `${count} mutation(s) moved to dead letter queue`,
          metadata: { items: dead.map(i => ({ operation: i.operation, lastError: i.lastError, failCount: i.failCount })) },
        };
      }
      return null;
    },
  },
  {
    name: 'websocket_reconnect_storm',
    description: '> 5 websocket reconnects in 5 minutes',
    severity: 'warning',
    cooldownMs: 120000,
    check: async () => {
      const fiveMinAgo = Date.now() - 300000;
      const reconnects = getTelemetry('websocket_reconnect', fiveMinAgo);
      if (reconnects.length > 5) {
        return {
          triggered: true,
          message: `Websocket reconnect storm: ${reconnects.length} reconnects in 5 minutes`,
          metadata: { count: reconnects.length, windowMs: 300000 },
        };
      }
      return null;
    },
  },
  {
    name: 'auth_refresh_failures',
    description: '> 3 auth refresh failures in 5 minutes',
    severity: 'warning',
    cooldownMs: 120000,
    check: async () => {
      const fiveMinAgo = Date.now() - 300000;
      const failures = getTelemetry('auth_refresh_failed', fiveMinAgo);
      if (failures.length > 3) {
        return {
          triggered: true,
          message: `Auth refresh failure spike: ${failures.length} failures in 5 minutes`,
          metadata: { count: failures.length, windowMs: 300000 },
        };
      }
      return null;
    },
  },
  {
    name: 'rpc_latency_spike',
    description: '> 10 RPC calls with latency > 5s in 5 minutes',
    severity: 'warning',
    cooldownMs: 120000,
    check: async () => {
      const fiveMinAgo = Date.now() - 300000;
      const slowRpcs = getTelemetry('rpc_latency', fiveMinAgo)
        .filter((e) => (e.payload.duration_ms as number) > 5000);
      if (slowRpcs.length > 10) {
        return {
          triggered: true,
          message: `RPC latency spike: ${slowRpcs.length} slow calls > 5s in 5 minutes`,
          metadata: { count: slowRpcs.length, thresholdMs: 5000, windowMs: 300000 },
        };
      }
      return null;
    },
  },
  {
    name: 'telemetry_queue_saturation',
    description: 'Telemetry events > 3000 in localStorage',
    severity: 'info',
    cooldownMs: 300000,
    check: async () => {
      const stored = getTelemetry();
      if (stored.length > 3000) {
        return {
          triggered: true,
          message: `Telemetry queue saturation: ${stored.length} events in localStorage (cap: 5000)`,
          metadata: { count: stored.length, cap: 5000 },
        };
      }
      return null;
    },
  },
  {
    name: 'duplicate_mutation_detected',
    description: '> 5 mutations with duplicate idempotency keys',
    severity: 'warning',
    cooldownMs: 300000,
    check: async () => {
      const items = await queueDB.mutations.limit(1000).toArray();
      const idempotencyCounts = new Map<string, number>();
      for (const item of items) {
        idempotencyCounts.set(item.idempotencyKey, (idempotencyCounts.get(item.idempotencyKey) || 0) + 1);
      }
      const duplicates = Array.from(idempotencyCounts.entries()).filter(([, count]) => count > 5);
      if (duplicates.length > 0) {
        return {
          triggered: true,
          message: `${duplicates.length} idempotency key(s) with > 5 mutations (of last 1000)`,
          metadata: { duplicates: duplicates.map(([key, count]) => ({ key, count })) },
        };
      }
      return null;
    },
  },
  {
    name: 'stale_room_state_detected',
    description: 'Rooms in transitional state > 30 minutes',
    severity: 'info',
    cooldownMs: 600000,
    check: async () => {
      try {
        const { data, error } = await (await import('./insforge')).insforge.database
          .from('rooms')
          .select('id, room_number, status, updated_at')
          .in('status', ['cleaning', 'maintenance', 'checked_in']);
        if (error || !data) return null;
        const now = Date.now();
        const staleThreshold = 30 * 60 * 1000;
        const stale = data.filter((r: Record<string, unknown>) => {
          const updated = new Date(r.updated_at as string).getTime();
          return now - updated > staleThreshold;
        });
        if (stale.length > 3) {
          return {
            triggered: true,
            message: `${stale.length} room(s) in stale status > 30 minutes`,
            metadata: { rooms: stale.map((r: Record<string, unknown>) => ({ id: r.id, room: r.room_number, status: r.status })) },
          };
        }
      } catch { /* skip if rooms table doesn't exist */ }
      return null;
    },
  },
  {
    name: 'inventory_desync_detected',
    description: 'Products with negative stock quantity',
    severity: 'critical',
    cooldownMs: 300000,
    check: async () => {
      try {
        const { data, error } = await (await import('./insforge')).insforge.database
          .from('products')
          .select('id, name, stock_quantity')
          .lt('stock_quantity', 0);
        if (error || !data) return null;
        if (data.length > 0) {
          return {
            triggered: true,
            message: `${data.length} product(s) with negative stock`,
            metadata: { items: data.map((p: Record<string, unknown>) => ({ id: p.id, name: p.name, stock: p.stock_quantity })) },
          };
        }
      } catch { /* skip if products table doesn't exist */ }
      return null;
    },
  },
];

export function getAlertRules(): AlertRule[] {
  return RULES;
}

export async function evaluateAlerts(): Promise<AlertResult[]> {
  const now = Date.now();

  const results = await Promise.allSettled(
    RULES.map(async (rule) => {
      if (rule.lastFiredAt && now - rule.lastFiredAt < rule.cooldownMs) return null;

      const result = await rule.check();
      if (result) {
        rule.lastFiredAt = now;
        const level = rule.severity === 'immediate' || rule.severity === 'critical' ? 'error' : 'warn';
        logger[level](`ALERT: ${rule.name}`, 'alerts', {
          metadata: { message: result.message, severity: rule.severity, ...result.metadata },
        });
        return result;
      }
      return null;
    })
  );

  const fired: AlertResult[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      fired.push(r.value);
    } else if (r.status === 'rejected') {
      logger.error('alert_check_failed', 'alerts', {
        metadata: { error: (r.reason as Error)?.message },
      });
    }
  }

  return fired;
}

export async function startAlertPolling(intervalMs = 30000): Promise<ReturnType<typeof setInterval>> {
  const interval = setInterval(() => {
    evaluateAlerts().catch((err) => {
      logger.error('alert_polling_error', 'alerts', {
        metadata: { error: (err as Error).message },
      });
    });
  }, intervalMs);
  return interval;
}

export function formatAlertMessage(result: AlertResult, rule: AlertRule): string {
  return `[${rule.severity.toUpperCase()}] ${rule.name}: ${result.message}`;
}
