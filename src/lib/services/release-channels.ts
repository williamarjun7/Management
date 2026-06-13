// ── Release Channel Configuration ──
// Provides graduated rollout gates: stable → beta → canary
// Each channel includes all features from lower channels.

export type ReleaseChannel = 'stable' | 'beta' | 'canary';

export interface ChannelGate {
  feature: string;
  minChannel: ReleaseChannel;
  description: string;
}

const CHANNEL_STORAGE_KEY = 'highlands_release_channel';
const CHANNEL_OVERRIDE_PARAM = 'channel';

const CHANNEL_ORDER: Record<ReleaseChannel, number> = {
  stable: 1,
  beta: 2,
  canary: 3,
};

const CHANNEL_NAMES: ReleaseChannel[] = ['stable', 'beta', 'canary'];

// Feature-to-channel gates
export const CHANNEL_GATES: ChannelGate[] = [
  { feature: 'indexDbMode', minChannel: 'stable', description: 'IndexedDB as primary storage' },
  { feature: 'dualWriteMode', minChannel: 'stable', description: 'Dual-write to IndexedDB + localStorage' },
  { feature: 'circuitBreaker', minChannel: 'stable', description: 'Circuit breaker for RPC calls' },
  { feature: 'realtimeReplay', minChannel: 'beta', description: 'Realtime event replay on reconnect' },
  { feature: 'sentryReplay', minChannel: 'beta', description: 'Sentry session replay recording' },
  { feature: 'queueProcessing', minChannel: 'stable', description: 'Background mutation queue processing' },
  { feature: 'chaosMode', minChannel: 'canary', description: 'Chaos testing mode' },
];

function isValidChannel(s: string): s is ReleaseChannel {
  return CHANNEL_NAMES.includes(s as ReleaseChannel);
}

let currentChannel: ReleaseChannel | null = null;

function detectChannel(): ReleaseChannel {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const urlChannel = params.get(CHANNEL_OVERRIDE_PARAM);
    if (urlChannel && isValidChannel(urlChannel)) return urlChannel;
  }

  try {
    const raw = localStorage.getItem(CHANNEL_STORAGE_KEY);
    if (raw && isValidChannel(raw)) return raw;
  } catch { /* ignore */ }

  return 'stable';
}

export function getReleaseChannel(): ReleaseChannel {
  if (!currentChannel) currentChannel = detectChannel();
  return currentChannel;
}

export function setReleaseChannel(channel: ReleaseChannel): void {
  localStorage.setItem(CHANNEL_STORAGE_KEY, channel);
  currentChannel = channel;
}

export function resetReleaseChannel(): void {
  localStorage.removeItem(CHANNEL_STORAGE_KEY);
  currentChannel = null;
}

export function isAtLeast(channel: ReleaseChannel): boolean {
  return CHANNEL_ORDER[getReleaseChannel()] >= CHANNEL_ORDER[channel];
}

export function isFeatureAvailable(featureName: string): boolean {
  const gate = CHANNEL_GATES.find((g) => g.feature === featureName);
  if (!gate) return true;
  return isAtLeast(gate.minChannel);
}
