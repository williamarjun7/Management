# QA Test Plan — Highlands Cafe & Motel Inn v1.5.1

## Test Infrastructure
- **Framework**: Vitest v4.1.6
- **Environment**: Node (with fake-indexeddb, localStorage polyfills, BroadcastChannel mock)
- **Coverage tool**: none configured
- **Existing tests**: 10 files, 62 tests (all passing)
- **CI**: none detected

---

## Existing Test Coverage (62 tests)

| Area | File | Tests | Focus |
|------|------|-------|-------|
| Auth helpers | `auth-flow.test.ts` | 16 | Error detection (isExistsUnverified, isEmailNotVerified), signUp/signIn/verifyEmail/signOut flows |
| Queue pressure | `chaos/01-queue-pressure.test.ts` | 2 | 100-item enqueue, mixed status integrity |
| Reconnect storm | `chaos/02-reconnect-storm.test.ts` | 2 | Circuit breaker after 10 failures, queue integrity during toggle |
| Tab crash recovery | `chaos/03-tab-crash-recovery.test.ts` | 3 | Processing state recovery, timeout window, dead letter |
| Quota exhaustion | `chaos/04-quota-exhaustion.test.ts` | 2 | IndexedDB quota error, transient failure recovery |
| Dual-write mismatch | `chaos/05-dual-write-mismatch.test.ts` | 3 | localStorage/IndexedDB corruption detection/recovery |
| Delayed RPC timeout | `chaos/06-delayed-rpc-timeout.test.ts` | 3 | Circuit breaker on timeout, failure accumulation, pending tracking |
| Stale replay | `chaos/07-stale-replay.test.ts` | 3 | Replay filtering, sequence progress, persistence |
| Long-run simulation | `chaos/08-long-run-simulation.test.ts` | 7 | Memory leak (500 cycles), contention (20 concurrent), sleep/wake, multi-tab (12h), cleanup, rapid cycles, dedup |
| Stability fixes | `chaos/09-stability-fixes.test.ts` | 15 | Idempotency stability, dead letter flow, cross-tab sync (4 cases), mark-then-process order, capacity tracking |

---

## Coverage Gaps — Missing Tests

### P0 — Critical (core business flow, data integrity risk)

| # | Area | What to test | Why |
|---|------|-------------|-----|
| T1 | **POS flow** | Add items, modify quantities, apply discounts, select table, complete payment via cash/FonePay/credit, verify invoice + order created | Core revenue flow; no existing coverage |
| T2 | **Order lifecycle** | Create → pending → preparing → ready → served → paid → cancelled at each stage | Order state machine; no existing coverage |
| T3 | **Payment workflows** | Cash payment, FonePay QR payment, credit account payment, partial payment, refund, idempotency (replay safety) | Direct money handling; uncovered |
| T4 | **Auth context** | Login, signup, OTP verification, session refresh, role-based route access, token expiry redirect, signout clears state | Gate to entire app; no component test |
| T5 | **Billing** | Create invoice from order, add items, calculate totals with/without discount, close invoice after payment, print format | Revenue recording; uncovered |
| T6 | **Inventory & stock** | Add stock movement, auto-deduct on order completion, low-stock threshold alert, negative stock prevention | Business assets; uncovered |

### P1 — High (module stability, user workflows)

| # | Area | What to test | Why |
|---|------|-------------|-----|
| T7 | **Menu CRUD** | Create/edit/delete categories + items, toggle availability, modifier groups | No coverage |
| T8 | **Kitchen Display** | Real-time order reception, status update reflects immediately, sound notification on new order, role gate (kitchen only) | Operational; uncovered |
| T9 | **Motel room management** | Room status flow (available→occupied→maintenance→available), check-in/check-out with booking, room service billing | Hotel operations; uncovered |
| T10 | **Table management** | Assign table to order, merge/split tables, mark occupied/vacant, session management | Restaurant ops; uncovered |
| T11 | **Reports** | Sales report (daily/weekly/monthly), occupancy report, product popularity, date filter correctness | Business decisions; no tests |
| T12 | **Settings** | Each settings tab renders, role-based access (staff cannot see admin settings), save/load preferences, branding/barcode/printer config | Config integrity; uncovered |

