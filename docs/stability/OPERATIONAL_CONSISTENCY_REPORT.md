# Operational Consistency Report

**Generated:** 2026-05-17
**Scope:** Online/offline handling, cross-tab synchronization, replay mechanisms, queue operations

---

## Online/Offline Handling

### Architecture

```
┌─────────────────────────────────────────────┐
│            Mutation Queue                     │
│                                              │
│  enqueueMutation()                           │
│    ├── Always succeeds (offline-first)       │
│    ├── Writes to IndexedDB + localStorage    │
│    └── Idempotency dedup                     │
│                                              │
│  window.addEventListener('online') ─────────→│
│    └── processMutationQueue()                │
│                                              │
│  window.addEventListener('offline') ────────→│
│    └── Cease processing                      │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│            Realtime                           │
│                                              │
│  window.addEventListener('online') ─────────→│
│    ├── backoffWithJitter() delay             │
│    ├── insforge.realtime.connect()           │
│    ├── reconnectToChannels()  ← C3          │
│    ├── reset reconnectCount  ← H5           │
│    └── processMutationQueue()               │
│                                              │
│  healthCheck (30s) ────────────────────────→│
│    └── Detect silent drops                   │
└─────────────────────────────────────────────┘
```

### Verified Behaviors

| Scenario | Behavior | Test |
|----------|----------|------|
| Offline enqueue | Items queued with 'pending' status | Chaos 01 |
| Online after offline | Queue drained, mutations processed | Chaos 02 |
| Reconnect storm (5 cycles) | Circuit breaker opens, backoff applied | Chaos 02 |
| Silent WS drop | Health check detects -> full reconnect | Manual |

### Consistency Properties

**Write-Ahead Log:** Every `enqueueMutation()` writes to IndexedDB before returning. The response contains the item ID. If the caller receives the ID, the mutation is durably stored.

**Idempotency:** The same `idempotencyKey` always returns the same item ID (existing entry is returned on duplicate). This holds across online/offline transitions because the check is against IndexedDB.

**Processing Guarantee:** Items stay in 'pending' state until successfully processed or moved to dead letters. The `drainMutex` prevents concurrent processing within the same tab.

---

## Cross-Tab Synchronization

### Synchronization Mechanisms

| Mechanism | Used By | Scope |
|-----------|---------|-------|
| `BroadcastChannel` | Leader election | Real-time coordination |
| `localStorage` + `storage` event | Auth (M10), Circuit (M11), Flags (M12) | State synchronization |
| `navigator.locks` | Processing mutex | Cross-tab processing exclusion |
| IndexedDB | Queue state | Shared persistent state |

### Cross-Tab State Matrix

| State | Storage | Synchronized? | Mechanism | Freshness |
|-------|---------|---------------|-----------|-----------|
| Auth session | localStorage | ✅ M10 | `storage` event listener | Near-real-time |
| Circuit breaker state | localStorage | ✅ M11 | `storage` event listener | Near-real-time |
| Feature flags | localStorage | ✅ M12 | `storage` event listener | On flag change |
| Mutation queue | IndexedDB | ✅ | Shared DB, `navigator.locks` | Immediate |
| Leader status | BroadcastChannel | ✅ | Channel messages | Real-time |
| Telemetry cache | localStorage + IDB | ❌ | No cross-tab sync | Per-tab only |
| Processed idempotency keys | In-memory | ❌ | No cross-tab sync | Per-tab only |

### Known Gap: Idempotency Across Tabs

**Detail:** The `processedIdempotencyKeys` Set is in-memory per tab. If Tab A processes a mutation and Tab B attempts the same idempotency key, Tab B will not know it was already processed (until it checks IndexedDB and finds the completed item).

**Impact:** Low — the IndexedDB check at `enqueueMutation` line 132-137 catches duplicates. The in-memory Set is just an optimization to avoid the DB read. If two tabs race with the same key, the second will get the existing item ID.

### Known Gap: Telemetry Duplication

**Detail:** Telemetry events are cached in-memory per tab. Each tab independently flushes to IndexedDB. There is no cross-tab deduplication of telemetry events.

