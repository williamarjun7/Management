// ── Feature Flags System ──
// Allows disabling features without redeploying.
// Persisted to localStorage, overridable via URL params.

export interface FeatureFlags {
  indexDbMode: boolean;
  dualWriteMode: boolean;
  circuitBreaker: boolean;
  realtimeReplay: boolean;
  sentryReplay: boolean;
  queueProcessing: boolean;
  chaosMode: boolean;
}

const FLAG_STORAGE_KEY = 'highlands_feature_flags';

const DEFAULT_FLAGS: FeatureFlags = {
  indexDbMode: true,
  dualWriteMode: true,
  circuitBreaker: true,
  realtimeReplay: true,
  sentryReplay: true,
  queueProcessing: true,
  chaosMode: false,
};

function loadOverrides(): Partial<FeatureFlags> {
  try {
    const raw = localStorage.getItem(FLAG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function parseUrlParams(): Partial<FeatureFlags> {
  const params = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : ''
  );
  const overrides: Partial<FeatureFlags> = {};
  const validKeys = Object.keys(DEFAULT_FLAGS) as (keyof FeatureFlags)[];
  for (const key of validKeys) {
    const val = params.get(`ff_${key}`);
    if (val === 'true') overrides[key] = true;
    else if (val === 'false') overrides[key] = false;
  }
  return overrides;
}

let cached: FeatureFlags | null = null;

// Cross-tab feature flag sync
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === FLAG_STORAGE_KEY) {
      cached = null;
    }
  });
}

export function getFeatureFlags(): FeatureFlags {
  if (cached) return cached;

  const urlOverrides = parseUrlParams();
  const storageOverrides = loadOverrides();

  cached = {
    ...DEFAULT_FLAGS,
    ...storageOverrides,
    ...urlOverrides,  // URL params take highest precedence
  };

  return cached;
}

export function setFeatureFlag(key: keyof FeatureFlags, value: boolean): void {
  const overrides = loadOverrides();
  overrides[key] = value;
  localStorage.setItem(FLAG_STORAGE_KEY, JSON.stringify(overrides));
  cached = null;
}

export function resetFeatureFlags(): void {
  localStorage.removeItem(FLAG_STORAGE_KEY);
  cached = null;
}

// ── In-app flag check helpers ──

export function isIndexDbEnabled(): boolean {
  return getFeatureFlags().indexDbMode;
}

export function isDualWriteEnabled(): boolean {
  return getFeatureFlags().dualWriteMode;
}

export function isCircuitBreakerEnabled(): boolean {
  return getFeatureFlags().circuitBreaker;
}

export function isRealtimeReplayEnabled(): boolean {
  return getFeatureFlags().realtimeReplay;
}

export function isSentryReplayEnabled(): boolean {
  return getFeatureFlags().sentryReplay;
}

export function isQueueProcessingEnabled(): boolean {
  return getFeatureFlags().queueProcessing;
}

export function isChaosModeEnabled(): boolean {
  return getFeatureFlags().chaosMode;
}