### P2 — Medium (secondary features, admin tools)

| # | Area | What to test | Why |
|---|------|-------------|-----|
| T13 | **Admin — Audit Log** | Log rendering, filter by event type/date, pagination, detail expansion | Compliance; uncovered |
| T14 | **Admin — Analytics** | Chart rendering, date-range filtering, KPI calculations | Management; uncovered |
| T15 | **Admin — System Health** | Connection status, realtime status, queue health display, last sync timestamp | Ops monitoring; uncovered |
| T16 | **Admin — User Roles** | List users, change role, disable/enable user, role permission reflection | Security; uncovered |
| T17 | **Admin — Feature Flags** | Toggle flag, verify feature is gated correctly, role-based override | Release mgmt; uncovered |
| T18 | **Admin — App Updates** | Version display, update check, force-update logic | Deployment; uncovered |
| T19 | **Admin — Queue Inspector** | Pending/failed/dead-letter display, retry, purge | Offline health; uncovered |

### P3 — Low (edge cases, resilience, polish)

| # | Area | What to test | Why |
|---|------|-------------|-----|
| T20 | **Offline behavior** | Queue mutations offline, sync when online, conflict resolution, circuit breaker open/close lifecycle | Offline-first; partial coverage in chaos |
| T21 | **FonePay integration** | QR generation, transaction ID capture, polling for confirmation, timeout handling, error display | Payment gateway; uncovered |
| T22 | **Real-time subscriptions** | WebSocket connect/disconnect/reconnect, table/order/room update propagation | Live updates; uncovered |
| T23 | **Role-based access** | Every route tested for each role (admin, manager, owner, staff, kitchen, reception) — redirect on unauthorized | Security; uncovered |
| T24 | **Error boundaries** | Component crash does not break whole app, error page with retry | UX resilience; uncovered |
| T25 | **Print invoice** | Browser print dialog trigger, barcode rendering on invoice | Operational; uncovered |
| T26 | **CSV export** | Export reports to CSV, data correctness, encoding | Data export; uncovered |
| T27 | **Cross-tab sync** | Order update in tab A reflects in tab B, BroadcastChannel state sync | Multi-tab; partial in chaos |
| T28 | **Large dataset rendering** | 500+ menu items, 1000+ orders, 200+ invoices — virtual scroll or pagination behavior | Performance; uncovered |

---

## Recommended Priority Test Execution Order

```
Phase 3 — Functional:   T1, T2, T4, T7, T9, T10
Phase 4 — UI/UX:        T8, T12, T23, T24
Phase 5 — Business:     T3, T5, T6, T11
Phase 6 — API:          T21, T22
Phase 7 — Database:     integrated with functional tests
Phase 8 — Security:     T16, T23
Phase 9 — Performance:  T28
Phase 10 — Regression:  re-run all 62 existing + new tests
Phase 11 — Edge Cases:  T20, T27, T25, T26
```

---

## Test Environment Requirements

1. **Unit/Integration tests**: Vitest + fake-indexeddb (current setup works)
2. **Component tests**: Need `@testing-library/react` + `jsdom` environment in vitest
3. **E2E tests**: Need Playwright or Cypress with a running dev server + test backend
4. **Backend seed data**: InsForge test project with seed SQL for rooms, tables, menu items, users by role

**Current gap for component/E2E**: `vitest.config.ts` uses `environment: 'node'` — component tests require `environment: 'jsdom'`. Need `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`.

---

## Next Steps

1. Install component testing dependencies
2. Write tests in priority order (P0 → P1 → P2 → P3)
3. Configure coverage reporting
4. Set up CI pipeline
5. Execute phases 3–11 per plan above
