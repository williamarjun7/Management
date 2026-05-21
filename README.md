[![Netlify Status](https://api.netlify.com/api/v1/badges/7ce857e9-4773-45d0-8cff-f9f12532f75e/deploy-status)](https://app.netlify.com/projects/highlandcafe/deploys)

# Highlands Cafe & Motel Inn Management System

Full-stack hospitality POS with QR ordering, table management, Kitchen Display System (KDS), room booking, and realtime synchronization.

## Tech Stack

- **Frontend:** React 19, TypeScript 6, Vite 8, Tailwind CSS 3.4
- **Backend:** InsForge BaaS (PostgreSQL, PostgREST, Auth, Realtime, Edge Functions)
- **State:** TanStack React Query, Zustand
- **Monitoring:** Sentry, custom telemetry + observation system
- **Offline:** Dexie.js IndexedDB queue, circuit breaker, multi-tab leader election

## Setup

```bash
npm install
cp .env.example .env  # configure your InsForge backend URL and anon key
npm run dev
```

## Architecture

- QR ordering: Customers scan table QR codes to browse menu and place orders
- POS: Staff order management, billing, and payment processing
- KDS: Kitchen display with realtime order updates
- Admin: User roles, table management, activity logs
- Motel: Room booking, check-in/check-out, room service
# Management
