import { logger } from './logger';
import { insforge } from '../core/insforge';

export interface DeploymentStatus {
  healthy: boolean;
  checks: EnvironmentCheck[];
  startedAt: string;
  durationMs: number;
}

export interface EnvironmentCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  value?: string;
}

let cachedStatus: DeploymentStatus | null = null;

const REQUIRED_ENV_VARS = [
  { key: 'VITE_INSFORGE_URL', label: 'InsForge URL' },
  { key: 'VITE_INSFORGE_ANON_KEY', label: 'InsForge Anon Key' },
];

const OPTIONAL_ENV_VARS = [
  { key: 'VITE_SENTRY_DSN', label: 'Sentry DSN' },
];

function checkEnvironment(): EnvironmentCheck[] {
  const checks: EnvironmentCheck[] = [];
  for (const { key, label } of REQUIRED_ENV_VARS) {
    const val = import.meta.env[key] as string | undefined;
    checks.push({
      name: label,
      status: val ? 'pass' : 'fail',
      message: val ? `${label} configured` : `${label} is missing`,
      value: val ? `${val.slice(0, 30)}...` : undefined,
    });
  }
  for (const { key, label } of OPTIONAL_ENV_VARS) {
    const val = import.meta.env[key] as string | undefined;
    checks.push({
      name: label,
      status: val ? 'pass' : 'warn',
      message: val ? `${label} configured` : `${label} not set (optional)`,
      value: val ? 'configured' : undefined,
    });
  }
  return checks;
}

function checkBrowserCompat(): EnvironmentCheck[] {
  const checks: EnvironmentCheck[] = [];
  checks.push({
    name: 'localStorage',
    status: typeof localStorage !== 'undefined' ? 'pass' : 'fail',
    message: typeof localStorage !== 'undefined' ? 'localStorage available' : 'localStorage unavailable',
  });
  checks.push({
    name: 'indexedDB',
    status: typeof indexedDB !== 'undefined' ? 'pass' : 'fail',
    message: typeof indexedDB !== 'undefined' ? 'IndexedDB available' : 'IndexedDB unavailable',
  });
  checks.push({
    name: 'WebSocket',
    status: typeof WebSocket !== 'undefined' ? 'pass' : 'fail',
    message: typeof WebSocket !== 'undefined' ? 'WebSocket available' : 'WebSocket unavailable',
  });
  checks.push({
    name: 'crypto.randomUUID',
    status: typeof crypto?.randomUUID === 'function' ? 'pass' : 'warn',
    message: typeof crypto?.randomUUID === 'function' ? 'crypto.randomUUID available' : 'crypto.randomUUID unavailable (will use fallback)',
  });
  if (typeof crypto?.randomUUID !== 'function') {
    (crypto as unknown as Record<string, unknown>).randomUUID = () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
  }
  return checks;
}

async function checkDatabaseConnectivity(): Promise<EnvironmentCheck> {
  try {
    const start = performance.now();
    const { error } = await insforge.database
      .from('rooms')
      .select('id', { count: 'exact', head: true });
    const duration = performance.now() - start;
    if (error) {
      return { name: 'Database', status: 'fail', message: `DB query failed: ${error.message}`, value: `${duration.toFixed(0)}ms` };
    }
    return { name: 'Database', status: 'pass', message: 'Database reachable', value: `${duration.toFixed(0)}ms` };
  } catch (err) {
    return { name: 'Database', status: 'fail', message: `DB error: ${(err as Error)?.message}`, value: undefined };
  }
}

export async function runDeploymentChecks(): Promise<DeploymentStatus> {
  const startedAt = new Date().toISOString();
  const startMs = performance.now();
  const allChecks: EnvironmentCheck[] = [
    ...checkEnvironment(),
    ...checkBrowserCompat(),
    await checkDatabaseConnectivity(),
  ];
  const durationMs = performance.now() - startMs;
  const healthy = allChecks.every(c => c.status !== 'fail');
  cachedStatus = { healthy, checks: allChecks, startedAt, durationMs };
  logger.info('deployment_check', 'system', {
    metadata: { healthy, checkCount: allChecks.length, failed: allChecks.filter(c => c.status === 'fail').length, durationMs },
  });
  return cachedStatus;
}

export function getDeploymentStatus(): DeploymentStatus | null {
  return cachedStatus;
}

export function isDeploymentHealthy(): boolean {
  return cachedStatus?.healthy ?? true;
}
