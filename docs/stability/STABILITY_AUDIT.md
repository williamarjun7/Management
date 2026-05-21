# Stability Audit Report

**Generated:** 2026-05-17
**Scope:** Full system reliability audit covering mutation queue, realtime, auth, telemetry, and all supporting infrastructure.

---

## Risk Level Definitions

| Level | Meaning | Action Required |
|-------|---------|-----------------|
| **CRITICAL** | Will cause data loss, duplicate payments, or crash under normal operation | Fix immediately |
| **HIGH** | Will cause inconsistent state, silent data loss, or unrecoverable error under edge conditions | Fix this phase |
| **MEDIUM** | May cause degraded UX, stale data, or resource leaks under sustained use | Fix this phase |
| **LOW** | Minor issues, potential future problems | Document, fix if time permits |

---

## CRITICAL Risks

### C1. Billing Idempotency Keys Generated Inside mutationFn

**Location:** `src/lib/billing.hooks.ts` — `useConfirmPayment`, `useReversePayment`, `useSplitBill`, `useApplyDiscount`

**Risk:** Each function generates a new `crypto.randomUUID()` idempotency key **inside** the `mutationFn`. If React Query retries the mutation (due to transient network failure), each retry gets a **different** idempotency key, completely defeating idempotency protection. This can cause:
- Duplicate payment confirmations
- Duplicate payment reversals
- Duplicate bill splits
- Duplicate discount applications

**Mitigation:** Move idempotency key generation to the `onMutate` or pass it from the caller so it's stable across retries.

### C2. Unhandled Promise Rejection on Auth Mount

**Location:** `src/lib/auth-context.tsx` line 188

**Risk:** `insforge.auth.getCurrentUser().then(...)` has **no `.catch()` handler**. If the promise rejects (network error, SDK crash), the rejection is unhandled, causing a browser console error and potentially crashing React's error boundary.

**Mitigation:** Add `.catch()` handler that logs the error and sets `loading=false`.

### C3. No Subscription Re-Establishment on WebSocket Reconnect

**Location:** `src/lib/realtime.ts` — `handleOnline` handler (line ~310)

