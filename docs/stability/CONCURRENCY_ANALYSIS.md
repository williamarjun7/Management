# Concurrency & Race Condition Analysis

**Generated:** 2026-05-17
**Scope:** All async workflows, shared state, mutex usage, and cross-tab coordination.

---

## Concurrency Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Browser Tab 1                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │Mutation  │  │Realtime  │  │Auth                  │   │
│  │Queue     │  │WS Client │  │Session               │   │
│  │(drain    │  │(subs     │  │(refresh, focus)      │   │
│  │ mutex)   │  │ per tab) │  │                      │   │
│  └────┬─────┘  └────┬─────┘  └──────────┬───────────┘   │
│       │              │                   │               │
│       └──────────────┼───────────────────┘               │
│                      │                                   │
│              ┌───────┴────────┐                          │
│              │  Shared State  │                          │
│              │  - IndexedDB   │                          │
│              │  - localStorage│                          │
│              │  - BroadcastCh │                          │
│              └───────┬────────┘                          │
│                      │                                   │
├──────────────────────┼───────────────────────────────────┤
│              ┌───────┴────────┐                          │
│              │  Browser Tab 2  │                          │
│              │  (same origin)  │                          │
│              └────────────────┘                          │
└──────────────────────────────────────────────────────────┘
        │                                      │
        │         Web Locks API                │
        │         BroadcastChannel             │
        │         localStorage                 │
        v                                      v
   ┌──────────────────────────────────────────────┐
   │              Leader Election                  │
   │  ┌──────────────┐  ┌──────────────────────┐   │
   │  │  Web Locks   │  │  Fallback:           │   │
   │  │  (primary)   │  │  BroadcastChannel +  │   │
   │  │              │  │  localStorage polls  │   │
   │  └──────────────┘  └──────────────────────┘   │
   └──────────────────────────────────────────────┘
```

---

## Race Conditions Identified

### RC1: Queue Drain — Leader Change Mid-Processing

**File:** `src/lib/mutation-queue.ts`
**Severity:** HIGH

```
Tab A (Leader):                          Tab B:
  processMutationQueue()
  amILeader() = true
    ├── acquire drainMutex
    ├── read items from DB
    ├── process item 1
    ├── process item 2
    ├── [leadership lost]                watchForLeaderLoss()
    ├── process item 3 (still running!)   contestLeadership() → becomes leader
    ├── update DB                        processMutationQueue()
    └── release drainMutex                 ├── amILeader() = true
                                            ├── recoverStuckProcessing()
                                            ├── process items (duplicate!)
```

**Impact:** Both tabs process mutations concurrently. The old leader's RPCs may succeed while the new leader also processes the same items.

**Current Mitigation:** Idempotency keys — but they have a window where they're not yet registered (see H3 in STABILITY_AUDIT.md).

### RC2: Auth Hydration vs onAuthStateChange Listener

**File:** `src/lib/auth-context.tsx`
**Severity:** MEDIUM

```
Time ──────────────────────────────────────────────►
Mount Effect:
  getCurrentUser() ──→ .then(setUser) ──→ setLoading(false)
                            ↑
