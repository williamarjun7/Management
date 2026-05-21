# Queue Reliability Report

**Generated:** 2026-05-17
**Scope:** Mutation queue, dead-letter handling, replay, retry, dual-write parity

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│                   mutation-queue.ts                        │
│                                                            │
│  enqueueMutation(operation, params, idempotencyKey)        │
│    ├── isIdempotencyProcessed() check (in-memory Set)      │
│    ├── IndexedDB check for existing pending item           │
│    ├── enqueueMutationTransactional() (Dexie transaction)  │
│    └── dual-write to localStorage (if enabled)             │
│                                                            │
│  processMutationQueue()                                    │
│    ├── Guard chain:                                        │
│    │   ├── amILeader() → drainMutex → isCircuitOpen()      │
│    │   └── navigator.onLine                                │
│    ├── recoverStuckProcessingItems()                       │
│    ├── Process items FIFO by createdAt                     │
│    │   ├── Skip if processingLock.has(id)                  │
│    │   ├── Skip if idempotency already processed           │
│    │   ├── Dead-letter if retryCount >= 5                  │
│    │   └── RPC call with retry+backoff                    │
│    └── trackDrainDuration()                                │
│                                                            │
│  Enable auto-processing on online ← NEW                    │
│    └── window.addEventListener('online', processMQ)        │
│                                                            │
│  moveToDeadLetter() ← FIXED                                │
│    └── Removes from mutations table, inserts into          │
│        deadLetters table (atomic transaction)              │
│                                                            │
│  markIdempotencyProcessed() ← FIXED order                  │
│    └── Called BEFORE status write (was AFTER)              │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Hardening Applied

### 1. moveToDeadLetter() Wired Up (H4)

**Before:** The dead-letter path in `processMutationQueue()` set `status='dead'` but never called `moveToDeadLetter()`. The `deadLetters` table was never populated. Dead items cluttered the `mutations` table indefinitely.

**After:** The dead-letter path now calls `moveToDeadLetter(item)` which removes the item from the `mutations` table and inserts it into the `deadLetters` table in a single atomic Dexie transaction.

**Files Changed:**
- `src/lib/mutation-queue.ts`: Added `moveToDeadLetter` import, replaced `queueDB.mutations.put()` + status write with actual dead-letter move.

### 2. Idempotency Key Registration Order (H3)

**Before:** `markIdempotencyProcessed()` was called AFTER `processingLock.delete()` and `queueDB.mutations.put()`. A crash between the IndexedDB write and the idempotency registration would leave the mutation completed in DB but the key unregistered — potentially causing re-processing on recovery.

**After:** `markIdempotencyProcessed()` is called BEFORE the status write and BEFORE `processingLock.delete()`. This ensures the in-memory Set has the key before any other processing pass can re-process the item.

### 3. processedIdempotencyKeys In-Memory Cap (M3)

**Before:** Only the localStorage persist was capped at 500 keys. The in-memory `Set` grew without bound, consuming memory over long-running sessions.

**After:** The `processedIdempotencyKeys` Set is now capped at `MAX_PROCESSED_KEYS = 500` entries. When exceeded, the oldest entries are evicted (FIFO).

### 4. Auto-Processing on Online Transition (H6)

**Before:** The queue checked `navigator.onLine` at the start of `processMutationQueue()` but had no event listeners. Mutations silently accumulated while offline and were not auto-processed when connectivity returned.

**After:** `enableAutoProcessing()` registers `window.addEventListener('online', processMutationQueue)` and `window.addEventListener('offline', ...)` at module load time. Mutations are automatically drained when the browser comes online.

### 5. Queue Consistency Fixes (Phase 4)

- Added online/offline event listeners to trigger queue processing
- Fixed recovered item counting in `recoverStuckProcessingItems`
- Added proper leader re-election timer cleanup

---

## Queue Health Metrics

| Metric | Source | Description |
|--------|--------|-------------|
| `queueSize` | IndexedDB count | Total pending + processing items |
| `completedCount` | IndexedDB count | Completed items retained |
| `deadCount` | IndexedDB count | Items in dead letter table |
| `failedCount` | IndexedDB count | Failed items |
| `oldestItemAgeMs` | IndexedDB query | Age of oldest pending item |
| `processingCount` | `processingLock.size` | Items currently being processed |
| `throughput` | Rolling 100 ticks | Drains per minute |
| `avgProcessingMs` | Rolling 100 ticks | Average processing duration |
| `parityInSync` | Dual-write check | IndexedDB vs localStorage match |

---

## Retry Strategy

| Parameter | Value |
|-----------|-------|
| Max retries | 5 |
| Initial backoff | 1000ms |
| Max backoff | 30000ms |
| Jitter | 20% random |
| Backoff formula | `min(base * 2^count, max) * (1 + 0.2 * random())` |
| Circuit breaker threshold | 10 failures in 30s |
| Circuit breaker timeout | 30s |

---

## Dual-Write Parity

| State | Behavior |
|-------|----------|
| `dualWriteMode=true` (default) | Every IndexedDB write is mirrored to localStorage |
| Parity check | `verifyParity()` compares IndexedDB vs localStorage counts and IDs |
| Auto-disable | `shouldDisableLocalStorage()` after 10 consecutive clean parity checks |

---

## Remaining Risks

| Risk | Severity | Description |
|------|----------|-------------|
| Per-entity ordering | LOW | Mutations for the same entity are processed FIFO but not grouped. Two mutations for the same room could interleave. |
| Split-brain on leader election | LOW | Fallback path (non-WebLocks) has a small window for dual leaders. Idempotency keys mitigate, but not perfectly. |
| Dead letter table unbounded | LOW | No retention/cleanup for dead letters. Over years of operation, this grows. A cleanup job should be added. |
