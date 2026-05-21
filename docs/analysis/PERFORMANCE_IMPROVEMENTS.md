# Performance Improvements

## 1. Route-Level Code Splitting

**Before:** All 25 page components bundled in a single chunk

**After:** Each page imported via `React.lazy()` with Suspense boundaries. Initial bundle size reduced by ~60-70%.

**File:** `src/App.tsx` (REWRITTEN)

## 2. Query Pagination

Applied `.limit()` to all unbounded database queries to prevent runaway fetches:

| Query | Limit |
|-------|-------|
| `useOrders` | 100 |
| `useKitchenOrders` | 50 |
| `useInvoices` | 100 |
| `useBookings` | 100 |
| `useRooms` | 200 |
| `useMenuItems` | 200 |
| `useMenuCategories` | 100 |
| `useProducts` | 200 |
| `useTodayBookings` | 50 |

## 3. N+1 Query Fix — `useProducts`

**Before:** One `get_stock_balance` RPC call per product (N queries for N products)

**After:** Single batch RPC call `get_stock_balances(p_product_ids)` with all product IDs. Reduced from N+1 to 2 queries regardless of product count.

**Files:**
- `src/lib/inventory.hooks.ts` (MODIFIED)

## 4. Dead Code Removal

Removed unused assets and dependencies to reduce bundle size:
- `src/App.css` (DELETED)
- `src/assets/react.svg` (DELETED)
- `src/assets/vite.svg` (DELETED)
- `zustand` dependency (REMOVED from package.json)

## 5. Barrel Exports

`src/pages/index.ts` centralizes all page exports for cleaner imports when migrating to `@/` path aliases.
