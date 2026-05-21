# Failure Recovery Report

**Generated:** 2026-05-17
**Scope:** Failure modes, recovery paths, gap analysis for all critical subsystems

---

## Failure Mode Catalog

### 1. Network Failures

| Mode | Trigger | Detection | Recovery | Gap |
|------|---------|-----------|----------|-----|
| **Offline** | Browser offline event | `window.addEventListener('offline')` | `processMutationQueue()` on `online` event | None |
| **Silent WS drop** | Connection lost without event | Health check (30s interval, C4) | Full reconnect + channel re-subscription (C3) | None |
| **Reconnect storm** | Rapid online/offline cycles | `reconnectCount` counter | Backoff with jitter (capped at 30s) | Circuit breaker prevents infinite loops |
| **RPC timeout** | Backend unresponsive | `setTimeout` in mutation processing | Retry with exponential backoff (max 5) | None |

### 2. IndexedDB Failures

| Mode | Trigger | Detection | Recovery | Gap |
|------|---------|----------|----------|-----|
| **Quota exceeded** | Storage full | Dexie `QuotaExceededError` | Catch-and-continue; localStorage dual-write as fallback | None |
| **Database closed** | Corruption / deletion | Dexie `DatabaseClosedError` | Catch-and-continue; operations degrade gracefully | No automatic retry/reconnect to IDB |
| **Transaction conflict** | Concurrent write contention | Dexie transaction error | Mutex on drain operation prevents conflicts | None |

### 3. Mutation Queue Failures

| Mode | Trigger | Detection | Recovery | Gap |
|------|---------|----------|----------|-----|
| **Processing timeout** | Mutation takes > 2 min | `PROCESSING_TIMEOUT_MS` check | `recoverStuckProcessingItems()` resets to pending | ⚠️ Double-counts pending orphans (see below) |
| **Max retries exceeded** | 5 consecutive failures | `retryCount >= MAX_RETRIES` | `moveToDeadLetter()` moves to dead-letters table | ✅ Fixed H4 |
| **Tab crash during processing** | Tab closes mid-mutation | Stuck in 'processing' state on restart | `recoverStuckProcessingItems()` on next drain | None |
| **Idempotency key collision** | Duplicate submission | `isIdempotencyProcessed()` check | Returns existing ID | ✅ Fixed H3 (mark BEFORE status write) |

### 4. Auth Failures

| Mode | Trigger | Detection | Recovery | Gap |
|------|---------|----------|----------|-----|
| **Token refresh failure** | Expired session | 401 on API call | 3 retries with exponential backoff + mutex (H2) | None |
| **Auth mount rejection** | Network error on init | `.catch()` on `getCurrentUser()` | ✅ Fixed C2 | None |
| **Session expiry** | Prolonged inactivity | Storage event cross-tab sync | Force re-login via auth state machine | None |

### 5. Realtime Failures

| Mode | Trigger | Detection | Recovery | Gap |
|------|---------|----------|----------|-----|
| **Connection drop** | WS disconnect | Health check / browser event | `reconnectToChannels()` re-subscribes all channels (C3) | None |
| **Silent drop (no event)** | Unnoticed disconnect | `startHealthCheck()` (C4) | Full reconnect cycle | None |
| **Stale subscription** | SDK bug / memory leak | Cleanup interval (5 min) | `cleanupStaleSubscriptions()` removes dead entries | None |

### 6. Cross-Tab State Drift

| Mode | Trigger | Detection | Recovery | Gap |
|------|---------|----------|----------|-----|
| **Auth state divergence** | One tab logs out | `storage` event listener (M10) | Clears session state | None |
| **Circuit breaker divergence** | Different failure counts | `storage` event listener (M11) | Reloads circuit state from localStorage | None |
| **Feature flag divergence** | Stale flag cache | `storage` event listener (M12) | Invalidates cached flags | None |

---

## Recovery Path Diagram

```
Failure Detected
    │
    ├── Network Offline
    │   └── Queue mutations → On online → processMutationQueue()
    │
    ├── RPC Timeout (mutation processing)
    │   ├── Retry (up to 5)
    │   │   └── Success → idempotencyKey marked processed
    │   └── Max retries → moveToDeadLetter()
    │
    ├── Tab Crash (item stuck 'processing')
    │   └── recoverStuckProcessingItems()
    │       ├── Reset to 'pending' (processing timeout expired)
    │       └── Retry via next drain cycle (H4 fix: dead letter wired)
    │
    ├── Reconnect
    │   ├── backoffWithJitter() delay
    │   ├── insforge.realtime.connect()
    │   ├── reconnectToChannels()  ← C3
    │   ├── reset reconnectCount   ← H5
    │   └── processMutationQueue()
    │
    ├── Silent WS Drop
    │   └── healthCheck (C4)
    │       └── Full reconnect cycle
    │
    └── Token Refresh Failure
        └── Retry (3x exponential backoff) with mutex (H2)
            └── All fail → force logout
```

