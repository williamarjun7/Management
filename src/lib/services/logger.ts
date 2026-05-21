export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'audit';

export type OperationalCategory =
  | 'queue'
  | 'realtime'
  | 'auth'
  | 'payment'
  | 'order'
  | 'kitchen'
  | 'inventory'
  | 'motel'
  | 'storage'
  | 'circuit'
  | 'telemetry'
  | 'system'
  | 'security'
  | 'network'
  | 'workflow'
  | 'ui';

export const LOG_WEIGHTS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  audit: 4,
};

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  traceId?: string;
  tabId: string;
  deviceId?: string;
  operation?: string;
  retryCount?: number;
  queueItemId?: string;
  durationMs?: number;
  correlationId?: string;
  workflowId?: string;
  workflowStep?: string;
  category?: OperationalCategory;
  metadata?: Record<string, unknown>;
}

const TAB_ID = crypto.randomUUID();

function getDeviceId(): string {
  try {
    let id = localStorage.getItem('highlands_device_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('highlands_device_id', id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function getCorrelationId(): string | undefined {
  try {
    return sessionStorage.getItem('highlands_correlation_id') ?? undefined;
  } catch {
    return undefined;
  }
}

const MAX_ERROR_SNAPSHOTS = 20;
const ERROR_SNAPSHOT_KEY = 'highlands_error_snapshots';

function persistErrorSnapshot(entry: LogEntry): void {
  if (entry.level !== 'error') return;
  try {
    const raw = localStorage.getItem(ERROR_SNAPSHOT_KEY);
    const snapshots: LogEntry[] = raw ? JSON.parse(raw) : [];
    snapshots.push(entry);
    if (snapshots.length > MAX_ERROR_SNAPSHOTS) snapshots.splice(0, snapshots.length - MAX_ERROR_SNAPSHOTS);
    localStorage.setItem(ERROR_SNAPSHOT_KEY, JSON.stringify(snapshots));
  } catch {
    /* localStorage unavailable */
  }
}

export function getErrorSnapshots(): LogEntry[] {
  try {
    const raw = localStorage.getItem(ERROR_SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function clearErrorSnapshots(): void {
  try {
    localStorage.removeItem(ERROR_SNAPSHOT_KEY);
  } catch { /* silent */ }
}

function log(level: LogLevel, module: string, message: string, extra?: Partial<LogEntry>) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    tabId: TAB_ID,
    deviceId: getDeviceId(),
    correlationId: getCorrelationId(),
    ...extra,
  };

  const formatted = `[${entry.timestamp}] [${level.toUpperCase()}] [${module}] [tab:${entry.tabId.slice(0, 8)}] ${entry.message}`;

  switch (level) {
    case 'error':
      console.error(formatted, extra?.metadata ?? '');
      break;
    case 'warn':
      console.warn(formatted, extra?.metadata ?? '');
      break;
    case 'audit':
      console.info('[AUDIT]', formatted, extra?.metadata ?? '');
      break;
    default:
      console.log(formatted, extra?.metadata ?? '');
  }

  if (level === 'error' || level === 'audit') {
    persistCrashBreadcrumb(entry);
    persistOperationalLog(entry).catch(() => {});
  }
  if (level === 'error') {
    persistErrorSnapshot(entry);
  }
}

const MAX_BREADCRUMBS = 50;
function persistCrashBreadcrumb(entry: LogEntry) {
  try {
    const key = `highlands_crumb_${entry.tabId.slice(0, 8)}`;
    const raw = localStorage.getItem(key);
    const crumbs: LogEntry[] = raw ? JSON.parse(raw) : [];
    crumbs.push(entry);
    if (crumbs.length > MAX_BREADCRUMBS) crumbs.splice(0, crumbs.length - MAX_BREADCRUMBS);
    localStorage.setItem(key, JSON.stringify(crumbs));
  } catch { /* silent */ }
}

let operationalLogStore: { add: (e: LogEntry) => Promise<void> } | null = null;
export function attachLogStore(store: { add: (e: LogEntry) => Promise<void> }) {
  operationalLogStore = store;
}
async function persistOperationalLog(entry: LogEntry) {
  if (operationalLogStore) {
    await operationalLogStore.add(entry);
  }
}

export function getCrashBreadcrumbs(): LogEntry[] {
  try {
    const key = `highlands_crumb_${TAB_ID.slice(0, 8)}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function getLogsByCategory(category: OperationalCategory): LogEntry[] {
  try {
    const result: LogEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('highlands_crumb_')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const crumbs: LogEntry[] = JSON.parse(raw);
          result.push(...crumbs.filter((c) => c.category === category));
        }
      }
    }
    return result;
  } catch { return []; }
}

export function getLogsBySeverity(level: LogLevel): LogEntry[] {
  try {
    const result: LogEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('highlands_crumb_')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const crumbs: LogEntry[] = JSON.parse(raw);
          result.push(...crumbs.filter((c) => c.level === level));
        }
      }
    }
    return result;
  } catch { return []; }
}

export const logger = {
  debug: (m: string, mod: string, x?: Partial<LogEntry>) => log('debug', mod, m, x),
  info: (m: string, mod: string, x?: Partial<LogEntry>) => log('info', mod, m, x),
  warn: (m: string, mod: string, x?: Partial<LogEntry>) => log('warn', mod, m, x),
  error: (m: string, mod: string, x?: Partial<LogEntry>) => log('error', mod, m, x),
  audit: (m: string, mod: string, x?: Partial<LogEntry>) => log('audit', mod, m, x),
  getDeviceId,
  getTabId: () => TAB_ID,
};

export type { LogEntry as LogEntryType };
