# Highlands Cafe & Motel Inn — Comprehensive UI/UX Audit Report

> **Audit Date:** June 28, 2026
> **Project Version:** 1.5.1
> **Build Status:** ✅ Passes (zero errors)

---

## Executive Summary

| Category | Score |
|---|---|
| **Responsiveness** | 68/100 |
| **Mobile UX** | 68/100 |
| **Desktop UX** | 82/100 |
| **Accessibility (WCAG)** | 50/100 |
| **Visual Consistency** | 58/100 |
| **Mobile-First Implementation** | 55/100 |
| **Performance** | 72/100 |
| **Overall UI/UX** | 65/100 |

**Key Strengths:**
- Comprehensive route structure with role-based access
- Dark mode fully implemented via CSS custom properties
- Solid Tailwind-based design system with CSS variables
- Route-level code splitting with React.lazy
- Keyboard-aware layout for mobile form use
- Safe-area-inset support for notch devices
- Toast notification system with live regions
- Clean PageTransition animations

**Critical Gaps:**
- Widespread hardcoded color values bypassing theme system
- Multiple pages use icon-only buttons without `aria-label`
- Search/select inputs lack proper `<label>` elements
- Custom modals missing `role="dialog"` and `aria-modal`
- No `prefers-reduced-motion` support anywhere
- Touch targets consistently below 44×44px WCAG minimum
- Many pages were built desktop-first, not mobile-first
- Color-only status indicators throughout admin pages

---

## Route Inventory (33 Routes)

### Public Routes (9)
| Path | Component | Notes |
|---|---|---|
| `/login` | `LoginPage` | Standard login |
| `/signup` | `SignUpPage` | Staff registration |
| `/admin/login` | `AdminLoginPage` | Admin login |
| `/admin/signup` | `AdminSignUpPage` | Requires admin code |
| `/verify-email` | `VerifyEmail` | OTP verification |
| `/staff` | `StaffPage` | Staff lookup |
| `/pos` | `PosPage` | Public POS (shadows protected version) |
| `/admin` | → Redirect to `/dashboard` | |
| `*` | → Redirect to `/pos` | Catch-all |

### Protected Routes (24)
| Path | Component | Allowed Roles |
|---|---|---|
| `/` | → Redirect to `/pos` | All authenticated |
| `/dashboard` | `DashboardPage` | All roles |
| `/pos` | `PosPage` *(unreachable — shadowed by public)* | admin, manager, staff |
| `/orders` | `OrdersPage` | admin, manager, staff |
| `/orders/new` | `CreateOrderPage` | admin, manager, staff |
| `/kitchen` | `KitchenPage` | admin, kitchen |
| `/menu` | `MenuPage` | admin, manager, staff |
| `/inventory` | `InventoryPage` | admin, manager, staff |
| `/billing` | `BillingPage` | admin, manager, staff |
| `/billing/new` | → Redirect to `/pos` | — |
| `/billing/:id` | `InvoiceDetailPage` | admin, manager, staff |
| `/motel` | `MotelPage` | admin, manager, reception, staff |
| `/reports` | `ReportsPage` | admin, manager, owner, reception |
| `/settings` | `SettingsPage` | admin |
| `/audit` | `AuditLogPage` | admin |
| `/analytics` | `OperationalAnalytics` | admin, owner |
| `/system-health` | `SystemHealthPage` | admin |
| `/tables` | `TableManagementPage` | admin, manager, staff |
| `/admin/users` | `UserRoleManagement` | admin |
| `/admin/activity` | `StaffActivityLogs` | admin |
| `/admin/features` | `FeatureFlagsPage` | admin |
| `/admin/queue` | `QueueInspectorPage` | admin |
| `/admin/rooms` | `DiningRoomsPage` | admin, manager |
| `/admin/updates` | `AppUpdatesPage` | admin |

---

## Page-by-Page Report

### Public Pages

#### `/login` — LoginPage
| Metric | Status |
|---|---|
| Responsive | ✅ |
| Mobile-first | ⚠️ Partial |
| Desktop optimized | ✅ |
| Accessibility | ⚠️ |
| UX Score | 70/100 |
| UI Score | 75/100 |

**Issues:**
- 🟡 **Medium** — Form centered on screen; submit button in hard-to-reach middle zone on large phones
- 🟡 **Medium** — No keyboard-aware positioning (uses global Layout keyboard detection — only applies inside Layout)
- 🟢 **Low** — No visible aria-labels on icon-only elements if present

---

