# Security Fixes

## 1. Admin Code Verification

**Before:** Hardcoded string `ADMIN-2026` checked in `AdminSignUpPage.tsx`

**After:** Edge function `verify-admin-code` invoked via `insforge.functions.invoke()`. Admin code stored server-side, not in client bundle.

**Files:**
- `edge-functions/verify-admin-code/index.js` (NEW)
- `src/pages/auth/AdminSignUpPage.tsx` (MODIFIED)

## 2. RLS Policy Hardening

**Migration:** `20260517000001_rls_hardening.sql`

**Added RLS policies for missing tables:**
- `payment_intents` — authenticated_all policy
- `recipes` — authenticated_all policy
- `recipe_versions` — authenticated_all policy
- `recipe_items` — authenticated_all policy
- `inventory_holds` — authenticated_all policy

**Added ON DELETE CASCADE on 12 FK relationships:**
- order_items → orders
- invoice_items → invoices
- payment_logs → invoices
- room_services → bookings
- bookings → rooms
- room_state_transitions → rooms
- menu_items → menu_categories
- recipes → menu_items
- recipe_versions → recipes
- recipe_items → recipe_versions
- stock_movements → products
- invoices → orders (SET NULL, not CASCADE)

**Added UNIQUE constraints on idempotency_key:**
- `orders.idempotency_key`
- `invoices.idempotency_key`
- `payment_intents.idempotency_key`
- `payment_logs.idempotency_key`
- `stock_movements.idempotency_key`
- `bookings.idempotency_key`

**Converted remaining safe SECURITY DEFINER functions to INVOKER:**
- `reserve_inventory` → SECURITY INVOKER
- `release_inventory` → SECURITY INVOKER
- `record_stock_movement` → SECURITY INVOKER

## 3. JWT Session Management

**Before:** 30-second polling `setInterval` for session checks

**After:** `onAuthStateChange` listener for SIGNED_OUT/TOKEN_REFRESHED events + `window.addEventListener('focus', ...)` for on-demand check + `refreshSession()` using `insforge.auth.refreshSession()`

**File:** `src/lib/auth-context.tsx` (MODIFIED)