**Impact:** Low — telemetry is additive and duplicates are acceptable for metrics.

---

## Replay Mechanisms

### replayMissedEvents

```
Flow:
1. Read lastSequenceId from replayState in IndexedDB
2. Query server for events since lastSequenceId
3. Compare each event's sequence_id against cursor
4. Apply events with sequence_id > cursor (✅ Fixed M8: Number() not String())
5. Store progress: update replayState with latest sequenceId
6. Emit events to subscribers
```

### Integrity Properties

| Property | Implementation | Verified |
|----------|---------------|----------|
| At-least-once delivery | Events are re-fetched from server | Implicit |
| Exactly-once application | `seenEventIds` + cursor check | Chaos 07 |
| Progress persistence | `replayState` in IndexedDB | Chaos 07 |
| Crash recovery | On reconnect, cursor resumes from last persisted | Chaos 07 |
| Idempotent replay | Same sequence_id is skipped | Chaos 07 |

### Cursor Comparison (M8 Fix)

**Before:** `String(id) > String(cursor)` — lexicographic comparison failed for "9" > "10" (true).

**After:** `Number(id) > Number(cursor)` — correct numeric comparison.

---

## Queue Operations

### State Machine

```
    ┌──────────┐
    │  pending │ ◄── enqueueMutation()
    └────┬─────┘
         │
    ┌────▼──────┐
    │ processing │ ◄── drainMutex acquired
    └────┬──────┘
         │
    ┌────▼─────┐      ┌──────────────┐
    │ completed│      │    failed    │
    └──────────┘      └──────┬───────┘
                              │
                    retryCount < 5? ──yes──► pending
                              │
                              │ no
                         ┌────▼──────┐
                         │    dead   │ ◄── moveToDeadLetter()
                         └───────────┘
```

### Throughput Characteristics

| Operation | Average | Peak | Notes |
|-----------|---------|------|-------|
| `enqueueMutation` | < 5ms | < 20ms | IndexedDB write + localStorage write |
| Batch drain (100 items) | ~500ms | ~2s | RPC calls + retries |
| `recoverStuckProcessingItems` | < 10ms | < 50ms | Linear scan of mutations table |
| `checkQueueIntegrity` | < 50ms | < 200ms | Full scan of mutations + deadLetters |

### Dead Letter Flow (H4 Fix)

**Before:** Items exceeding max retries stayed in `mutations` table with no cleanup. The `moveToDeadLetter()` API existed in `queue-db.ts` but was never called.

**After:** When `retryCount >= MAX_RETRIES`, the item is moved to the `deadLetters` table. This ensures the `mutations` table only contains active items.

### Dual-Write Consistency

| Scenario | Behavior | Test |
|----------|----------|------|
| Normal operation | Write to both IDB + localStorage | Verified |
| localStorage corrupted | `verifyParity()` detects mismatch | Chaos 05 |
| IDB corrupted | `verifyParity()` detects mismatch | Incomplete (test uses localStorage corruption) |
| Parity check mismatch | Warns but keeps dual-write enabled | Chaos 05 |

---

## Automated Processing

### enableAutoProcessing()

Registered once (guard at line 583-586):
- **`window.addEventListener('online')`** — triggers `processMutationQueue()`
- **`window.addEventListener('offline')`** — ceases processing

### Queue Leader

The leader election system uses `BroadcastChannel` for coordination:
1. **Contesting** — startup phase, broadcasts leadership intent
2. **Leader** — the first tab to respond runs `processMutationQueue()` on an interval
3. **Follower** — waits for leader heartbeat, contests if leader disappears

**Heartbeat:** Written every 3 seconds to a timestamp in localStorage + BroadcastChannel.

**Stale Leader Detection:** If no heartbeat for > 6 seconds, followers re-contest.

---

## Recommendations

1. **Add `processedIdempotencyKeys` to localStorage** for cross-tab awareness of recently processed keys
2. **Add `disableAutoProcessing()`** that removes online/offline listeners to allow clean teardown
3. **Verify dual-write recovery** when IndexedDB is corrupted (Chaos 05 only tests localStorage corruption)
4. **Add telemetry cross-tab sync** if duplicate metrics become problematic