#### `/signup` — SignUpPage
| Metric | Status |
|---|---|
| Responsive | ✅ |
| Mobile-first | ⚠️ Partial |
| Desktop optimized | ✅ |
| Accessibility | ⚠️ |
| UX Score | 65/100 |
| UI Score | 70/100 |

**Issues:**
- 🟡 **Medium** — Multi-field form; lacks section grouping
- 🟡 **Medium** — Validation error placement may push submit below fold
- 🟢 **Low** — Touch targets for small links below WCAG 44px

---

#### `/verify-email` — VerifyEmail
| Metric | Status |
|---|---|
| Responsive | ⚠️ |
| Mobile-first | ⚠️ Partial |
| Desktop optimized | ✅ |
| Accessibility | ⚠️ |
| UX Score | 60/100 |
| UI Score | 65/100 |

**Issues:**
- 🟠 **High** — OTP inputs `w-11` (44px) → small on 320px screens. Fixed with `w-10 sm:w-11`
- 🟡 **Medium** — Card padding `p-8` on mobile wastes space. Fixed with `p-4 sm:p-8`
- 🟡 **Medium** — No auto-submit on OTP completion

---

#### `/staff` — StaffPage
| Metric | Status |
|---|---|
| Responsive | ✅ |
| Mobile-first | ⚠️ Partial |
| Desktop optimized | ✅ |
| Accessibility | ⚠️ |
| UX Score | 65/100 |
| UI Score | 70/100 |

**Issues:**
- 🟠 **High** — Search input missing explicit `<label>` element
- 🟡 **Medium** — Staff list rows may have cramped action buttons on mobile
- 🟢 **Low** — No empty state illustration

---

#### `/pos` — PosPage (Public + Protected)
| Metric | Status |
|---|---|
| Responsive | ⚠️ |
| Mobile-first | ❌ Desktop-first |
| Desktop optimized | ✅ |
| Accessibility | ❌ |
| UX Score | 45/100 |
| UI Score | 55/100 |

**Issues:**
- 🔴 **Critical** — Quantity adjuster buttons `h-7 w-7` (28×28px) — far below 44×44px minimum
- 🔴 **Critical** — Cart FAB positioned `bottom-4` overlaps with bottom nav bar
- 🟠 **High** — Search input and toolbar cramped on small phones (320-375px)
- 🟠 **High** — Notes input on cart items `h-7` — below touch target minimum
- 🟡 **Medium** — Mobile cart sheet `max-h-[85vh]` leaves limited scroll space
- 🟡 **Medium** — Category labels `text-[10px]` may overlap on narrow screens
- 🟢 **Low** — `/pos` is publicly accessible AND protected (shadowed route)

---

### Protected Pages (Dashboard)

#### `/dashboard` — DashboardPage
| Metric | Status |
|---|---|
| Responsive | ✅ |
| Mobile-first | ✅ |
| Desktop optimized | ✅ |
| Accessibility | ⚠️ |
| UX Score | 80/100 |
| UI Score | 82/100 |

**Issues:**
- 🟡 **Medium** — Stat cards lack `aria-label` for screen reader context
- 🟡 **Medium** — Chart data color-only indicators
- 🟢 **Low** — No reduced-motion fallback on stat counter animations

---

#### `/orders` — OrdersPage
| Metric | Status |
|---|---|
| Responsive | ✅ |
| Mobile-first | ⚠️ Partial |
| Desktop optimized | ✅ |
| Accessibility | ⚠️ |
| UX Score | 70/100 |
| UI Score | 72/100 |

**Issues:**
- 🟡 **Medium** — Order table rows need sticky header for long lists
- 🟡 **Medium** — Filter buttons have small touch targets
- 🟢 **Low** — No empty state when no orders exist

---

#### `/orders/new` — CreateOrderPage
| Metric | Status |
|---|---|
| Responsive | ⚠️ |
| Mobile-first | ⚠️ Partial |
| Desktop optimized | ✅ |
| Accessibility | ⚠️ |
| UX Score | 65/100 |
| UI Score | 68/100 |

**Issues:**
- 🟠 **High** — Multi-section form; item selection grid small on mobile
- 🟡 **Medium** — No save-as-draft capability
- 🟢 **Low** — Form validation scrolls to top instead of first error

---

#### `/kitchen` — KitchenPage
| Metric | Status |
|---|---|
| Responsive | ⚠️ |
| Mobile-first | ❌ Desktop-first |
| Desktop optimized | ✅ |
| Accessibility | ⚠️ |
| UX Score | 55/100 |
| UI Score | 60/100 |