onAuthStateChange: ──→ SIGNED_OUT → setUser(null)
```

The listener can fire between `getCurrentUser()` resolving and `setUser()` being called, creating inconsistent state where a sign-out is overwritten by hydration.

### RC3: Tab Synchronization — Dual Leader (Fallback Path)

**File:** `src/lib/queue-leader.ts`
**Severity:** HIGH

```
Tab A (leader):                          Tab B (follower):
  writeHeartbeat() takes >15s              isLeaderStale() → true
  (GC pause, slow tab)                     contestLeadership() → becomes leader
  heartbeat finally written                [both think they're leaders!]
  still broadcasting (non-stale)
```

**Conditions:** Requires Web Locks API to be unavailable AND a heartbeat write delay >15s. Possible on mobile devices with aggressive throttling.

### RC4: IndexedDB Migration Not Transactional

**File:** `src/lib/queue-db.ts`
**Severity:** MEDIUM

Two tabs simultaneously migrating from localStorage to IndexedDB:
1. Tab A reads localStorage items
2. Tab B reads localStorage items
3. Tab A inserts item (checks idempotency: not exist)
4. Tab B inserts item (checks idempotency: not exist) → DUPLICATE

### RC5: Cross-Tab localStorage Telemetry Writes

**File:** `src/lib/telemetry.ts`
**Severity:** HIGH

```
Tab A:                              Tab B:
  loadFromStorage() → [evt1, evt2]    loadFromStorage() → [evt1, evt2]
  push(evt3)                          push(evt4)
  flushCacheToStorage()              flushCacheToStorage()
  → writes [evt1, evt2, evt3]        → writes [evt1, evt2, evt4]
  (evt3 lost!)                       (evt3 lost!)
```

### RC6: Reconnect + ProcessMutationQueue Concurrent Calls

**File:** `src/lib/realtime.ts` / `src/lib/queue-leader.ts`
**Severity:** LOW

When coming back online:
- `handleOnline` calls `processMutationQueue()`
- If leadership was also re-acquired, `contestLeadership()`'s `onBecomeLeader` callback also calls `processMutationQueue()`

**Mitigation:** `drainMutex` prevents concurrent drains within the same tab.

### RC7: `replayMissedEvents` Concurrent with Live Messages

**File:** `src/lib/realtime.ts`
**Severity:** MEDIUM

Replay iterates through past events while the WebSocket may be delivering live events for the same entities. Both paths call `invalidateForEvent`, potentially causing:
- Double cache invalidation (harmless but wasteful)
- Replay processing a stale cursor while live events shift the window

### RC8: Circuit Breaker Module-Level State Divergence

**File:** `src/lib/circuit-breaker.ts`
**Severity:** MEDIUM

```
Tab A:                             Tab B:
  recordFailure() × 10              module import
  → circuit OPEN                    → loads persisted state (still CLOSED?)
  persistState()                    isCircuitOpen() → returns false
  → localStorage: OPEN             [thinks circuit is CLOSED]
```

Each tab has independent in-memory circuit state. Persistence is not shared reactively.

### RC9: `isCircuitOpen()` Side Effect Mutation

**File:** `src/lib/circuit-breaker.ts`
**Severity:** MEDIUM

`isCircuitOpen()` is a **getter with a side effect** — it transitions OPEN → HALF_OPEN when the timeout expires. If two callers invoke `isCircuitOpen()` in the same execution frame, both see HALF_OPEN but only one gets through (mitigated by `halfOpenProbeInFlight`).

### RC10: Security Monitor State is Per-Tab Only

**File:** `src/lib/security-monitor.ts`
**Severity:** LOW

`attemptStore` and `rateLimitStore` are in-memory Maps. Each tab has independent state. A brute-force attacker can bypass rate limits by opening multiple tabs.

---

## Shared State Matrix

| State Variable | Location | Read By | Written By | Protected? |
|---------------|----------|---------|------------|------------|
| `currentState` (leader) | queue-leader.ts | amILeader() | contestLeadership(), watchForLeaderLoss() | Single-threaded JS (no async gap) |
| `processingLock` | mutation-queue.ts | processMutationQueue() | processMutationQueue() | Per-tab drainMutex |
| `processedIdempotencyKeys` | mutation-queue.ts | isIdempotencyProcessed() | markIdempotencyProcessed() | **Not protected** — external callers can mutate |
| `dualWriteMode` | mutation-queue.ts | enqueueMutation() | enableDualWrite/disableDualWrite | **Not protected** — direct toggle |
| `activeChannels` | realtime.ts | Multiple | subscribe/removeChannel | Single-threaded JS |
| `seenEventIds` | realtime.ts | isEventSeen() | markEventSeen() | Single-threaded JS |
| `telemetryCache` | telemetry.ts | recordTelemetry() | recordTelemetry/flush | Single-threaded JS |
| `failureTimestamps` | circuit-breaker.ts | isCircuitOpen() | recordFailure/recordSuccess | **Not cross-tab** |
| `cached` (feature flags) | feature-flags.ts | getFeatureFlags() | setFeatureFlag/reset | **Not cross-tab** |
| `clickCounts` | observation.ts | observeClick | observeClick | Single-threaded JS |
| `rateLimitStore` | security-monitor.ts | checkRateLimit | checkRateLimit | **Unbounded, no eviction** |
| `attemptStore` | security-monitor.ts | isLockedOut | recordAuthAttempt | **Per-tab only** |

---

## Mutex Coverage

| Mutex | Location | Protects | Usage |
|-------|----------|----------|-------|
| `drainMutex` | mutation-queue.ts | Queue drain loop | ✅ Properly acquired/released via try/finally |
| `refreshMutex` | auth-context.tsx | Token refresh | ❌ **Declared but never used** |
| `recoverMutex` | auth-context.tsx | Session recovery | ❌ **Declared but never used** |

---

## Missing Synchronization

1. **No mutex on `markIdempotencyProcessed()`** — Called from outside the drain loop in some code paths
2. **No cross-tab dedup for currently-processing items** — `processingLock` is per-tab only
3. **No entity-level ordering guarantee** — Mutations affecting the same entity are not grouped
4. **No AbortController anywhere** — No async operation can be cancelled
5. **No cross-tab circuit breaker sync** — No `storage` event listener for circuit state changes
6. **No cross-tab feature flag sync** — No `storage` event listener for flag changes