**Risk:** The reconnect handler calls `insforge.realtime.connect()` but does **NOT** re-subscribe any channels. If the InsForge SDK does not auto-re-subscribe (which most SDKs don't), all subscriptions are silently lost until the user refreshes the page. The application appears connected but receives no realtime updates.

**Mitigation:** Track subscribed channels and re-subscribe after each reconnect.

### C4. WebSocket Close/Error Not Handled

**Location:** `src/lib/realtime.ts`

**Risk:** There is no `onclose` or `onerror` handler on the WebSocket. The only reconnect trigger is the browser `window.online` event. If the WebSocket drops silently (network degradation, server restart, proxy timeout) while the browser considers itself online, no reconnect is ever attempted. The application silently loses all realtime state.

**Mitigation:** Add WebSocket event handlers for close/error that trigger reconnect with backoff.

---

## HIGH Risks

### H1. Cross-Tab localStorage Telemetry Race

**Location:** `src/lib/telemetry.ts` — `flushCacheToStorage()` and `loadFromStorage()`

**Risk:** Multiple tabs independently read the full `highlands_telemetry` blob, append events, and overwrite. The last tab to write wins, silently dropping events from other tabs. This causes systematic telemetry data loss in multi-tab usage.

**Mitigation:** Use IndexedDB as the primary persistence layer (which is per-origin, not per-tab) or implement cross-tab coordination via BroadcastChannel.

### H2. No Retry for Token Refresh — Single Failure Logs Out Staff

**Location:** `src/lib/auth-context.tsx` — `refreshSession()` / `expireStaffSession()`

**Risk:** A single token refresh failure (transient network blip) triggers `expireStaffSession()` which signs the user out immediately. There is no retry, no grace period, and no fallback. Staff users are logged out by transient network conditions.

**Mitigation:** Add retry logic (3 attempts with backoff) before session expiry.

### H3. Idempotency Set Write ≠ IndexedDB Write Gap

**Location:** `src/lib/mutation-queue.ts` lines 416-419

**Risk:** Between writing `status='completed'` to IndexedDB and calling `markIdempotencyProcessed()`, a crash or leader change can cause the mutation to be re-processed. The window is small but exists.

**Sequence:**
1. RPC succeeds
2. IndexedDB written as `'completed'`
3. JS crashes before `markIdempotencyProcessed()` runs
4. New leader: recovery sees item as `'completed'` (skipped) OR if IndexedDB write also failed, resets to `'pending'`
5. Mutation processed again without idempotency guard

**Mitigation:** Order operations so idempotency key is marked before or atomically with the status write.

### H4. moveToDeadLetter() Never Called

**Location:** `src/lib/mutation-queue.ts` line 380 vs `src/lib/queue-db.ts` line 138

**Risk:** `processMutationQueue()` sets items to `status='dead'` but never calls `moveToDeadLetter()`. The `deadLetters` table is never populated. Dead items clutter the `mutations` table indefinitely.

**Mitigation:** Wire up `moveToDeadLetter()` call in the dead-letter path.

### H5. `reconnectCount` Never Resets

**Location:** `src/lib/realtime.ts` — `tracking.reconnectCount`

**Risk:** The reconnect counter monotonically increases across the entire page lifetime. Backoff grows without bound. After enough reconnects, every reconnection attempt waits the maximum 5 seconds permanently.

**Mitigation:** Reset `reconnectCount = 0` on successful `insforge.realtime.connect()`.

### H6. No Online/Offline Event Listeners for Queue Processing

**Location:** `src/lib/mutation-queue.ts`

**Risk:** The queue checks `navigator.onLine` at the start of `processMutationQueue()` but has **no event listeners** for `online`/`offline` events. Mutations silently accumulate in IndexedDB while offline and are not automatically processed when connectivity returns. Processing requires an external trigger.

**Mitigation:** Add `window.addEventListener('online', ...)` that triggers `processMutationQueue()`.

### H7. Idempotency Keys in Billing Hooks (Cross-Tab Race)

**Location:** `src/lib/billing.hooks.ts`

**Risk:** 4 billing hooks generate idempotency keys inside `mutationFn`. On React Query retry, each attempt gets a different key. This is described in C1 but the implication — potential duplicate financial transactions — warrants HIGH severity as well.

### H8. `URL.revokeObjectURL` Called Before Download Starts

**Location:** `src/lib/csv-export.ts` line 30

**Risk:** `URL.revokeObjectURL(url)` is called immediately after `link.click()`. In many browsers (especially Chrome), the download is asynchronous and may be interrupted if the URL is revoked before the browser initiates the download. Users may see incomplete or cancelled downloads.

**Mitigation:** Use a small timeout or the `fetch` + `saveAs` pattern.

---

## MEDIUM Risks

### M1. Split-Brain Leader Election (Fallback Path)

**Location:** `src/lib/queue-leader.ts` — `startFallbackCoordination()`

**Risk:** When Web Locks API is unavailable, the system falls back to localStorage + BroadcastChannel coordination. Split-brain (dual leaders) is possible if Tab A's heartbeat write is slow but its broadcast is still arriving, while Tab B sees stale localStorage and declares itself leader.

### M2. Orphaned `watch` Interval on Re-Contest

**Location:** `src/lib/queue-leader.ts` lines 137-144

**Risk:** `watchForLeaderLoss()` sets up `setInterval`. If the follower re-contests and wins before the leader goes stale, the `watch` interval is never cleared. Multiple orphaned intervals accumulate over repeated leader oscillations.

### M3. `processedIdempotencyKeys` Unbounded In-Memory Growth

**Location:** `src/lib/mutation-queue.ts` line 25

**Risk:** Only the localStorage persist is capped (500 keys). The in-memory `Set` grows without bound. In a long-running SPA session with many unique mutations, this can consume significant memory.

### M4. `rateLimitStore` Never Evicts

**Location:** `src/lib/security-monitor.ts`

**Risk:** Every unique key ever checked with `checkRateLimit()` stays in the in-memory Map until page refresh. No TTL or LRU eviction. Over a long SPA session, this grows without bound.

### M5. `clickCounts` Map Never Evicts

**Location:** `src/lib/observation.ts`

**Risk:** Every unique target/operation ever observed stays in the Map until page refresh. No eviction. Over days of SPA usage, thousands of entries accumulate.

### M6. `shutdownRealtime()` Not Called on App Unmount

**Location:** `src/lib/realtime.ts` — consumed by root App component

**Risk:** If the root React component unmounts (HMR, navigation in certain setups), the cleanup interval and active channels Map persist in memory. The cleanup interval continues firing every 5 minutes indefinitely.

### M7. Live WebSocket Messages Lack Dedup

**Location:** `src/lib/realtime.ts` — `processSocketMessage()`

**Risk:** The `seenEventIds` Set is only checked during replay. Live messages from the WebSocket have no dedup check. If the server re-sends a message (transient duplicate), it's processed as a fresh event, triggering redundant cache invalidations.

### M8. `replayMissedEvents` Cursor String Comparison Bug

**Location:** `src/lib/realtime.ts` — `replayMissedEvents()`

**Risk:** Cursor comparison uses string comparison (`String(event.id) > String(newCursor)`). Numeric string IDs like "9" > "10" evaluate as `true` (lexicographic comparison), which is incorrect. This can cause events to be skipped during replay.

### M9. All-Mutations Table Load in Alerts

**Location:** `src/lib/alerts.ts` — `duplicate_mutation_detected` and `fatal_errors` rules

**Risk:** These rules load ALL rows from respective IndexedDB tables into memory with no limit. For a queue with thousands of items, this causes a memory spike every 30 seconds.

### M10. No Cross-Tab Auth State Sync

**Location:** `src/lib/auth-context.tsx`

**Risk:** No `BroadcastChannel` or `storage` event listener for auth state. Logout in one tab does not affect others. Session expiry in one tab does not propagate. Users can have inconsistent auth states across tabs.

### M11. Circuit Breaker State Not Shared Cross-Tab

**Location:** `src/lib/circuit-breaker.ts`

**Risk:** Despite persisting to localStorage, the circuit breaker state is loaded once at module import time. Multiple tabs have diverging in-memory states. A circuit open in one tab is not reflected in another.

### M12. Feature Flag Changes Not Picked Up Cross-Tab

**Location:** `src/lib/feature-flags.ts`

**Risk:** The `cached` object is never invalidated by cross-tab changes. No `window.onstorage` listener. Changing a flag in one tab has no effect in other tabs until page refresh.

---

## LOW Risks

### L1. IndexedDB Cleanup Relies on Scheduler

**Location:** `src/lib/telemetry.ts` / `src/lib/db-cleanup.ts`

**Risk:** If `startTelemetryCleanupScheduler` or `scheduleCleanup` is never called, or the interval is lost on SPA navigation, telemetry/mutation tables grow unboundedly.

### L2. Orphaned Flow Entries in observation.ts

**Location:** `src/lib/observation.ts` — `flowStartTimes` Map

**Risk:** If `observeFlowStart` is called without a matching `observeFlowEnd`, the entry leaks until page refresh.

### L3. CSP Reporter Monkey-Patch Non-Restorability

**Location:** `src/lib/security-monitor.ts` — `setupCspReporter()`

**Risk:** `window.fetch` is permanently monkey-patched with no cleanup. Multiple calls create a chain of wrappers.

### L4. `writeAuditLog` Silently Drops Entries

**Location:** `src/lib/audit.service.ts`

**Risk:** Audit entries are silently dropped with no retry, no dead-letter queue, no local buffering. The system continues silently without audit trail on failure.

### L5. Abandoned Tab Breadcrumbs Never Cleaned

**Location:** `src/lib/logger.ts`

**Risk:** If a tab crashes, its breadcrumbs remain in localStorage forever. No TTL or cleanup mechanism.

### L6. No AbortController in Any System

**Location:** All async operations across the entire codebase

**Risk:** No async operation can be cancelled. Large uploads, report generation, and queries continue even after component unmount.

---

## Risk Heat Map

```
                    Impact
              Low    Medium   High   Critical
    
    High      L1     M1,M2     H1      C1
                      M6,M8    H2
    Prob.     L2     M3,M4     H3,H4
                      M5       H5
              L3     M7,M9     H6
    Med       L4     M10,M11   H7
              L5     M12       H8
    
    Low       L6
    
```

---

## Risk Count Summary

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 4 | C1, C2, C3, C4 |
| HIGH | 8 | H1, H2, H3, H4, H5, H6, H7, H8 |
| MEDIUM | 12 | M1-M12 |
| LOW | 6 | L1-L6 |
| **Total** | **30** | |

---

## Recommended Fix Order

1. **C1** — Fix billing idempotency keys (prevents duplicate financial transactions)
2. **C2** — Fix unhandled promise rejection in auth mount
3. **C3** — Add subscription re-establishment on reconnect
4. **C4** — Add WebSocket close/error handlers
5. **H1** — Fix cross-tab telemetry race
6. **H2** — Add token refresh retry
7. **H3** — Fix idempotency mark ordering
8. **H4** — Wire up moveToDeadLetter()
9. **H5** — Reset reconnectCount on success
10. **H6** — Add online/offline queue processing listeners