**Issues:**
- 🟠 **High** — Single column on mobile (`sm:grid-cols-1`); lots of scrolling for busy kitchens
- 🟠 **High** — Filter/sort buttons `px-4 py-1.5` (~36px height) below touch target
- 🟡 **Medium** — Order items list may overflow on long orders
- 🟡 **Medium** — No pull-to-refresh; relies on manual/auto refresh
- 🟢 **Low** — Max `xl:grid-cols-3`; could use `2xl:grid-cols-4` on ultra-wide

---

#### `/menu` — MenuPage
| Metric | Status |
|---|---|
| Responsive | ✅ |
| Mobile-first | ⚠️ Partial |
| Desktop optimized | ✅ |
| Accessibility | ⚠️ |
| UX Score | 70/100 |
| UI Score | 72/100 |

**Issues:**
- 🟡 **Medium** — Category grid could be tighter on mobile
- 🟢 **Low** — Delete buttons `p-1.5` below 44px target
- 🟢 **Low** — No confirmation on bulk actions

---

#### `/menu` — MenuItemDialog & MenuCategoryDialog
| Metric | Status |
|---|---|
| Responsive | ⚠️ |
| Mobile-first | ⚠️ Partial |
| Desktop optimized | ✅ |
| Accessibility | ⚠️ |
| UX Score | 55/100 |
| UI Score | 60/100 |

**Issues:**
- 🟠 **High** — Form content overflows viewport on small screens. Fixed with `max-h-[90vh] overflow-y-auto`
- 🟡 **Medium** — Missing `role="dialog"` and `aria-modal`
- 🟡 **Medium** — Image upload input `h-7` undersized on mobile

---

#### `/inventory` — InventoryPage
| Metric | Status |
|---|---|
| Responsive | ⚠️ |
| Mobile-first | ⚠️ Partial |
| Desktop optimized | ✅ |
| Accessibility | ⚠️ |
| UX Score | 60/100 |
| UI Score | 65/100 |

**Issues:**
- 🟠 **High** — Delete/void action buttons `p-1.5` — below touch target
- 🟡 **Medium** — Stock levels color-only (green/red indicators)
- 🟡 **Medium** — Table not horizontally scrollable on mobile
- 🟢 **Low** — No low-stock badge prominence

---

#### `/billing` — BillingPage
| Metric | Status |
|---|---|
| Responsive | ⚠️ |
| Mobile-first | ⚠️ Partial |
| Desktop optimized | ✅ |
| Accessibility | ⚠️ |
| UX Score | 60/100 |
| UI Score | 65/100 |

**Issues:**
- 🟠 **High** — Tab triggers undersized on mobile (5+ tabs)
- 🟠 **High** — Table rows `py-3` — borderline 44px target
- 🟡 **Medium** — No sticky table header on desktop
- 🟡 **Medium** — Action columns too narrow for touch targets

---

#### `/billing/:id` — InvoiceDetailPage
| Metric | Status |
|---|---|
| Responsive | ✅ |
| Mobile-first | ✅ |
| Desktop optimized | ✅ |
| Accessibility | ⚠️ |
| UX Score | 75/100 |
| UI Score | 78/100 |

**Issues:**
- 🟡 **Medium** — Print button may be hidden on very small screens
- 🟢 **Low** — Payment status color-only indicator

---

#### `/billing` — PaymentModal
| Metric | Status |
|---|---|
| Responsive | ⚠️ |
| Mobile-first | ⚠️ Partial |
| Desktop optimized | ✅ |
| Accessibility | ⚠️ |
| UX Score | 55/100 |
| UI Score | 60/100 |

**Issues:**
- 🟠 **High** — Missing `role="dialog"`, `aria-modal`, `aria-labelledby`
- 🟡 **Medium** — Payment method buttons may overflow on 320px
- 🟡 **Medium** — No keyboard trap inside modal

---

#### `/billing` — PrintInvoice
| Metric | Status |
|---|---|
| Responsive | ⚠️ |
| Mobile-first | ❌ Desktop-first |
| Desktop optimized | ✅ |
| Accessibility | ⚠️ |
| UX Score | 45/100 |
| UI Score | 50/100 |

**Issues:**
- 🟠 **High** — Hardcoded `p-8` padding → cramped on mobile. Fixed with `p-4 md:p-8`
- 🟡 **Medium** — Print-only layout may not render well on mobile browsers
- 🟡 **Medium** — Content may overflow on small viewports
- 🟢 **Low** — No print stylesheet optimization for receipt-sized output

