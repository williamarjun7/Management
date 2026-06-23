import { logger } from './logger';

type LeaderState = 'leading' | 'following' | 'contesting';

const CHANNEL_NAME = 'highlands-queue-leader';
const channel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel(CHANNEL_NAME)
  : null;

const LOCK_NAME = 'highlands-queue-processor';
const HEARTBEAT_INTERVAL = 5000;
const STALE_LEADER_MS = 15000;

interface LeaderInfo {
  tabId: string;
  deviceId: string;
  lastHeartbeat: number;
  lastBroadcast: number;
}

let currentState: LeaderState = 'contesting';
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let watchTimer: ReturnType<typeof setInterval> | null = null;
let onBecomeLeader: (() => void) | null = null;
let onLoseLeadership: (() => void) | null = null;
let lastBroadcastSeen = 0;

function writeHeartbeat() {
  const info: LeaderInfo = {
    tabId: logger.getTabId(),
    deviceId: logger.getDeviceId(),
    lastHeartbeat: Date.now(),
    lastBroadcast: lastBroadcastSeen,
  };
  try {
    localStorage.setItem('highlands_queue_leader', JSON.stringify(info));
  } catch { /* silent */ }
  channel?.postMessage({ type: 'heartbeat', ...info });
}

function readHeartbeat(): LeaderInfo | null {
  try {
    const raw = localStorage.getItem('highlands_queue_leader');
    return raw ? JSON.parse(raw) as LeaderInfo : null;
  } catch { return null; }
}

function isLeaderStale(): boolean {
  const info = readHeartbeat();
  if (!info) return true;
  const heartbeatStale = Date.now() - info.lastHeartbeat > STALE_LEADER_MS;
  const broadcastSilent = Date.now() - lastBroadcastSeen > STALE_LEADER_MS;
  if (!channel) return heartbeatStale;
  return heartbeatStale && broadcastSilent;
}

export async function contestLeadership(
  onLead: () => void,
  onFollow: () => void
): Promise<void> {
  clearTimers();
  onBecomeLeader = onLead;
  onLoseLeadership = onFollow;

  if (channel) {
    channel.onmessage = (event) => {
      if (event.data?.type === 'heartbeat' && event.data.tabId !== logger.getTabId()) {
        lastBroadcastSeen = Date.now();
      }
      if (event.data?.type === 'leader_elected' && event.data.tabId !== logger.getTabId()) {
        lastBroadcastSeen = Date.now();
        logger.info('leader_announced_by_other_tab', 'queue-leader', {
          metadata: { otherTabId: event.data.tabId },
        });
      }
    };
  }

  try {
    await navigator.locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (lock === null) {
        currentState = 'following';
        logger.info('queue_leader_following', 'queue-leader');
        onFollow();
        watchForLeaderLoss();
        return;
      }

      currentState = 'leading';
      logger.info('queue_leader_elected', 'queue-leader', {
        metadata: { tabId: logger.getTabId() },
      });

      clearTimers();
      writeHeartbeat();
      channel?.postMessage({ type: 'leader_elected', tabId: logger.getTabId() });
      heartbeatTimer = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL);

      try {
        onLead();
      } catch (err) {
        logger.error('leader_onlead_failed', 'queue-leader', {
          metadata: { error: (err as Error)?.message },
        });
      }

      await new Promise(() => {});
    });
  } catch (err) {
    logger.warn('lock_api_unavailable_fallback_broadcast', 'queue-leader', {
      metadata: { error: (err as Error).message },
    });
    startFallbackCoordination(onLead, onFollow);
  }
}

function clearTimers(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (watchTimer) {
    clearInterval(watchTimer);
    watchTimer = null;
  }
}

function startFallbackCoordination(onLead: () => void, onFollow: () => void) {
  const check = () => {
    if (isLeaderStale()) {
      writeHeartbeat();
      channel?.postMessage({ type: 'leader_elected', tabId: logger.getTabId() });
      if (currentState !== 'leading') {
        currentState = 'leading';
        logger.info('queue_leader_elected_fallback', 'queue-leader');
        onLead();
      }
    } else {
      if (currentState !== 'following') {
        currentState = 'following';
        onFollow();
      }
    }
  };

  clearTimers();
  check();
  heartbeatTimer = setInterval(check, HEARTBEAT_INTERVAL);
}

function watchForLeaderLoss() {
  clearTimers();
  watchTimer = setInterval(() => {
    if (isLeaderStale() && currentState === 'following') {
      logger.debug('leader_stale_recontesting', 'queue-leader');
      currentState = 'contesting';
      contestLeadership(onBecomeLeader!, onLoseLeadership!);
    }
  }, HEARTBEAT_INTERVAL);
}

export function getLeaderState(): LeaderState {
  return currentState;
}

export function cleanup() {
  clearTimers();
  channel?.close();
}

export function amILeader(): boolean {
  return currentState === 'leading';
}
