# Auth Stability Report

**Generated:** 2026-05-17
**Scope:** Authentication lifecycle, session management, token refresh, cross-tab sync

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                   auth-context.tsx                        │
│                                                          │
│  Mount Effect                                            │
│    ├── getCurrentUser() → fetchUserProfile()             │
│    ├── Set user, authStatus, loading=false               │
│    └── .catch() handler ← FIXED (was unhandled)          │
│                                                          │
│  onAuthStateChange Listener                              │
│    ├── SIGNED_OUT → clearState()                         │
│    └── TOKEN_REFRESHED → bump session timer              │
│                                                          │
│  Focus Handler                                           │
│    ├── Debounced (2s)                                    │
│    ├── If staff user: refreshSession() with retry ← NEW  │
│    └── If !user: recoverSession()                        │
│                                                          │
│  Storage Event Listener ← NEW                            │
│    └── Detects SESSION_START_KEY removal from other tab  │
│                                                          │
│  refreshSession() ← FIXED                                │
│    ├── Acquires refreshMutex (was unused)                │
│    ├── Up to 3 retries with exponential backoff ← NEW    │
│    └── Anomaly counting + Sentry alert on 5 failures     │
│                                                          │
│  signIn/signUp/verifyEmail/signOut                       │
│    └── Full lifecycle with error classification          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Hardening Applied

### 1. Unhandled Promise Rejection on Mount (C2)

**Before:** `insforge.auth.getCurrentUser().then(...)` had no `.catch()` handler. If the promise rejected (network error, SDK crash), the rejection was unhandled, causing a browser console error and potential React error boundary catch.

**After:** Added `.catch((err) => { ... })` handler that logs the error and sets `loading=false`, ensuring graceful degradation even when the SDK throws.

### 2. Token Refresh with Retry (H2)

**Before:** A single token refresh failure immediately triggered `expireStaffSession()`, logging the user out on the first transient network blip. No retry, no grace period.

**After:** `refreshSession()` now:
- Acquires `refreshMutex` to prevent concurrent refresh attempts
- Retries up to 3 times with exponential backoff (1s, 2s, 4s)
- Only returns null (triggering session expiry) after all retries fail
- Maintains same anomaly counting and Sentry alert threshold (5 consecutive failures)

### 3. Cross-Tab Auth State Sync (M10)

**Before:** No `BroadcastChannel` or `storage` event listener for auth state. Logout in one tab did not affect others. Session expiry was not propagated across tabs.

**After:** Added `window.addEventListener('storage', ...)` that detects when `SESSION_START_KEY` is removed by another tab (session expiry or sign-out) and reacts by clearing auth state.

### 4. Mutex Usage (Part of H2)

**Before:** `refreshMutex` and `recoverMutex` were created at module level but never acquired. No concurrency protection for refresh/recovery operations.

**After:** `refreshSession()` now acquires `refreshMutex` to prevent concurrent refresh attempts from focus events or SDK triggers.

---

## Session Management

| Feature | Behavior |
|---------|----------|
| Staff session duration | 24 hours (configurable via `SESSION_DURATION`) |
| Admin/manager roles | Exempt from session expiry |
| Session timer | Bumped on `TOKEN_REFRESHED` event and `refreshSession()` success |
| Expiry check | On mount, on focus, and on storage events from other tabs |
| Force logout | `expireStaffSession()` signs out, clears state, removes session timer |

---

## Token Refresh Flow

```
Focus event (staff) or SDK auto-trigger
  → refreshSession()
    → acquire refreshMutex
    → for attempt = 0..2:
      → insforge.auth.refreshSession()
      → success → reset anomaly, return session
      → failure → log, increment anomaly
        → if anomaly >= 5 → captureError (Sentry)
        → if attempt < 2 → await backoff(1000 * 2^attempt)
    → return null
  → release refreshMutex

If null returned (all retries failed):
  → expireStaffSession()
```

## Remaining Risks

| Risk | Severity | Description |
|------|----------|-------------|
| No `AbortController` in auth | LOW | Pending auth requests are not cancelled on unmount. Cancellation flag prevents state updates, but network requests complete. |
| `ensureProfile` double-fetch | LOW | On sign-in, profile is fetched, then potentially inserted, then fetched again. Unnecessary second fetch. |
| No `BroadcastChannel` auth sync | MEDIUM | Current cross-tab sync relies on `storage` events (localStorage changes). These require same-origin and don't fire in all cases (e.g., private browsing). Could be enhanced with `BroadcastChannel`. |