---

#### `/motel` — MotelPage
| Metric | Status |
|---|---|
| Responsive | ✅ |
| Mobile-first | ⚠️ Partial |
| Desktop optimized | ✅ |
| Accessibility | ⚠️ |
| UX Score | 70/100 |
| UI Score | 72/100 |

**Issues:**
- 🟡 **Medium** — Room cards stack well but action buttons small
- 🟡 **Medium** — Room status color-only (green/red)
- 🟢 **Low** — Filter by status lacks selected state visibility

---

#### `/reports` — ReportsPage
| Metric | Status |
|---|---|
| Responsive | ✅ |
| Mobile-first | ⚠️ Partial |
| Desktop optimized | ✅ |
| Accessibility | ⚠️ |
| UX Score | 65/100 |
| UI Score | 70/100 |

**Issues:**
- 🟡 **Medium** — Chart legends hard to read on mobile
- 🟡 **Medium** — Date range pickers not optimized for touch
- 🟢 **Low** — Export buttons could use better spacing

---

#### `/settings` — SettingsPage
| Metric | Status |
|---|---|
| Responsive | ⚠️ |
| Mobile-first | ❌ Desktop-first |
| Desktop optimized | ✅ |
| Accessibility | ⚠️ |
| UX Score | 55/100 |
| UI Score | 60/100 |

**Issues:**
- 🟠 **High** — Long form lists without visual grouping (cards/sections)
- 🟡 **Medium** — Toggle switches too small for comfortable tap
- 🟡 **Medium** — No section headers for organization
- 🟡 **Medium** — ColorPicker component touch target below 44px

---

### Admin Pages

#### `/admin/users` — UserRoleManagement
| Metric | Status |
|---|---|
| Responsive | ⚠️ |
| Mobile-first | ❌ Desktop-first |
| Desktop optimized | ✅ |
| Accessibility | ❌ |
| UX Score | 40/100 |
| UI Score | 45/100 |

**Issues:**
- 🔴 **Critical** — Search input missing `<label>` element
- 🔴 **Critical** — Icon-only action buttons lack `aria-label`
- 🔴 **Critical** — Custom modals missing `role="dialog"`, `aria-modal`, `aria-labelledby`
- 🔴 **Critical** — Role badges hardcode colors (`bg-red-500/10`, `bg-blue-500/10`)
- 🟠 **High** — Status select missing label
- 🟡 **Medium** — Inconsistent focus ring patterns
- 🟡 **Medium** — Table header style differs from other pages

---

#### `/tables` — TableManagementPage
| Metric | Status |
|---|---|
| Responsive | ⚠️ |
| Mobile-first | ❌ Desktop-first |
| Desktop optimized | ✅ |
| Accessibility | ❌ |
| UX Score | 40/100 |
| UI Score | 45/100 |

**Issues:**
- 🔴 **Critical** — Search input missing `<label>`
- 🔴 **Critical** — Status `<select>` missing label
- 🔴 **Critical** — Icon-only action buttons lack `aria-label`
- 🔴 **Critical** — Modal missing dialog ARIA attributes
- 🔴 **Critical** — Status badges hardcode emerald-100/orange-100 colors
- 🟡 **Medium** — Focus uses `focus:border-primary` instead of ring-2 pattern

---

#### `/system-health` — SystemHealthPage
| Metric | Status |
|---|---|
| Responsive | ⚠️ |
| Mobile-first | ❌ Desktop-first |
| Desktop optimized | ✅ |
| Accessibility | ❌ |
| UX Score | 35/100 |
| UI Score | 40/100 |

**Issues:**
- 🔴 **Critical** — 10+ lucide icons with hardcoded colors (`text-blue-600`, `text-purple-600`, etc.)
- 🔴 **Critical** — Status indicators color-only (severity dots)
- 🟠 **High** — Dense stat grid on mobile — `grid-cols-3` inside cards is cramped
- 🟡 **Medium** — No keyboard navigation for expandable sections
- 🟡 **Medium** — Health metrics could use better grouping

---

#### `/admin/activity` — StaffActivityLogs
| Metric | Status |
|---|---|
| Responsive | ⚠️ |
| Mobile-first | ❌ Desktop-first |
| Desktop optimized | ✅ |
| Accessibility | ❌ |
| UX Score | 35/100 |
| UI Score | 40/100 |

