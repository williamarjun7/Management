import { recordTelemetry } from './telemetry';

const OBSERVATION_KEY = 'highlands_observation';

interface FrictionEvent {
  ts: number;
  type: FrictionType;
  detail: string;
  trace_id: string;
}

type FrictionType =
  | 'repeated_click'
  | 'abandoned_flow'
  | 'excessive_retry'
  | 'confirm_cancelled'
  | 'slow_operation'
  | 'backtrack'
  | 'failed_action';

const MAX_CLICK_ENTRIES = 200;
const MAX_FLOW_ENTRIES = 50;
const clickCounts = new Map<string, { count: number; lastTs: number }>();
const flowStartTimes = new Map<string, number>();

function trimMap<K, V>(map: Map<K, V>, max: number): void {
  if (map.size <= max) return;
  const toDelete = map.size - max;
  const iter = map.keys();
  for (let i = 0; i < toDelete; i++) {
    const key = iter.next();
    if (key.done) break;
    map.delete(key.value);
  }
}

function loadFriction(): FrictionEvent[] {
  try {
    const raw = localStorage.getItem(OBSERVATION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFriction(events: FrictionEvent[]): void {
  try {
    const trimmed = events.slice(-500);
    localStorage.setItem(OBSERVATION_KEY, JSON.stringify(trimmed));
  } catch { /* noop */ }
}

function recordFriction(type: FrictionType, detail: string, trace_id: string): void {
  const events = loadFriction();
  events.push({ ts: Date.now(), type, detail, trace_id });
  saveFriction(events);
}

/** Track repeated clicks on the same target (potential confusion/fatigue). */
export function observeClick(target: string): void {
  const now = Date.now();
  const entry = clickCounts.get(target);
  if (!entry) {
    clickCounts.set(target, { count: 1, lastTs: now });
    trimMap(clickCounts, MAX_CLICK_ENTRIES);
    return;
  }
  if (now - entry.lastTs < 3000) {
    entry.count++;
    if (entry.count === 3) {
      recordFriction('repeated_click', `Repeated clicks on: ${target}`, crypto.randomUUID());
    }
  } else {
    entry.count = 1;
  }
  entry.lastTs = now;
}

/** Track flow start (e.g., payment modal opened, check-in clicked). */
export function observeFlowStart(flowName: string): void {
  flowStartTimes.set(flowName, Date.now());
  trimMap(flowStartTimes, MAX_FLOW_ENTRIES);
}

/** Track flow abandonment (modal closed without completion). */
export function observeFlowEnd(flowName: string, completed: boolean): void {
  const start = flowStartTimes.get(flowName);
  if (!start) return;
  flowStartTimes.delete(flowName);
  if (!completed) {
    recordFriction('abandoned_flow', `Abandoned: ${flowName}`, crypto.randomUUID());
  }
  const duration = Date.now() - start;
  if (duration > 30000) {
    recordFriction('slow_operation', `Slow: ${flowName} took ${Math.round(duration / 1000)}s`, crypto.randomUUID());
  }
}

/** Track excessive retries. */
export function observeRetry(operation: string): void {
  const key = `retry:${operation}`;
  const now = Date.now();
  const entry = clickCounts.get(key);
  if (!entry) {
    clickCounts.set(key, { count: 1, lastTs: now });
    return;
  }
  entry.count++;
  entry.lastTs = now;
  if (entry.count >= 3) {
    recordFriction('excessive_retry', `Retried ${operation} ${entry.count}x`, crypto.randomUUID());
  }
}

/** Track cancelled confirmations. */
export function observeConfirmCancelled(entity: string): void {
  recordFriction('confirm_cancelled', `Cancelled confirm: ${entity}`, crypto.randomUUID());
  recordTelemetry('confirm_cancelled', crypto.randomUUID(), { entity });
}

/** Track backtracking (navigating away without completing). */
export function observeBacktrack(from: string, to: string): void {
  recordFriction('backtrack', `${from} → ${to}`, crypto.randomUUID());
}

/** Get all friction events for observation. */
export function getFrictionEvents(): FrictionEvent[] {
  return loadFriction();
}
