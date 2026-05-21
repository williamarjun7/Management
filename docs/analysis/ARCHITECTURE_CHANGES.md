# Architecture Changes

## 1. Hook Module Split

**Before:** Single monolithic `src/lib/hooks.ts` (1,341 lines) containing all TanStack Query hooks

**After:** 7 domain-specific files + 7-line barrel re-export:

```
src/lib/
  query-keys.ts          — Centralized query key definitions
  orders.hooks.ts        — Kitchen orders + orders CRUD + status RPCs
  menu.hooks.ts          — Menu categories + menu items CRUD
  tables.hooks.ts        — Tables, sessions, workflow state
  billing.hooks.ts       — Invoices, payment processing RPCs
  motel.hooks.ts         — Rooms, bookings, check-in/out, room services
  inventory.hooks.ts     — Products, stock movements, audit logs
  hooks.ts               — Barrel re-export (backward compatible)
```

**Benefits:**
- Tree-shakeable imports
- Faster IDE autocomplete
- Easier testability
- Clear ownership boundaries

## 2. Code Splitting

**Before:** All 25 route components eagerly imported in `App.tsx`

**After:** Dynamic imports via `React.lazy()` with `SuspenseWrapper`:
```tsx
const MenuPage = lazy(() => import('./pages/menu/MenuPage'));
// ...
<Suspense fallback={<SuspenseWrapper />}>
  <MenuPage />
</Suspense>
```

## 3. Barrel Exports

Created `src/pages/index.ts` re-exporting all 25 pages for clean imports when using `@/` path alias.

## 4. Path Aliases

**`tsconfig.app.json`:**
```json
{
  "baseUrl": ".",
  "paths": { "@/*": ["src/*"] }
}
```

**`vite.config.ts`:**
```ts
resolve: { alias: { '@': path.resolve(__dirname, 'src') } }
```

Migration from relative paths to `@/` is optional and gradual.

## 5. Image Upload Architecture

`ImageUpload.tsx` component encapsulates:
- File type validation (images only)
- File size validation (max 5MB)
- Upload progress state
- Preview display
- Remove functionality
- Error display

Used by: MenuItemDialog, RoomDialog, RoomDetailPage (×2 — room + room type)