**Issues:**
- 🔴 **Critical** — Search input missing `<label>`
- 🔴 **Critical** — Icon-only buttons lack `aria-label`
- 🟠 **High** — Filter chips should use `role="tab"` with `aria-selected`
- 🟡 **Medium** — Expandable rows rely on click-only; no keyboard handler
- 🟢 **Low** — Loading skeleton could be more polished

---

#### `/admin/queue` — QueueInspectorPage
| Metric | Status |
|---|---|
| Responsive | ⚠️ |
| Mobile-first | ❌ Desktop-first |
| Desktop optimized | ✅ |
| Accessibility | ❌ |
| UX Score | 35/100 |
| UI Score | 40/100 |

**Issues:**
- 🔴 **Critical** — Status colors hardcoded (`bg-yellow-100`, `bg-blue-100`, `bg-green-100`)
- 🔴 **Critical** — Status `<select>` missing label
- 🟠 **High** — Expandable rows lack keyboard handler (Enter/Space)
- 🟡 **Medium** — Queue depth visualization color-only
- 🟢 **Low** — No auto-refresh indicator

---

#### `/analytics` — OperationalAnalytics
| Metric | Status |
|---|---|
| Responsive | ⚠️ |
| Mobile-first | ❌ Desktop-first |
| Desktop optimized | ✅ |
| Accessibility | ❌ |
| UX Score | 35/100 |
| UI Score | 40/100 |

**Issues:**
- 🔴 **Critical** — Chart bars hardcode colors (`emerald-500/60`, `cyan-500/60`, `orange-500/60`)
- 🟠 **High** — KPI cards use `<div>` instead of Card component
- 🟡 **Medium** — Chart legends not screen-reader accessible
- 🟡 **Medium** — Data-heavy page; loading states not granular
- 🟢 **Low** — Tooltip on hover only; no touch equivalent

---

#### `/admin/rooms` — DiningRoomsPage
| Metric | Status |
|---|---|
| Responsive | ⚠️ |
| Mobile-first | ❌ Desktop-first |
| Desktop optimized | ✅ |
| Accessibility | ❌ |
| UX Score | 40/100 |
| UI Score | 45/100 |

**Issues:**
- 🔴 **Critical** — Search input missing `<label>`
- 🔴 **Critical** — Icon-only buttons lack `aria-label`
- 🔴 **Critical** — Status badges hardcode emerald-100 color
- 🔴 **Critical** — Modal missing dialog ARIA
- 🟡 **Medium** — Inconsistent focus ring

---

#### `/audit` — AuditLogPage
| Metric | Status |
|---|---|
| Responsive | ⚠️ |
| Mobile-first | ❌ Desktop-first |
| Desktop optimized | ✅ |
| Accessibility | ❌ |
| UX Score | 35/100 |
| UI Score | 40/100 |

**Issues:**
- 🔴 **Critical** — `EVENT_COLORS` maps hardcode 16+ color combos (`bg-blue-100 text-blue-800`, etc.)
- 🔴 **Critical** — Status colors color-only
- 🟠 **High** — Expandable rows lack keyboard handler
- 🟡 **Medium** — Log entries dense on mobile; wraps poorly

---

#### `/admin/features` — FeatureFlagsPage
| Metric | Status |
|---|---|
| Responsive | ✅ |
| Mobile-first | ✅ |
| Desktop optimized | ✅ |
| Accessibility | ✅ |
| UX Score | 85/100 |
| UI Score | 85/100 |

**Issues:** None significant. Correctly uses `<Label htmlFor>` with `<Switch id>`. Clean toggle layout.

---

#### `/admin/updates` — AppUpdatesPage
| Metric | Status |
|---|---|
| Responsive | ⚠️ |
| Mobile-first | ⚠️ Partial |
| Desktop optimized | ✅ |
| Accessibility | ❌ |
| UX Score | 50/100 |
| UI Score | 55/100 |

**Issues:**
- 🔴 **Critical** — Status badges hardcode colors (`red-100`, `emerald-100`)
- 🔴 **Critical** — Icon-only action buttons lack `aria-label`
- 🔴 **Critical** — Modal missing dialog ARIA
- 🟡 **Medium** — Version list could use better visual hierarchy

---

## Global Issues

### 🔴 Critical Issues

