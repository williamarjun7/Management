# Memory Leak Audit

**Generated:** 2026-05-17
**Scope:** In-memory Maps/Sets, closures, timers, event listeners, module-level state

---

## Audit Methodology

Each module was inspected for:
1. Module-level collections (`Map`, `Set`, arrays) with unbounded growth
2. Timer references (`setInterval`/`setTimeout`) without cleanup paths
3. Event listeners (`window`, `document`, `BroadcastChannel`) without removal
4. Cached/accumulated state that persists across the application lifecycle
5. Missing `WeakMap`/`WeakRef` usage where appropriate

---

## Critical Findings

### C1: `security-monitor.ts` — Unbounded `attemptStore` Map

| Property | Value |
|----------|-------|
| **File** | `src/lib/security-monitor.ts:13` |
| **Type** | `Map<string, AuthAttempt>` |
| **Risk** | HIGH — no size cap, no eviction strategy |
| **Impact** | Under sustained brute-force attempts with distinct identifiers, this Map grows without bound, consuming memory proportional to attack volume |

**Detail:** Entries are only deleted on successful auth (line 20) or lockout expiry check (line 52). There is no periodic cleanup for entries that never succeeded and never hit the lockout threshold.

**Recommendation:** Implement LRU eviction (cap at 5000 entries) or periodic cleanup sweep for entries older than 24h.

### C2: `telemetry.ts:356` — Uncancellable `setTimeout`

| Property | Value |
|----------|-------|
| **File** | `src/lib/telemetry.ts:356` |
| **Description** | `setTimeout(() => { flushToIndexedDB(); }, BATCH_INTERVAL_MS)` inside `scheduleBatchFlush()` |
| **Risk** | MEDIUM — timer ref not stored; cannot be cancelled on module cleanup |
| **Impact** | If `shutdownRealtime()` or app unmount is called, this timer may fire after teardown, attempting writes to a closing IndexedDB connection |

### C3: `telemetry.ts:440` — `startTelemetryCleanupScheduler()` Interval Not Tracked

| Property | Value |
|----------|-------|
| **File** | `src/lib/telemetry.ts:440-441` |
| **Description** | Returns `setInterval` to caller; module has no tracking |
| **Risk** | MEDIUM — if caller loses the returned handle, the interval runs forever |
| **Impact** | Hourly telemetry cleanup runs indefinitely, even after app unmount |

### C4: `alerts.ts:310` — `startAlertPolling()` Interval Not Tracked

| Property | Value |
|----------|-------|
| **File** | `src/lib/alerts.ts:310-311` |
| **Risk** | MEDIUM — same pattern as C3; returned interval must be managed by caller |

### C5: Circuit-Breaker & Feature-Flag Storage Listeners Never Removed

| Property | Value |
|----------|-------|
| **Files** | `src/lib/circuit-breaker.ts:54`, `src/lib/feature-flags.ts:54` |
| **Description** | `window.addEventListener('storage', handler)` registered at module load |
| **Risk** | MEDIUM — listeners survive for entire page lifetime; benign for single-page sessions but leaks in testing/SSR |
| **Note** | These are idempotent and do not accumulate (same handler reference), so they are not a **growing** leak. However, they lack any cleanup/unsubscribe mechanism. |

### C6: `mutation-queue.ts:589,594` — Online/Offline Listeners Never Removed

| Property | Value |
|----------|-------|
| **File** | `src/lib/mutation-queue.ts:589,594` |
| **Description** | `enableAutoProcessing()` adds `online`/`offline` listeners once (guarded) |
| **Risk** | LOW — guard prevents duplicates; listeners last for page lifetime |
| **Recommendation** | Add a `disableAutoProcessing()` function that removes them, for clean teardown |

---

## Previously Fixed Issues (Phase 2-11)

