# Recovery Flow Map

**Generated:** 2026-05-17
**Scope:** All recovery mechanisms, failure scenarios, and dependency chains.

---

## 1. Mutation Queue Recovery

### Flow Diagram

```
                    ┌───────────────────────┐
                    │  processMutationQueue  │
                    │  called (external)     │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │  amILeader() check     │
                    │  ┌─── false ───┐       │
                    │  │ return      │       │
                    │  └─────────────┘       │
                    └───────────┬───────────┘
                                │ true
                    ┌───────────▼───────────┐
                    │  acquire drainMutex   │
                    │  ┌─── failed ───┐     │
                    │  │ return      │     │
                    │  └─────────────┘     │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │  isCircuitOpen()       │
                    │  ┌─── true ───┐       │
                    │  │ return     │       │
                    │  └────────────┘       │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │  navigator.onLine      │
                    │  ┌─── false ───┐      │
                    │  │ return     │      │
                    │  └────────────┘      │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │  recoverStuckProc.    │
                    │  Items()              │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │  Process each item    │
                    │  in FIFO order        │
                    └───────────┬───────────┘
                                │
              ┌─────────────────┼──────────────────┐
              │                 │                   │
    ┌─────────▼────────┐  ┌────▼────┐  ┌──────────▼──────┐
    │ retryCount >= 5  │  │ success │  │ failure         │
    │ → status='dead'  │  │→ comp. │  │ → retry+backoff │
    │ skip item        │  │→ idemp.│  │ continue loop   │
    └──────────────────┘  └─────────┘  └─────────────────┘
```

### Recovery Entry Points

| Trigger | Mechanism | Description |
|---------|-----------|-------------|
| External call | `processMutationQueue()` | Manual or scheduled drain |
| Online transition | NOT IMPLEMENTED | Should call `processMutationQueue()` on `window.online` |
| Leadership acquired | `onBecomeLeader` callback | New leader starts draining |
| Focus handler | `auth-context.tsx` | Also triggers `processMutationQueue()` |

### Stuck Mutation Recovery

| Condition | Action | Location |
|-----------|--------|----------|
| `status='processing'` AND `processingStartedAt` > 120s ago | Reset to `'pending'` | `recoverStuckProcessingItems()` |
| `status='processing'` AND no `processingStartedAt` | Reset to `'pending'` | Same |
| `status='pending'` AND `retryCount=0` AND `createdAt` > 300s ago | Bump `retryCount` to 1 to force re-processing | Same |

### Dead Letter Path

```
mutations table                    deadLetters table
┌──────────────────┐              ┌──────────────────┐
│ status='dead'    │  ──???──►   │ (never populated) │
│ retryCount >= 5  │             └──────────────────┘
│ stays in table   │
└──────────────────┘
```

**[ISSUE]**: `moveToDeadLetter()` exists in `queue-db.ts` but is never called. Dead items stay in the mutations table permanently.

### Recovery Dependency Chain

```
processMutationQueue()
  ├── amILeader() ────────────────── queue-leader.ts
  │     ├── Web Locks API
  │     ├── BroadcastChannel
  │     └── localStorage heartbeat
  ├── drainMutex ─────────────────── sync.ts (createMutex)
  ├── isCircuitOpen() ────────────── circuit-breaker.ts
  │     └── localStorage (persisted state)
  ├── navigator.onLine
  ├── recoverStuckProcessingItems() ── queue-db.ts
  │     └── IndexedDB mutations table
  ├── IndexedDB reads/writes ─────── queue-db.ts (Dexie)
  └── insforge.database.rpc() ────── insforge.ts (SDK)
```

---

## 2. Realtime Recovery

### Flow Diagram