| ID | Issue | Category | Pages Affected |
|---|---|---|---|
| G1 | Touch targets below 44×44px (buttons, inputs, icons) | Accessibility / Mobile UX | All pages |
| G2 | Quantity adjuster buttons 28×28px on POS | Mobile UX | PosPage |
| G3 | Cart FAB overlaps bottom nav on mobile | Mobile UX | PosPage |
| G4 | Icon-only buttons lack `aria-label` | Accessibility | All admin pages |
| G5 | Search/select inputs missing `<label>` elements | Accessibility | StaffActivityLogs, UserRoleManagement, TableManagementPage, DiningRoomsPage |
| G6 | Custom modals missing `role="dialog"`, `aria-modal`, `aria-labelledby` | Accessibility | UserRoleManagement, TableManagementPage, DiningRoomsPage, AppUpdatesPage, MenuItemDialog, MenuCategoryDialog, RoomDialog |
| G7 | Hardcoded color values bypass theme system | Visual Consistency | SystemHealthPage, QueueInspectorPage, AuditLogPage, TableManagementPage, DiningRoomsPage, AppUpdatesPage, UserRoleManagement, OperationalAnalytics |
| G8 | Color-only status indicators | Accessibility | SystemHealthPage, QueueInspectorPage, AuditLogPage, InventoryPage |
| G9 | No `prefers-reduced-motion` support | Accessibility | All pages (PageTransition, animations) |
| G10 | Expandable rows lack keyboard handlers | Accessibility | QueueInspectorPage, AuditLogPage |
| G11 | POS is shadowed route (public always wins) | Architecture | App.tsx:110 |
| G12 | `/pos` publicly accessible (intentional?) | Architecture | App.tsx:110 |

### 🟠 High Priority Issues

| ID | Issue | Category | Pages Affected |
|---|---|---|---|
| G13 | Desktop-first layout approach in admin pages | Mobile-First | All admin pages, Kitchen, Billing, Settings |
| G14 | No pull-to-refresh on data pages | Mobile UX | Dashboard, POS, Kitchen, Orders, Inventory |
| G15 | Tab trigger touch targets undersized | Mobile UX | Billing, Reports, Settings |
| G16 | Inconsistent focus ring patterns | Accessibility | Multiple admin pages |
| G17 | Inconsistent table header styling | Visual Consistency | Cross-page |
| G18 | Mixed button patterns (raw `<button>` vs Button component) | Visual Consistency | ~30 pages |
| G19 | Inconsistent modal backdrop opacity | Visual Consistency | UserRoleManagement, TableManagementPage, DiningRoomsPage |
| G20 | Card patterns inconsistent (Card component vs raw div) | Visual Consistency | ~50/50 split |
| G21 | No sticky table headers on desktop | Desktop UX | Billing, Orders, Inventory |
| G22 | Filter chips lack role/aria attributes | Accessibility | StaffActivityLogs |

### 🟡 Medium Priority Issues

| ID | Issue | Category | Pages Affected |
|---|---|---|---|
| G23 | No max-width constraints on content | Desktop UX | All content pages |
| G24 | Kitchen grid could use `2xl:grid-cols-4` | Desktop UX | KitchenPage |
| G25 | Loading state patterns inconsistent | Visual Consistency | Multiple pages |
| G26 | Skeleton loaders underutilized | Performance | Most pages |
| G27 | No empty state illustrations | UX | Orders, Inventory, Reports |
| G28 | Form validation scroll behavior | UX | CreateOrderPage, forms |
| G29 | No auto-submit on OTP completion | UX | VerifyEmail |
| G30 | Inline icon color hardcoding | Visual Consistency | Admin pages |

### 🟢 Low Priority Issues

| ID | Issue | Category | Pages Affected |
|---|---|---|---|
| G31 | Theme toggle no visible label | Mobile UX | Layout |
| G32 | Sidebar close button small | Mobile UX | Layout |
| G33 | Category labels `text-[10px]` may overlap | Mobile UX | PosPage |
| G34 | No print stylesheet for receipts | UX | PrintInvoice |

---

## Component Audit

### UI Components (shadcn-style primitives)