---

## Gap Analysis

### Gap 1: `recoverStuckProcessingItems()` Double-Counts

**Severity:** LOW (only affects the `recovered` return count, not correctness)

**Detail:** The function first recovers 'processing' items to 'pending', then checks all 'pending' items for orphans. Items just recovered from the first pass are also matched in the second pass if they exceed `PENDING_STUCK_THRESHOLD_MS` (5 min). This inflates the returned count.

**Impact:** The `recovered` return value can be up to 2x actual unique items recovered. Callers using this count for metrics/alerts may see inflated numbers.

**Fix:** Track recovered IDs in a Set and skip them in the pending orphan check.

### Gap 2: `recoverStuckProcessingItems()` Bumps `retryCount` on Orphans

**Severity:** MEDIUM

**Detail:** When the function finds orphaned pending items (old + retryCount=0), it bumps `retryCount` to 1. This is intended to trigger processing on the next drain cycle. However, if processing then fails, the item's `retryCount` appears as 2, not 1, skewing retry accounting.

### Gap 3: IndexedDB Automatic Reconnect

**Severity:** LOW

**Detail:** If IndexedDB is closed/corrupted (e.g., private browsing, storage clear), operations throw `DatabaseClosedError`. The app catches and degrades gracefully, but there is no automatic retry to reopen the database.

### Gap 4: No Health Check for IndexedDB

**Severity:** LOW

**Detail:** Unlike WebSocket (which has `startHealthCheck()`), IndexedDB has no periodic health check. If the database becomes unavailable, the app only discovers this on the next database operation.

---

## Recovery Coverage Matrix

| Component | Failure Mode | Detected? | Recovered? | Tested? |
|-----------|-------------|-----------|------------|---------|
| Network | Offline | ✅ `online`/`offline` | ✅ Queue + replay | ✅ Chaos 02 |
| Network | Reconnect storm | ✅ `reconnectCount` | ✅ Backoff + circuit | ✅ Chaos 02 |
| Network | RPC timeout | ✅ Timer | ✅ Retry + circuit | ✅ Chaos 06 |
| IndexedDB | Quota exceeded | ✅ Dexie error | ✅ Dual-write fallback | ✅ Chaos 04 |
| IndexedDB | Corruption | ✅ `verifyParity()` | ✅ `recoverCorruptedQueue()` | ✅ Chaos 05 |
| Queue | Processing stuck | ✅ Timeout check | ✅ `recoverStuckProcessingItems()` | ✅ Chaos 03 |
| Queue | Max retries | ✅ `retryCount` | ✅ `moveToDeadLetter()` | ✅ Chaos 03 |
| Queue | Tab crash | ✅ Orphaned 'processing' | ✅ Recovery on drain | ✅ Chaos 03 |
| Queue | Idempotency replay | ✅ Key check | ✅ Skip duplicate | ✅ Chaos 08 |
| Auth | Token refresh fail | ✅ Error handler | ✅ Retry 3x + mutex | Tested manually |
| Auth | Mount rejection | ✅ `.catch()` | ✅ Graceful degrade | Tested manually |
| Realtime | WS disconnect | ✅ Health check C4 | ✅ Reconnect + re-subscribe C3 | Tested manually |
| Realtime | Silent drop | ✅ Health check C4 | ✅ Full reconnect | Tested manually |
| Cross-tab | Auth drift | ✅ `storage` event | ✅ Re-sync M10 | Tested manually |
| Cross-tab | Circuit drift | ✅ `storage` event | ✅ Re-sync M11 | Tested manually |
| Cross-tab | Flag drift | ✅ `storage` event | ✅ Re-sync M12 | Tested manually |
| Memory | Idempotency Set full | ✅ FIFO eviction M3 | ✅ Cap at 500 | ✅ Chaos 08 |
| Memory | Rate limit Map full | ✅ LRU eviction M4 | ✅ Cap + stale sweep | Not tested |
| Memory | Click count Map full | ✅ LRU eviction M5 | ✅ Cap at 200 | Not tested |

---

## Recommendations

1. **Fix Gap 1:** Add `recoveredIds` Set to `recoverStuckProcessingItems()` to prevent double-counting
2. **Fix Gap 2:** Do not bump `retryCount` on orphaned pending items; instead force their next drain by a different mechanism
3. **Address Gap 3:** Add `reopenDatabase()` retry to IndexedDB operations
4. **Address Gap 4:** Add periodic IndexedDB health check (similar to WS health check)