```
                    ┌──────────────────────────┐
                    │  Connection Lost          │
                    └───────────┬──────────────┘
                                │
              ┌─────────────────┼──────────────────┐
              │                 │                   │
    ┌─────────▼────────┐  ┌────▼────┐  ┌──────────▼──────┐
    │ window.online    │  │ WS.on   │  │ WS.onerror      │
    │ event fires      │  │ close   │  │ NOT IMPLEMENTED │
    └─────────┬────────┘  │ NOT     │  └─────────────────┘
              │           │ IMPL.   │
    ┌─────────▼────────┐  └─────────┘
    │ debounce (2s)    │
    └─────────┬────────┘
              │
    ┌─────────▼────────┐
    │ backoffWithJitter│
    │ (200-5000ms)     │
    └─────────┬────────┘
              │
    ┌─────────▼────────┐
    │ insforge.realtime│
    │ .connect()       │
    └─────────┬────────┘
              │
    ┌─────────▼────────┐
    │ processMutation  │
    │ Queue()          │
    └─────────┬────────┘
              │
    ┌─────────▼────────┐
    │ [ISSUE] Sub-    │
    │ scriptions NOT   │
    │ re-established   │
    └──────────────────┘
```

### Recovery Gaps

| Gap | Impact | Severity |
|-----|--------|----------|
| No WS `onclose` handler | Connection lost silently, no recovery | HIGH |
| No WS `onerror` handler | Error silently swallowed, no recovery | HIGH |
| Subscriptions not re-established | App appears connected but receives no events | HIGH |
| `reconnectCount` never resets | Backoff grows permanently | MEDIUM |
| No heartbeat/ping-pong | Silent connection death undetected | HIGH |

### Replay Recovery

```
replayMissedEvents(channel)
  ├── Read lastEventId from localStorage
  ├── Paginate system_events (chunk: 50, max: 1000)
  │     ├── Skip events > 24h old
  │     ├── Skip events already seen (seenEventIds)
  │     └── Skip events with processed idempotency key
  ├── invalidateForEvent for each valid event
  └── Update localStorage cursor

[ISSUE]: String cursor comparison may skip events
[ISSUE]: Concurrent with live messages — no ordering guarantee
```

---

## 3. Auth Recovery

### Flow Diagram

```
                    ┌──────────────────────────┐
                    │  Page Load / Mount        │
                    └───────────┬──────────────┘
                                │
                    ┌───────────▼──────────────┐
                    │  getCurrentUser()         │
                    └───────────┬──────────────┘
                                │
              ┌─────────────────┼──────────────────┐
              │                 │                   │
    ┌─────────▼────────┐  ┌────▼────┐  ┌──────────▼──────┐
    │ User found       │  │No user │  │ Error           │
    │ → fetch profile  │  │→anon   │  │ [ISSUE]         │
    │ → setUser        │  │→loading│  │ Unhandled       │
    │ → setAuthStatus  │  │ =false │  │ promise reject  │
    └─────────┬────────┘  └─────────┘  └─────────────────┘
              │
    ┌─────────▼────────┐
    │ Session expired  │
    │ for staff?       │
    │ → signOut        │
    └──────────────────┘
```

### Token Refresh Failure Recovery

```
refreshSession()
  ├── Attempt refresh
  ├── Success → reset anomaly counter
  └── Failure →
        ├── Increment anomaly counter (localStorage)
        ├── If counter >= 5 → captureError (Sentry)
        └── Return null

Staff focus handler receives null:
  └── expireStaffSession()
        ├── signOut()
        ├── setUser(null)
        ├── setAuthStatus('anonymous')
        └── clearSessionTimer()

[ISSUE]: Single failure → immediate logout. No retry.
```

### Session Restoration Recovery

```
recoverSession()
  ├── Guard: only if !user && !loading
  ├── getCurrentUser()
  ├── fetchUserProfile()
  ├── If user found:
  │     ├── buildAuthUser()
  │     ├── setUser()
  │     └── setAuthStatus()
  └── Error → return false

[ISSUE]: Called on window focus only. No online/offline handler.
```

---

## 4. Telemetry Recovery

