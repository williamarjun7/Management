import 'fake-indexeddb/auto';
import { beforeAll, afterAll, vi } from 'vitest';

// Set required env vars so insforge.ts doesn't throw at module level
const processEnv = { VITE_INSFORGE_URL: 'http://localhost:3000', VITE_INSFORGE_ANON_KEY: 'test-anon-key' };
(globalThis as any).process = { env: processEnv };

// Ensure indexedDB is on globalThis (some Vitest environments sandbox globals)
if (typeof (globalThis as any).indexedDB === 'undefined' && typeof (globalThis as any).global !== 'undefined') {
  (globalThis as any).indexedDB = (globalThis as any).global.indexedDB;
}

// ── localStorage polyfill for Node.js ──
const store = new Map<string, string>();
const localStorageMock: Storage = {
  getItem: (key: string): string | null => store.get(key) ?? null,
  setItem: (key: string, value: string): void => { store.set(key, value); },
  removeItem: (key: string): void => { store.delete(key); },
  clear: (): void => { store.clear(); },
  get length(): number { return store.size; },
  key: (index: number): string | null => [...store.keys()][index] ?? null,
};
vi.stubGlobal('localStorage', localStorageMock);

// ── sessionStorage polyfill ──
const sessionStore = new Map<string, string>();
const sessionStorageMock: Storage = {
  getItem: (key: string): string | null => sessionStore.get(key) ?? null,
  setItem: (key: string, value: string): void => { sessionStore.set(key, value); },
  removeItem: (key: string): void => { sessionStore.delete(key); },
  clear: (): void => { sessionStore.clear(); },
  get length(): number { return sessionStore.size; },
  key: (index: number): string | null => [...sessionStore.keys()][index] ?? null,
};
vi.stubGlobal('sessionStorage', sessionStorageMock);

// ── BroadcastChannel polyfill ──
const channels = new Map<string, Set<{ postMessage: (data: unknown) => void; close: () => void }>>();

class MockBroadcastChannel {
  readonly name: string;
  private _listeners: Map<string, Set<(event: MessageEvent) => void>> = new Map();

  constructor(name: string) {
    this.name = name;
    if (!channels.has(name)) channels.set(name, new Set());
    channels.get(name)!.add(this);
  }

  postMessage(data: unknown): void {
    const others = channels.get(this.name);
    if (!others) return;
    for (const ch of others) {
      if (ch !== this) {
        const handlers = this._listeners.get('message');
        if (handlers) {
          for (const h of handlers) h(new MessageEvent('message', { data }));
        }
      }
    }
  }

  addEventListener(type: string, handler: (event: MessageEvent) => void): void {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type)!.add(handler);
  }

  removeEventListener(type: string, handler: (event: MessageEvent) => void): void {
    this._listeners.get(type)?.delete(handler);
  }

  close(): void {
    channels.get(this.name)?.delete(this);
    this._listeners.clear();
  }
}

globalThis.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel;

// ── Window mock (for code that checks typeof window !== 'undefined') ──
class MockStorageEvent extends Event {
  readonly key: string | null;
  readonly newValue: string | null;
  readonly oldValue: string | null;
  constructor(type: string, init?: { key?: string; newValue?: string; oldValue?: string }) {
    super(type);
    this.key = init?.key ?? null;
    this.newValue = init?.newValue ?? null;
    this.oldValue = init?.oldValue ?? null;
  }
}

if (typeof globalThis.window === 'undefined') {
  const windowListeners = new Map<string, Set<(event: Event) => void>>();
  const mockWindow: {
    addEventListener: (type: string, handler: (event: Event) => void) => void;
    removeEventListener: (type: string, handler: (event: Event) => void) => void;
    dispatchEvent: (event: Event) => boolean;
    location: { search: string };
  } = {
    addEventListener: (type: string, handler: (event: Event) => void) => {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type)!.add(handler);
    },
    removeEventListener: (type: string, handler: (event: Event) => void) => {
      windowListeners.get(type)?.delete(handler);
    },
    dispatchEvent: (event: Event): boolean => {
      const handlers = windowListeners.get(event.type);
      if (handlers) {
        for (const h of handlers) h(event);
      }
      return true;
    },
    location: { search: '' },
  };
  (globalThis as any).window = mockWindow;
  (globalThis as any).StorageEvent = MockStorageEvent;
}

// ── Web Locks API mock ──
const lockHolders = new Map<string, string>();

vi.stubGlobal('navigator', {
  onLine: true,
  userAgent: 'vitest',
  locks: {
    request: async (
      name: string,
      options: { ifAvailable?: boolean } | ((lock: unknown) => void | Promise<void>),
      callback?: (lock: unknown) => void | Promise<void>
    ): Promise<void> => {
      const cb = typeof options === 'function' ? options : callback!;
      const ifAvailable = typeof options === 'object' ? options.ifAvailable : false;

      if (lockHolders.has(name) && ifAvailable) {
        await cb(null);
        return;
      }

      lockHolders.set(name, 'locked');
      await cb({ mode: 'exclusive', name });
      lockHolders.delete(name);
    },
  },
});

// ── InsForge SDK mock ──
type RpcMockHandler = (params: Record<string, unknown>) => { data?: unknown; error?: unknown } | Promise<{ data?: unknown; error?: unknown }>;

let rpcDelayMs = 0;
const rpcHandlers = new Map<string, RpcMockHandler>();
let rpcCallHistory: Array<{ name: string; params: Record<string, unknown> }> = [];

vi.mock('../insforge', () => ({
  insforge: {
    database: {
      rpc: vi.fn(async (name: string, params: Record<string, unknown>) => {
        rpcCallHistory.push({ name, params });

        if (rpcDelayMs > 0) {
          await new Promise((r) => setTimeout(r, rpcDelayMs));
        }

        const handler = rpcHandlers.get(name);
        if (handler) return await handler(params);
        return { data: {}, error: null };
      }),
    },
    realtime: {
      connect: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    },
  },
}));

export function setRpcHandler(name: string, handler: RpcMockHandler): void {
  rpcHandlers.set(name, handler);
}

export function setRpcDelay(ms: number): void {
  rpcDelayMs = ms;
}

export function getRpcCallHistory(): Array<{ name: string; params: Record<string, unknown> }> {
  return [...rpcCallHistory];
}

export function clearRpcCallHistory(): void {
  rpcCallHistory = [];
}

export function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: online,
  });
}

export function clearAllMocks(): void {
  rpcHandlers.clear();
  rpcDelayMs = 0;
  rpcCallHistory = [];
  lockHolders.clear();
  channels.clear();
  setOnline(true);
  localStorage.clear();
  sessionStorage.clear();
}

beforeAll(() => {
  setOnline(true);
});

afterAll(() => {
  clearAllMocks();
});
