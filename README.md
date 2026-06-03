# Highlands Cafe & Motel Inn — Hospitality OS

One system to run the table, the kitchen, the rooms, and the books.

## What It Is

A full-stack hospitality management platform built for a cafe + motel operation. Not a generic SaaS wrapper — purpose-built, offline-resilient, and realtime to the bone.

### Restaurant Operations
| | |
|---|---|
| **POS** | Create orders, assign tables, apply discounts, ring up |
| **Kitchen Display** | Realtime order cards with elapsed timers, sound alerts, START/READY actions |
| **Table Management** | Visual grid — 9 status states from available to cleaning |
| **Menu Builder** | Categories, items with modifiers, images, prep times, availability toggles |
| **Billing** | Invoices, partial payments, discounts, refunds, receipts, print |
| **Split Bill** | Equal / by-item / custom splits — each guest pays independently |
| **Inventory** | Products, stock movements (purchase/sale/wastage), reorder alerts, forecasting |
| **Purchasing** | Suppliers, purchase orders, receiving workflows |
| **Recipes** | Versioned recipes linking products to menu items |

### Motel Operations
| | |
|---|---|
| **Rooms** | Manage types, pricing, floor plans, images |
| **Bookings** | Check-in/check-out flows, guest tracking, ID proof capture |
| **Calendar** | 30-day booking outlook with room assignments |
| **Housekeeping** | Task assignment with priorities, completion auto-updates room status |
| **Maintenance** | Request scheduling with cost tracking, room status bridge |
| **Room Service** | Chargeable service items billed to bookings |
| **Recurring Guests** | Repeat detection by email/phone with stay history & spend |

### Analytics & Admin
| | |
|---|---|
| **Revenue Analytics** | Daily revenue, payment breakdowns, AOV trends, 7-day forecasts |
| **Occupancy Forecasting** | Room occupancy projections |
| **Staff Analytics** | Role distribution, order counts per staff |
| **Inventory Analytics** | Low stock, movement trends, stock forecasting |
| **Operational Dashboard** | Queue health, realtime diagnostics, telemetry metrics |
| **System Reports** | Production readiness, observability, reliability, security, database health |
| **User & Roles** | admin, manager, owner, kitchen, staff, reception — route-level gating |
| **Audit Log** | Full event history with diffs |
| **Feature Flags** | Toggle circuit breaker, dual-write, replay, chaos mode at runtime |

### Engineering That Matters

**Offline-first** — Dexie.js + localStorage dual-write mutation queue. Close the tab, lose the network, walk out of range. It processes when it can.

**Circuit breaker** — 10 failures in 30s opens the circuit. Half-open probes. Cross-tab state sync.

**Multi-tab leadership** — Web Locks API + BroadcastChannel. Only one tab drains the queue.

**Idempotency everywhere** — Every mutation carries an idempotency key. Unique partial indexes on the database side. Double-clicks don't double-charge.

**Realtime sync** — WebSocket subscriptions on orders, kitchen, rooms, tables, notifications. Missed event replay on reconnect. Duplicate suppression.

**Telemetry + observation** — 50+ event types tracked. Friction monitoring (repeated clicks, abandoned flows, excessive retries). Structured logging with crash breadcrumbs.

**Security** — Brute force detection (5 attempts / 5min), rate limiting (30 req/min), CSP violation reporting, PII scrubbing, admin-code-gated registration.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19, TypeScript 6, Vite 8, Tailwind CSS 3.4 |
| UI | Radix primitives, lucide-react icons |
| State | TanStack React Query, Zustand |
| Backend | InsForge BaaS (PostgreSQL + PostgREST + Auth + Realtime + Edge Functions) |
| Offline | Dexie.js IndexedDB |
| Monitoring | Sentry (error + replay), custom telemetry |
| Database | 30+ tables, 20+ RPCs, 60+ indexes, full RLS |

## Quick Start

```bash
npm install
cp .env.example .env  # configure your InsForge backend URL and anon key
npm run dev
```

## Database

19 migrations covering 30+ tables — restaurant orders, motel bookings, split billing, inventory with purchase orders, housekeeping, maintenance, workflows, audit logging. Full RLS on every table. Idempotency enforced at the database level with unique partial indexes.