```
recordTelemetry()
  ├── Push to in-memory cache (capped: 200)
  ├── scheduleCacheFlush() ──► flushCacheToStorage()
  │     ├── Trim to MAX_EVENTS (5000)
  │     ├── JSON.stringify
  │     └── localStorage.setItem
  │           └── [ISSUE]: Cross-tab overwrite race
  └── scheduleBatchFlush() ──► flushToIndexedDB()
        ├── Take last 50 events
        ├── queueDB.telemetry.bulkAdd()
        └── [ISSUE]: No retry on failure

cleanupOldTelemetry()
  ├── queueDB.telemetry.where('timestamp').below(cutoff).delete()
  └── [ISSUE]: Only runs if scheduler started
```

---

## 5. Circuit Breaker Recovery

```
                    ┌──────────┐
                    │  CLOSED   │
                    └─────┬────┘
                          │ 10 failures in 30s
                          ▼
                    ┌──────────┐
                    │   OPEN    │
                    └─────┬────┘
                          │ 30s timeout
                          │ (checked in isCircuitOpen())
                          ▼
                    ┌────────────┐
                    │ HALF_OPEN   │
                    │ (probe     │
                    │  in flight)│
                    └─────┬──────┘
                     ┌────┴────┐
                     │         │
              success │         │ failure
                     │         │
                     ▼         ▼
               ┌────────┐ ┌──────────┐
               │ CLOSED │ │   OPEN   │
               └────────┘ └──────────┘

[ISSUE]: State is per-tab. Not shared cross-tab.
```

---

## Recovery Dependency Graph

```
                    ┌──────────────────┐
                    │  Browser Online   │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
    ┌────────────────┐ ┌──────────┐ ┌──────────────┐
    │ handleOnline   │ │ focus    │ │ Leader       │
    │ (realtime.ts)  │ │ (auth)   │ │ Election     │
    └───────┬────────┘ └──────────┘ └──────┬───────┘
            │                              │
            ▼                              ▼
    ┌────────────────┐ ┌──────────────────────────┐
    │ realtime.con. │ │ onBecomeLeader           │
    │ processMutQ() │ │ processMutationQueue()    │
    └───────┬────────┘ └──────────┬───────────────┘
            │                     │
            └──────────┬──────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │ processMutationQueue │
            │ (mutation-queue.ts)  │
            └──────┬───────────────┘
                   │
          ┌────────┼────────┬───────────┐
          │        │        │           │
          ▼        ▼        ▼           ▼
    ┌────────┐ ┌──────┐ ┌────────┐ ┌────────┐
    │ Online │ │Circ. │ │Stuck   │ │Indexed │
    │Check   │ │Brk.  │ │Recov.  │ │DB R/W  │
    └────────┘ └──────┘ └────────┘ └────────┘
```

## Summary of Recovery Gaps

| Gap | System | Severity | Already Implemented? |
|-----|--------|----------|---------------------|
| Online event → queue processing | Mutation Queue | HIGH | ❌ Missing |
| WS onclose/onerror → reconnect | Realtime | HIGH | ❌ Missing |
| Re-subscribe after reconnect | Realtime | HIGH | ❌ Missing |
| ReconnectCount reset on success | Realtime | MEDIUM | ❌ Missing |
| Token refresh retry before logout | Auth | HIGH | ❌ Missing |
| moveToDeadLetter() wired up | Mutation Queue | MEDIUM | ❌ Missing |
| IndexedDB flush retry on failure | Telemetry | MEDIUM | ❌ Missing |
| Cross-tab circuit breaker sync | Circuit Breaker | MEDIUM | ❌ Missing |
| Cross-tab feature flag sync | Feature Flags | LOW | ❌ Missing |
| Cross-tab auth state sync | Auth | MEDIUM | ❌ Missing |
| AbortController for all ops | All | MEDIUM | ❌ Missing |
| beforeunload flush for logs | Logger | LOW | ❌ Missing |