| Item | File | Fix | Status |
|------|------|-----|--------|
| Unbounded `processedIdempotencyKeys` | `mutation-queue.ts:26` | Capped at 500 with FIFO eviction (M3) | ✅ Fixed |
| Unbounded `rateLimitStore` | `security-monitor.ts:71` | LRU eviction with stale sweep (M4) | ✅ Fixed |
| Unbounded `clickCounts` / `flowStartTimes` | `observation.ts:23-24` | LRU eviction (M5) | ✅ Fixed |
| Watch interval cleanup | `queue-leader.ts:23` | `clearTimers()` helper, module-level ref (M2) | ✅ Fixed |
| Alerts query memory | `alerts.ts` | `.limit(1000)` on mutations, `.limit(20)` on dead letters (M9) | ✅ Fixed |

---

## Remaining Memory Pressure Points

### Moderate Concern

| Location | Structure | Growth Bound | Notes |
|----------|-----------|-------------|-------|
| `mutation-queue.ts:24` | `processingLock Set` | Bounded by concurrent processing (typically 1-5) | OK |
| `mutation-queue.ts:26` | `processedIdempotencyKeys Set` | Capped at 500 | OK (M3) |
| `mutation-queue.ts:208` | `drainTimestamps[]` | Ring buffer, last 100 entries | OK |
| `mutation-queue.ts:209` | `processingDurations[]` | Ring buffer, last 100 entries | OK |
| `realtime.ts:38` | `activeChannels Map` | Bounded by number of active subscriptions (typically < 20) | OK |
| `realtime.ts:39` | `subscribedChannelSet Set` | Same as above | OK |
| `realtime.ts:43` | `seenEventIds Set` | Dedup set, should be bounded by subscription lifecycle | Verify |
| `telemetry.ts:13` | `telemetryCache[]` | Capped at 200 in-memory | OK |
| `circuit-breaker.ts:13` | `failureTimestamps[]` | Windowed (10 min), auto-evicted on stale check | OK |
| `sync.ts:51` | `pendingInvalidations Set` | Cleared on flush | OK |

### Low Concern

| Location | Structure | Notes |
|----------|-----------|-------|
| `queue-leader.ts:26` | `lastBroadcastSeen` | Single number | OK |
| `logger.ts:48` | `TAB_ID` | Single UUID | OK |
| `auth-context.tsx` | React state | Managed by React lifecycle | OK |

---

## Timer Cleanup Verification

| Timer | File | Stored Ref? | Cleanup Path? | Status |
|-------|------|-------------|---------------|--------|
| Telemetry cache flush | `telemetry.ts:171` | `telemetryFlushTimer` | Cleared before re-set, but no module cleanup | ⚠️ |
| Telemetry batch flush | `telemetry.ts:356` | No | No | ❌ C2 |
| Telemetry cleanup scheduler | `telemetry.ts:440` | Returned to caller | Caller must store | ⚠️ C3 |
| Reconnect timeout | `realtime.ts:323` | `reconnectTimeout` | `shutdownCleanup()` | ✅ |
| Health check interval | `realtime.ts:380` | `healthCheckTimer` | `stopHealthCheck()` | ✅ |
| Cleanup stale subscriptions | `realtime.ts:359` | `cleanupTimer` | `shutdownRealtime()` | ✅ |
| Leader heartbeat | `queue-leader.ts:97` | `heartbeatTimer` | `clearTimers()` | ✅ |
| Leader watch | `queue-leader.ts:153` | `watchTimer` | `clearTimers()` | ✅ |
| Alert polling | `alerts.ts:310` | Returned to caller | Caller must store | ⚠️ C4 |

---

## Recommendations

### Immediate (Next Sprint)

1. **Cap `attemptStore`** in `security-monitor.ts` with LRU eviction (5000 entries max + TTL sweep)
2. **Store timer ref** for `scheduleBatchFlush()` in `telemetry.ts` to allow cancellation
3. **Add cleanup function** `stopTelemetryCleanupScheduler()` in `telemetry.ts`
4. **Add cleanup function** `stopAlertPolling()` in `alerts.ts`

### Future

5. **Remove storage listeners** in `circuit-breaker.ts` and `feature-flags.ts` on a cleanup call
6. **Add `disableAutoProcessing()`** to `mutation-queue.ts` that removes online/offline listeners
7. **Consider `WeakRef`** for cached callbacks if they hold references to DOM nodes