| Component | Responsive | Touch Target | ARIA | Focus | Issues |
|---|---|---|---|---|---|
| **Button** | ✅ | ❌ `h-10`=40px | ✅ `data-[state]` | ✅ `focus-visible:ring` | Default height below 44px |
| **Input** | ✅ | ❌ `h-10`=40px | ✅ | ✅ `focus-visible:ring` | Min-height below 44px |
| **Select** | ✅ | ❌ `h-10`=40px | ✅ `aria-expanded` | ✅ | Min-height below 44px |
| **Card** | ✅ | N/A | ✅ | N/A | Good |
| **Dialog** | ⚠️ | N/A | ❌ | ✅ | Missing `role="dialog"` |
| **Tabs** | ⚠️ | ❌ | ✅ `role="tab"` | ✅ | Tap target undersized |
| **Badge** | ✅ | N/A | ❌ | N/A | Hardcoded colors |
| **Switch** | ⚠️ | ❌ | ✅ `role="switch"` | ✅ `focus-visible` | Small knob |
| **Separator** | ✅ | N/A | ❌ `aria-orientation` | N/A | Minor |
| **Dropdown Menu** | ✅ | ✅ | ✅ | ✅ | Good |
| **BottomSheet** | ✅ | N/A | ⚠️ | ✅ | `overflow-y-auto` fix applied |
| **Toast** | ✅ | N/A | ✅ `aria-live` | N/A | Hardcoded variant colors |
| **Avatar** | ✅ | N/A | ✅ | N/A | Good |

### Business Components

| Component | Responsive | Touch Target | States | Issues |
|---|---|---|---|---|
| **TableGrid** | ✅ | ⚠️ | ✅ Loading, empty | Action tap targets small |
| **TableCard** | ✅ | ⚠️ | ✅ Loading, empty | Status color-only |
| **RoomGrid** | ✅ | ✅ | ✅ Loading, empty | Good |
| **RoomCard** | ✅ | ✅ | ✅ Loading, empty | Action buttons small |
| **RoomList** | ✅ | ✅ | ✅ Loading, empty | Good |
| **RoomFilters** | ✅ | ⚠️ | ✅ | Input focus pattern inconsistent |
| **OrderCard** | ✅ | ⚠️ | ✅ Loading, empty | Action targets below 44px |
| **KitchenOrderCard** | ⚠️ | ⚠️ | ✅ Loading, empty | Long item overflow |
| **PaymentCheckout** | ⚠️ | ⚠️ | ⚠️ | Missing ARIA on modal |
| **FonepayQRDialog** | ⚠️ | ✅ | ⚠️ | Missing dialog ARIA |
| **ConfirmDialog** | ✅ | ✅ | ✅ | **Good** — has focus mgmt + Escape |
| **SyncAdminPanel** | ⚠️ | ⚠️ | ✅ | Dense on mobile |
| **OfflineBanner** | ✅ | N/A | ✅ | Hardcoded colors |
| **ImageUpload** | ⚠️ | ❌ | ✅ | Input too small |
| **ColorPicker** | ⚠️ | ❌ | ✅ | Swatches below touch target |

---

## Interaction & State Coverage

| State | Coverage | Issues |
|---|---|---|
| **Loading** | ⚠️ Partial | Some pages use `animate-pulse` text, others spinner. Inconsistent patterns. |
| **Empty** | ❌ Poor | Most pages lack dedicated empty states. No illustrations. |
| **Error** | ✅ Good | Error boundaries in place (Sentry). ErrorAlert component available. |
| **Success** | ⚠️ Partial | Toast used inconsistently. Some actions lack success feedback. |
| **Skeleton** | ❌ Missing | Not used anywhere. Text pulse animation on some pages. |
| **Disabled** | ✅ Good | Button component supports disabled state visually. |
| **Hover** | ✅ Good | Hover states on buttons, cards, interactive elements. |
| **Focus** | ⚠️ Partial | Focus rings on form elements but inconsistent on action buttons. |
| **Active/Pressed** | ⚠️ Partial | Scale transform on some buttons, not all. |
| **Selected** | ✅ Good | Active nav states, tab states. |
| **Reduced Motion** | ❌ Missing | Not implemented anywhere. |

---

## Performance & Rendering

| Metric | Status | Notes |
|---|---|---|
| **Route-level code splitting** | ✅ | React.lazy on all pages |
| **Build size** | ✅ | Main JS 493KB (155KB gzip), reasonable |
| **CSS size** | ✅ | Tailwind JIT — minimal CSS |
| **DOM complexity** | ⚠️ | Large tables may cause reflow |
| **CLS (Cumulative Layout Shift)** | ⚠️ | No image dimensions on some elements |
| **Lazy loading** | ⚠️ | Only route-level; no image lazy loading |
| **Re-renders** | ✅ | React Query caching helps |
| **Animation performance** | ✅ | CSS transforms only (GPU accelerated) |

---

## Cross-Browser Considerations

