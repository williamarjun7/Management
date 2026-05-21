# Query Optimization Report

## Pre-Refactoring Issues

### 1. Unbounded Fetches
All fetch queries lacked `.limit()` clauses, meaning a growing database would return increasingly large result sets with no upper bound.

**Risk:** Memory pressure on client, slow renders, network timeouts.

### 2. N+1 Pattern in `useProducts`
```typescript
// BEFORE: N+1 queries
const products = await fetchProducts();
const enriched = await Promise.all(
  products.map(p => getStockBalance(p.id)) // 1 query per product
);
```

### 3. Unused Dependencies
`zustand` was installed but never imported anywhere in the codebase.

## Applied Optimizations

### 1. `.limit()` on all Query Functions

Every `useQuery` that fetches a list now has a hard upper bound:

| Hook | File | Limit | Rationale |
|------|------|-------|-----------|
| `useOrders` | orders.hooks.ts | 100 | Recent orders view |
| `useKitchenOrders` | orders.hooks.ts | 50 | Active kitchen tickets |
| `useInvoices` | billing.hooks.ts | 100 | Recent invoices |
| `useBookings` | motel.hooks.ts | 100 | Recent bookings |
| `useRooms` | motel.hooks.ts | 200 | All rooms (bounded by hotel size) |
| `useRoomTypes` | motel.hooks.ts | 100 | Room types (typically <20) |
| `useTodayBookings` | motel.hooks.ts | 50 | Single day bound |
| `useMenuItems` | menu.hooks.ts | 200 | Menu items per category |
| `useMenuCategories` | menu.hooks.ts | 100 | Categories (typically <30) |
| `useProducts` | inventory.hooks.ts | 200 | Active products |
| `useStockMovements` | inventory.hooks.ts | 100 | Already had limit |

### 2. Batch RPC for Stock Balances

```typescript
// AFTER: 2 queries total (products + 1 batch RPC)
const { data: balances } = await insforge.database.rpc('get_stock_balances', {
  p_product_ids: productIds,
});
```

Eliminates the N+1 pattern. The `get_stock_balances` RPC accepts an array of product IDs and returns all balances in a single database round-trip.

### 3. Index-Only Column Selection

`useAuditLogs` selects only needed columns (`id, event_type, entity_type, entity_id, payload, created_at`) instead of `*`.

## Future Recommendations

1. **Cursor-based pagination** — For high-volume tables (orders, invoices, audit_logs), implement cursor-based pagination with "Load More" buttons instead of fixed limits.
2. **Query key normalization** — Some hooks use hardcoded string keys (`['invoices']`) while others use `queryKeys.invoices`. Standardize on `queryKeys`.
3. **Dedicated stock_balance view** — Create a materialized view for stock balances to avoid the RPC call entirely in `useProducts` and `useProduct`.