| Feature | Compatibility Concern |
|---|---|
| `env(safe-area-inset-*)` | ✅ Modern browsers / iOS Safari |
| `backdrop-blur` | ⚠️ Firefox may have perf issues |
| `overscroll-behavior` | ✅ Modern browsers |
| Tailwind `lg:` breakpoint | ✅ Consistent across browsers |
| CSS custom properties | ✅ Modern browsers |
| `-webkit-tap-highlight-color` | ✅ iOS only |
| `-webkit-overflow-scrolling: touch` | ⚠️ Deprecated in newer iOS |

---

## Prioritized Action Plan

### 🔴 Critical — Fix Immediately

| # | Issue | Effort | UX Impact |
|---|---|---|---|
| 1 | Fix global touch targets (Button, Input, Select → `min-h-[44px]`) | 2h | Very High |
| 2 | Add `aria-label` to all icon-only buttons | 3h | High |
| 3 | Fix POS quantity buttons (28×28px → 44×44px) | 1h | High |
| 4 | Fix POS cart FAB overlap with bottom nav | 1h | High |
| 5 | Add `<label>` elements to search/select inputs | 2h | High |
| 6 | Replace hardcoded colors with theme CSS variables | 6h | High |
| 7 | Add color+text status indicators (not color-only) | 4h | High |
| 8 | Add `aria-modal`, `role="dialog"` to custom modals | 3h | High |
| 9 | Add `prefers-reduced-motion` fallback to animations | 1h | Medium |
| 10 | Add keyboard handlers (Enter/Space) to expandable rows | 2h | Medium |
| 11 | Resolve shadowed `/pos` route | 1h | Low |

### 🟠 High — Fix Soon

| # | Issue | Effort | UX Impact |
|---|---|---|---|
| 12 | Add `max-w-7xl mx-auto` to content pages | 2h | Medium |
| 13 | Implement pull-to-refresh on data pages | 4h | High |
| 14 | Standardize focus ring pattern across all pages | 2h | Medium |
| 15 | Standardize table headers (uppercase vs normal) | 1h | Low |
| 16 | Ensure all interactive elements use Button component | 3h | Medium |
| 17 | Standardize modal backdrop opacity | 1h | Low |
| 18 | Add sticky headers to data tables | 2h | Medium |
| 19 | Add `aria-selected` to filter chips | 1h | Medium |

### 🟡 Medium — Fix When Possible

| # | Issue | Effort | UX Impact |
|---|---|---|---|
| 20 | Add skeleton loaders to data-fetching pages | 4h | Medium |
| 21 | Add empty state illustrations | 3h | Medium |
| 22 | Standardize loading state pattern | 2h | Low |
| 23 | Add `2xl:grid-cols-4` to kitchen grid | 0.5h | Low |
| 24 | Auto-submit OTP on completion | 1h | Medium |
| 25 | Add section grouping to Settings page | 1h | Medium |
| 26 | Add keyboard-aware form positioning to auth pages | 2h | Medium |
| 27 | Normalize Card component usage | 2h | Low |

### 🟢 Low — Nice to Have

| # | Issue | Effort | UX Impact |
|---|---|---|---|
| 28 | Add visible label to theme toggle | 0.5h | Low |
| 29 | Add print stylesheet for invoices | 2h | Low |
| 30 | Increase sidebar close button target | 0.5h | Low |
| 31 | Add save-as-draft to order creation | 3h | Medium |
| 32 | Auto-size OTP input gap on mobile | 0.5h | Low |

---

## Recommended Implementation Order

1. **Accessibility fixes** (G4-G10) — legal/ethical imperative
2. **Touch target fixes** (G1-G3) — highest UX impact
3. **Color system hardening** (G7-G8) — maintainability
4. **POS UX overhaul** (G2, G3, G11-G12) — core business page
5. **Mobile-first refactoring** — admin pages, Kitchen, Billing
6. **State coverage** — skeletons, empty states, error feedback
7. **Animation & polish** — reduced motion, transitions, consistency

---

## Architecture Note

The project uses a **desktop-first layout** with a `lg:` (1024px) breakpoint as the mobile/desktop pivot. The `<Layout>` component conditionally renders a sidebar (≥1024px) or bottom nav (<1024px). This works functionally but:

- Admin pages were clearly designed with ≥1280px viewports in mind
- Mobile layouts often feel like collapsed desktop versions rather than purpose-built mobile experiences
- Several pages (Kitchen, POS, SystemHealth) have cramped mobile layouts that need dedicated mobile passes

The **recommended approach** is to keep the current architecture but add a mobile-first CSS reset layer in critical pages and adopt a "content adapts, not shrinks" philosophy going forward.

---

*Report generated by multi-agent audit system on Jun 28, 2026.*
