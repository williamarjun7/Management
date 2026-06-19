# Bidirectional Booking Sync Architecture

## POS System (Highlands Cafe & Motel Inn) ←→ Website System (Highlands Motel)

---

## Table of Contents

1. Architecture Overview
2. Unified State Machine
3. Flow A: Website → POS (Online Booking)
4. Flow B: POS → Website (Walk-in / Phone Booking)
5. Status Update Flow (Check-in / Check-out / Cancel)
6. API Contract Definitions
7. Database Changes Required
8. Edge Function Specifications
9. RPC Specifications
10. Idempotency & Retry Strategy
11. HMAC Security Design
12. Failure Handling Matrix
13. Reconciliation & Drift Detection
14. Conflict Prevention Rules
15. Mapping to Existing Code
16. Implementation Order

---

## 1. Architecture Overview

```
                         ┌─────────────────────────────────────┐
                         │         WEBSITE SYSTEM              │
                         │        (Customer-facing)            │
                         │                                     │
                         │  ┌─────────────┐  ┌───────────────┐ │
                         │  │ create-     │  │ pos-sync-api   │ │
                         │  │ booking     │  │ (receives      │ │
                         │  │ (holds room,│  │  POS pushes)   │ │
                         │  │  payment)   │  │                │ │
                         │  └──────┬──────┘  └───────┬───────┘ │
                         │         │                 │         │
                         │         ▼                 ▼         │
                         │  ┌──────────────────────────────┐   │
                         │  │     sync-webhook-sender      │   │
                         │  │  (polls sync_events, sends   │   │
                         │  │   HMAC POST to POS)          │   │
                         │  └──────────────┬───────────────┘   │
                         │                 │                   │
                         │  DB: sync_events, bookings, rooms   │
                         └─────────────────┼───────────────────┘
                                           │
                           HMAC-signed     │     HMAC-signed
                           HTTPS POST      │     HTTPS POST
                                           │
                         ┌─────────────────┼───────────────────┐
                         │                 ▼                   │
                         │         POS SYSTEM                  │
                         │    (Hotel operational)              │
                         │                                     │
                         │  ┌──────────────┐ ┌──────────────┐  │
                         │  │ booking-     │ │ website-sync  │  │
                         │  │ webhook      │ │ (pushes to    │  │
                         │  │ (receives    │ │  website)     │  │
                         │  │  website     │ │               │  │
                         │  │  webhooks)   │ │               │  │
                         │  └──────┬───────┘ └───────┬───────┘  │
                         │         │                  │         │
                         │         ▼                  ▼         │
                         │  ┌──────────────────────────────┐   │
                         │  │  Sync Services               │   │
                         │  │  - booking-sync.ts           │   │
                         │  │  - mutation-queue.ts         │   │
                         │  │  - realtime.ts               │   │
                         │  │  - SyncAdminPanel (UI)       │   │
                         │  └──────────────────────────────┘   │
                         │                                     │
                         │  Tables: sync_logs, sync_queue,      │
                         │  external_bookings, room_mappings    │
                         └─────────────────────────────────────┘
```

### Key Design Principles

1. **POS is authoritative** for room state, availability, check-in/out, and final booking confirmation
2. **Website is authoritative** for customer booking creation and payment initiation
3. **Every entity has one source of truth** — no circular sync
4. **Idempotency on every request** — each webhook safe to retry at least once
5. **POS ALWAYS wins room allocation** — website must never override POS room state
6. **Events flow one direction per trigger** — the creating system always initiates
7. **HMAC signing on all cross-system requests** — with timestamp window validation

---

## 2. Unified State Machine

### States

```
                         ┌──────────────┐
                         │  pending_    │
                         │  payment     │
                         └──────┬───────┘
                                │ payment confirmed
                                ▼
                    ┌───────────────────────┐
                    │   pending_sync        │ ◄── Website only, before POS ack
                    └───────────┬───────────┘
                                │ POS confirms
                                ▼
                    ┌───────────────────────┐
               ┌─── │     confirmed         │ ◄── POS acknowledged booking
               │    └───────────┬───────────┘
               │                │ check-in
               │                ▼
               │    ┌───────────────────────┐
               │    │    checked_in          │
               │    └───────────┬───────────┘
               │                │ check-out
               │                ▼
               │    ┌───────────────────────┐
               │    │    checked_out         │
               │    └───────────────────────┘
               │
               │    ┌───────────────────────┐
               └─── │    cancelled           │ (from any state except checked_out)
                    └───────────────────────┘
```

### State Transition Rules

| From | To | Trigger | Authority |
|---|---|---|---|
| `pending_payment` | `pending_sync` | Payment confirmed on website | Website |
| `pending_sync` | `confirmed` | POS ack received on website | POS |
| `pending_payment` | `cancelled` | Guest cancels before payment | Website |
| `pending_sync` | `cancelled` | POS rejects (conflict, admin) | POS |
| `confirmed` | `checked_in` | Guest checked in at POS | POS |
| `confirmed` | `cancelled` | Admin cancels, guest cancels w/ refund | POS |
| `checked_in` | `checked_out` | Guest checked out at POS | POS |
| `checked_in` | `cancelled` | Admin early cancel | POS |
| `checked_out` | (terminal) | — | — |

### State Mapping Across Systems

| Unified State | Website `booking_status` | POS `bookings.status` |
|---|---|---|
| `pending_payment` | `pending_payment` | (doesn't exist yet) |
| `pending_sync` | `pending_sync` | (doesn't exist yet) |
| `confirmed` | `confirmed` | `confirmed` |
| `checked_in` | `checked_in` | `checked_in` |
| `checked_out` | `checked_out` | `checked_out` |
| `cancelled` | `cancelled` | `cancelled` |

---

## 3. Flow A: Website → POS (Online Booking)

### Sequence

```
Website Guest            Website System                   POS System
     │                        │                               │
     │ 1. Submit booking      │                               │
     │───────────────────────►│                               │
     │                        │                               │
     │             ┌──────────┴──────────┐                    │
     │             │ create-booking()    │                    │
     │             │ Validate input      │                    │
     │             │ Check conflicts     │                    │
     │             │ Check room active/  │                    │
     │             │   maintenance       │                    │
     │             │ Check capacity      │                    │
     │             │ Calc price/discount │                    │
     │             │ INSERT booking:     │                    │
     │             │   status =          │                    │
     │             │   pending_payment   │                    │
     │             │   hold_expires_at = │                    │
     │             │   now + 15min       │                    │
     │             │   source = 'website'│                    │
     │             └──────────┬──────────┘                    │
     │                        │                               │
     │ 2. Return booking      │                               │
     │◄───────────────────────│                               │
     │                        │                               │
     │ 3. Make payment        │                               │
     │   (Fonepay QR/Web)     │                               │
     │───────────────────────►│                               │
     │                        │                               │
     │             ┌──────────┴──────────┐                    │
     │             │ fonepay-payment()   │                    │
     │             │ Generate QR/URL     │                    │
     │             │ INSERT payment:     │                    │
     │             │   status = pending  │                    │
     │             │   prn = HL...       │                    │
     │             │ UPDATE booking:     │                    │
     │             │   hold_expires_at   │                    │
     │             │   = now + 15min     │                    │
     │             │   active_prn = prn  │                    │
     │             └──────────┬──────────┘                    │
     │                        │                               │
     │ 4. QR/URL displayed    │                               │
     │◄───────────────────────│                               │
     │                        │                               │
     │ 5. Customer pays       │                               │
     │   via Fonepay app      │                               │
     │────────────────────────┼──────────────────────────────►│
     │                        │           (Fonepay gateway)   │
     │                        │                               │
     │ 6. Verify payment      │                               │
     │───────────────────────►│                               │
     │                        │                               │
     │             ┌──────────┴──────────┐                    │
     │             │ fonepay-payment()   │                    │
     │             │ verify-qr/verify-web│                    │
     │             │ Call                │                    │
     │             │ confirm_booking_    │                    │
     │             │ payment RPC (atomic)│                    │
     │             │                     │                    │
     │             │ RPC does:           │                    │
     │             │ 1. UPDATE payments  │                    │
     │             │    status=completed │                    │
     │             │ 2. UPDATE bookings  │                    │
     │             │    booking_status   │                    │
     │             │    = confirmed      │                    │
     │             │    payment_status   │                    │
     │             │    = paid           │                    │
     │             │ 3. INSERT payment_  │                    │
     │             │    events record    │                    │
     │             │ 4. CALL emit_booking│                    │
     │             │    _sync_event()    │                    │
     │             │                     │                    │
     │             │ TRIGGER: emit_      │                    │
     │             │ booking_sync_event() │                    │
     │             │ INSERT INTO sync_   │                    │
     │             │ events:             │                    │
     │             │   event_type =      │                    │
     │             │   'booking_created' │                    │
     │             │   entity_id =       │                    │
     │             │   booking.id        │                    │
     │             │   payload = full    │                    │
     │             │   booking data      │                    │
     │             │   source = 'website'│                    │
     │             └──────────┬──────────┘                    │
     │                        │                               │
     │                        │  ┌────────────────────────┐   │
     │                        │  │ sync-webhook-sender    │   │
     │                        │  │ (runs every 60s /      │   │
     │                        │  │  on-demand trigger)    │   │
     │                        │  │                        │   │
     │                        │  │ SELECT * FROM sync_    │   │
     │                        │  │ events WHERE processed │   │
     │                        │  │ = false ORDER BY       │   │
     │                        │  │ created_at ASC LIMIT 50│   │
     │                        │  │                        │   │
     │                        │  │ For each event:        │   │
     │                        │  │ Build payload with     │   │
     │                        │  │ HMAC signature         │   │
     │                        │  │ POST to POS booking-   │   │
     │                        │  │ webhook endpoint       │   │
     │                        │  │                        │   │
     │                        │  │ On 2xx: mark processed │   │
     │                        │  │ On 4xx/5xx: increment  │   │
     │                        │  │ retry_count, store     │   │
     │                        │  │ error_message          │   │
     │                        │  └───────────┬────────────┘   │
     │                        │               │               │
     │                        │               │               │
     │                        │               │  HMAC POST    │
     │                        │               ├──────────────►│
     │                        │               │               │
     │                        │               │   ┌───────────┴────┐
     │                        │               │   │ booking-      │
     │                        │               │   │ webhook()     │
     │                        │               │   │               │
     │                        │               │   │ 1. Verify HMAC│
     │                        │               │   │ 2. Check      │
     │                        │               │   │    timestamp  │
     │                        │               │   │    window     │
     │                        │               │   │    (±5min)    │
     │                        │               │   │ 3. Check      │
     │                        │               │   │    idempotency│
     │                        │               │   │    key        │
     │                        │               │   │ 4. Look up    │
     │                        │               │   │    room       │
     │                        │               │   │    mapping    │
     │                        │               │   │ 5. Check      │
     │                        │               │   │    availabi-  │
     │                        │               │   │    lity       │
     │                        │               │   │ 6. IF avail:  │
     │                        │               │   │    create_    │
     │                        │               │   │    booking    │
     │                        │               │   │    RPC        │
     │                        │               │   │ 7. link_      │
     │                        │               │   │    external_  │
     │                        │               │   │    booking    │
     │                        │               │   │ 8. log_sync_  │
     │                        │               │   │    entry RPC  │
     │                        │               │   │ 9. Return     │
     │                        │               │   │    pos_       │
     │                        │               │   │    booking_id │
     │                        │               │   │               │
     │                        │               │   │ IF conflict:  │
     │                        │               │   │ Return 409    │
     │                        │               │   │ with reason   │
     │                        │               │   └──────┬───────┘
     │                        │               │          │
     │                        │               ◄──────────┤
     │                        │  ┌────────────┴─────┐    │
     │                        │  │ On success:      │    │
     │                        │  │ UPDATE sync_     │    │
     │                        │  │ events SET       │    │
     │                        │  │ processed=true,  │    │
     │                        │  │ delivered_at,    │    │
     │                        │  │ response=pos_id  │    │
     │                        │  │                  │    │
     │                        │  │ On conflict:     │    │
     │                        │  │ UPDATE booking   │    │
     │                        │  │ status=cancelled │    │
     │                        │  │ (refund logic)   │    │
     │                        │  └──────────────────┘    │
     │                        │                           │
     │ 7. Booking confirmed   │                           │
     │   (email sent async)   │                           │
     │◄───────────────────────│                           │
```

### Flow A Detailed Steps

**Step 1**: Guest submits booking on website
- `create-booking` edge function validates input, checks conflicts, calculates pricing
- Creates booking with `booking_status = 'pending_payment'`, `hold_expires_at = now + 15min`

**Step 2**: Guest selects payment method (Fonepay QR or Web)
- `fonepay-payment` edge function generates QR or redirect URL
- Creates `payments` record with `status = 'pending'`, generates PRN
- Updates booking `active_prn`, refreshes `hold_expires_at`

**Step 3**: Guest completes payment
- Payment verified via `fonepay-payment/verify-qr` or `verify-web`
- Calls `confirm_booking_payment` RPC (atomic transaction):
  1. Marks payment `status = 'completed'`
  2. Updates booking `booking_status = 'confirmed'`, `payment_status = 'paid'`
  3. Inserts `payment_events` record
  4. Database trigger `emit_booking_sync_event()` inserts into `sync_events`

**Step 4**: Sync dispatch
- `sync-webhook-sender` picks up unprocessed `sync_events` records
- Sends HMAC-signed POST to POS `booking-webhook` endpoint
- On 2xx response: marks event `processed = true`
- On 4xx/5xx: increments `retry_count`, stores error, continues retrying

**Step 5**: POS processing
- `booking-webhook` validates HMAC signature and timestamp window
- Checks idempotency via `idempotency_key`
- Looks up `room_mappings` to get pos_room_id from website_room_id
- Calls `checkAvailability()` to verify no conflicts
- If available: calls `create_booking` RPC to create POS booking, `link_external_booking` RPC to map
- If conflict: returns 409 with conflict details

**Step 6**: Website receives POS response
- On success: marks sync_event processed, booking remains confirmed
- On conflict (409): website must cancel the booking, trigger refund logic, notify guest

---

## 4. Flow B: POS → Website (Walk-in / Phone Booking)

### Sequence

```
POS User                  POS System                      Website System
   │                          │                                │
   │ 1. Create booking        │                                │
   │  (walk-in/phone)         │                                │
   │─────────────────────────►│                                │
   │                          │                                │
   │              ┌───────────┴───────────┐                    │
   │              │ create_booking RPC    │                    │
   │              │ INSERT bookings:      │                    │
   │              │   status = confirmed  │                    │
   │              │   room_id assigned    │                    │
   │              │   source = 'pos'      │                    │
   │              │                      │                    │
   │              │ INSERT external_      │                    │
   │              │ bookings:             │                    │
   │              │   pos_booking_id      │                    │
   │              │   source = 'pos'      │                    │
   │              │   (no website link    │                    │
   │              │    yet)               │                    │
   │              │                      │                    │
   │              │ INSERT sync_logs:     │                    │
   │              │   direction=outgoing  │                    │
   │              │   status=pending      │                    │
   │              │                      │                    │
   │              │ INSERT sync_queue:    │                    │
   │              │   direction=outgoing  │                    │
   │              │   status=queued       │                    │
   │              └───────────┬───────────┘                    │
   │                          │                                │
   │ 2. Booking created       │                                │
   │◄─────────────────────────│                                │
   │                          │                                │
   │                          │    ┌───────────────────────┐   │
   │                          │    │ website-sync edge     │   │
   │                          │    │ function              │   │
   │                          │    │                       │   │
   │                          │    │ Reads sync_queue for  │   │
   │                          │    │ outgoing events       │   │
   │                          │    │                       │   │
   │                          │    │ Calls push_booking:   │   │
   │                          │    │ POST to website       │   │
   │                          │    │ pos-sync-api/bookings │   │
   │                          │    │ with HMAC signature   │   │
   │                          │    │                       │   │
   │                          │    │ On success: mark      │   │
   │                          │    │ sync_queue completed, │   │
   │                          │    │ update external_      │   │
   │                          │    │ bookings with         │   │
   │                          │    │ website_booking_id    │   │
   │                          │    │                       │   │
   │                          │    │ On failure: mark      │   │
   │                          │    │ sync_queue for retry  │   │
   │                          │    └───────────┬───────────┘   │
   │                          │                │               │
   │                          │                │  HMAC POST    │
   │                          │                ├──────────────►│
   │                          │                │               │
   │                          │                │  ┌────────────┴─────┐
   │                          │                │  │ pos-sync-api/    │
   │                          │                │  │ bookings POST    │
   │                          │                │  │                  │
   │                          │                │  │ 1. Verify HMAC   │
   │                          │                │  │ 2. Check         │
   │                          │                │  │    idempotency   │
   │                          │                │  │    (pos_booking  │
   │                          │                │  │    _id unique)   │
   │                          │                │  │ 3. Validate body │
   │                          │                │  │    (Zod schema)  │
   │                          │                │  │ 4. Check room    │
   │                          │                │  │    exists on     │
   │                          │                │  │    website       │
   │                          │                │  │ 5. Check for     │
   │                          │                │  │    conflicts     │
   │                          │                │  │    (overlapping  │
   │                          │                │  │    bookings)     │
   │                          │                │  │ 6. INSERT into   │
   │                          │                │  │    bookings:     │
   │                          │                │  │    source='pos'  │
   │                          │                │  │    pos_booking_  │
   │                          │                │  │    id set        │
   │                          │                │  │ 7. INSERT sync_  │
   │                          │                │  │    event for     │
   │                          │                │  │    status change │
   │                          │                │  │ 8. Return 201    │
   │                          │                │  │    with booking  │
   │                          │                │  │                  │
   │                          │                │  │ IF conflict:     │
   │                          │                │  │ Return 409       │
   │                          │                │  └───────┬─────────┘
   │                          │                │          │
   │                          │                ◄──────────┤
   │                          │  ┌─────────────┴─────┐    │
   │                          │  │ On 201 created:   │    │
   │                          │  │ UPDATE sync_queue │    │
   │                          │  │ status=completed  │    │
   │                          │  │ UPDATE external_  │    │
   │                          │  │ bookings SET      │    │
   │                          │  │ external_booking_ │    │
   │                          │  │ id = website_id,  │    │
   │                          │  │ last_sync_status  │    │
   │                          │  │ = 'synced'        │    │
   │                          │  │                   │    │
   │                          │  │ On 409 conflict:  │    │
   │                          │  │ Mark sync_queue   │    │
   │                          │  │ dead for manual   │    │
   │                          │  │ review            │    │
   │                          │  └───────────────────┘    │
   │                          │                            │
   │ 3. Website booking ID    │                            │
   │   stored in external_    │                            │
   │   bookings               │                            │
   │◄─────────────────────────│                            │
```

### Flow B Detailed Steps

**Step 1**: POS staff creates booking (walk-in/phone)
- POS booking form creates booking via `create_booking` RPC
- Booking status set to `confirmed` or `checked_in` immediately (room assigned)
- `external_bookings` record created with `source = 'pos'`, no website link yet
- `sync_queue` entry inserted for outgoing sync
- `sync_logs` entry records the pending sync

**Step 2**: POS sync dispatch
- `website-sync` edge function (triggered by app or cron) reads `sync_queue` for pending outgoing events
- Calls `push_booking` action which POSTs to website `pos-sync-api/bookings`
- Request includes HMAC signature using `POS_WEBHOOK_SECRET`
- Includes `idempotency_key` for duplicate protection

**Step 3**: Website processing
- `pos-sync-api` `POST /bookings` handler:
  1. Verifies HMAC signature
  2. Checks idempotency via `pos_booking_id` uniqueness
  3. Validates request body with Zod schema
  4. Verifies room exists on website and is active
  5. Checks for conflicting bookings in date range
  6. If available: inserts booking with `source='pos'`, `pos_booking_id`, appropriate status
  7. Inserts `sync_event` for status change (SOFT avoids loop via source filter)
  8. Returns 201 with full booking data including website `id`

**Step 4**: POS receives response
- On 201: updates `sync_queue` status to `completed`, updates `external_bookings` with `external_booking_id = website_booking_id`
- On 409: marks `sync_queue` status to `dead` for manual admin review via SyncAdminPanel

---

## 5. Status Update Flow (Check-in / Check-out / Cancel)

### POS → Website Status Updates

When POS staff performs check-in, check-out, or cancellation:

```
POS Action             POS System                      Website System
   │                       │                               │
   │ Check-in/out/cancel   │                               │
   │──────────────────────►│                               │
   │                       │                               │
   │              ┌────────┴────────┐                      │
   │              │ process_check_  │                      │
   │              │ in/out RPC or   │                      │
   │              │ cancel_external_│                      │
   │              │ booking RPC     │                      │
   │              │                 │                      │
   │              │ 1. UPDATE       │                      │
   │              │    bookings     │                      │
   │              │    status       │                      │
   │              │ 2. INSERT       │                      │
   │              │    room_state_  │                      │
   │              │    transitions  │                      │
   │              │ 3. INSERT       │                      │
   │              │    sync_queue   │                      │
   │              │    for status   │                      │
   │              │    update       │                      │
   │              │ 4. INSERT       │                      │
   │              │    sync_logs    │                      │
   │              └────────┬────────┘                      │
   │                       │                               │
   │                       │  ┌────────────────────────┐   │
   │                       │  │ website-sync           │   │
   │                       │  │ push_status_update     │   │
   │                       │  │                        │   │
   │                       │  │ POST to website        │   │
   │                       │  │ pos-sync-api/bookings  │   │
   │                       │  │ /:id via PUT           │   │
   │                       │  │ with HMAC signature    │   │
   │                       │  └───────────┬────────────┘   │
   │                       │               │               │
   │                       │               │  HMAC PUT     │
   │                       │               ├──────────────►│
   │                       │               │               │
   │                       │               │  ┌────────────┴─────┐
   │                       │               │  │ pos-sync-api     │
   │                       │               │  │ PUT /bookings/:id│
   │                       │               │  │                  │
   │                       │               │  │ 1. Verify HMAC   │
   │                       │               │  │ 2. Validate body │
   │                       │               │  │ 3. Update booking│
   │                       │               │  │    status        │
   │                       │               │  │    (source='pos' │
   │                       │               │  │     to prevent   │
   │                       │               │  │     loop-back)   │
   │                       │               │  │ 4. Return updated│
   │                       │               │  │    booking       │
   │                       │               │  └───────┬─────────┘
   │                       │               │          │
   │                       │               ◄──────────┤
   │                       │  ┌─────────────┴─────┐    │
   │                       │  │ On 2xx: mark       │    │
   │                       │  │ sync_queue done    │    │
   │                       │  └────────────────────┘    │
```

### Loop Prevention

Critical: Website status updates MUST NOT re-trigger website→POS sync.

**Rule**: When POS updates a booking on the website via `pos-sync-api`, the `source` field is set to `'pos'`. The website booking trigger `emit_booking_sync_event()` MUST filter: `IF NEW.source = 'pos' THEN RETURN` — do not insert into `sync_events`.

---

## 6. API Contract Definitions

### 6.1 Website → POS Webhook

**Endpoint**: `POST {POS_BASE}/functions/booking-webhook`
**Content-Type**: `application/json`
**Headers**:
| Header | Value | Required |
|---|---|---|
| `X-Webhook-Signature` | HMAC-SHA256 hex digest of raw body | Yes |
| `X-Idempotency-Key` | Unique key: `{source}:{entity_id}:{event_type}` | Yes |
| `X-Timestamp` | ISO 8601 timestamp of event creation | Yes |
| `X-Webhook-Event` | Event type name | Yes |
| `X-Webhook-Source` | `highlands-website` | Yes |

#### Request: `booking_created`

```json
{
  "event_type": "booking_created",
  "external_booking_id": "a1b2c3d4-...",
  "website_room_id": "e5f6g7h8-...",
  "guest_name": "John Doe",
  "guest_phone": "9841234567",
  "guest_email": "john@example.com",
  "check_in": "2026-07-01",
  "check_out": "2026-07-03",
  "adults": 2,
  "children": 0,
  "nightly_rate": 3500,
  "total_amount": 7000,
  "payment_status": "paid",
  "source": "website",
  "idempotency_key": "website:a1b2c3d4:booking_created",
  "timestamp": "2026-06-19T10:00:00Z"
}
```

#### Response: 200 Success

```json
{
  "received": true,
  "entity_id": "x9y8z7w6-...",
  "pos_booking_id": "x9y8z7w6-...",
  "status": "confirmed"
}
```

#### Response: 200 Duplicate (idempotency hit)

```json
{
  "received": true,
  "duplicate": true,
  "entity_id": "x9y8z7w6-..."
}
```

#### Response: 409 Conflict

```json
{
  "received": true,
  "skipped": true,
  "reason": "Conflict",
  "conflicts": [
    {
      "id": "c0c1c2c3-...",
      "guest_name": "Jane Smith",
      "check_in": "2026-06-30",
      "check_out": "2026-07-02"
    }
  ]
}
```

#### Response: 410 Skipped (no room mapping)

```json
{
  "received": true,
  "skipped": true,
  "reason": "No room mapping for website_room_id=e5f6g7h8-..."
}
```

### 6.2 POS → Website Webhook

**Endpoint**: `{WEBSITE_BASE}/functions/pos-sync-api/bookings`
**Content-Type**: `application/json`
**Headers**:
| Header | Value | Required |
|---|---|---|
| `X-Webhook-Signature` | HMAC-SHA256 hex digest of raw body | Yes |
| `X-Idempotency-Key` | Unique key: `{source}:{entity_id}:{event_type}` | Yes |
| `X-Timestamp` | ISO 8601 timestamp | Yes |
| `X-POS-API-Key` | Static shared secret | Yes |

#### Request: `POST /bookings` — Create booking from POS

```json
{
  "room_id": "w5x6y7z8-...",
  "check_in": "2026-07-05",
  "check_out": "2026-07-07",
  "guest_name": "Jane Smith",
  "guest_phone": "9851234567",
  "guest_email": "jane@example.com",
  "booking_status": "confirmed",
  "payment_status": "pending",
  "pos_booking_id": "p1p2p3p4-...",
  "idempotency_key": "pos:p1p2p3p4:booking_created",
  "source": "pos"
}
```

#### Response: 201 Created

```json
{
  "data": {
    "id": "w1w2w3w4-...",
    "room_id": "w5x6y7z8-...",
    "check_in": "2026-07-05",
    "check_out": "2026-07-07",
    "guest_name": "Jane Smith",
    "guest_phone": "9851234567",
    "guest_email": "jane@example.com",
    "booking_status": "confirmed",
    "payment_status": "pending",
    "source": "pos",
    "pos_booking_id": "p1p2p3p4-...",
    "total_price": 7000,
    "created_at": "2026-06-19T10:00:00Z"
  }
}
```

#### Response: 404 (room not found on website)

```json
{
  "error": "Room not found"
}
```

#### Response: 409 (room not available)

```json
{
  "error": "Room is not available for the selected dates"
}
```

### 6.3 POS → Website Status Update

**Endpoint**: `PUT {WEBSITE_BASE}/functions/pos-sync-api/bookings/{website_booking_id}`
**Headers**: Same as POST /bookings

#### Request: Status update

```json
{
  "booking_status": "checked_in",
  "idempotency_key": "pos:p1p2p3p4:checked_in",
  "source": "pos"
}
```

#### Response: 200

```json
{
  "data": {
    "id": "w1w2w3w4-...",
    "booking_status": "checked_in",
    "source": "pos",
    "updated_at": "2026-07-05T14:00:00Z"
  }
}
```

---

## 7. Database Changes Required

### 7.1 Website: New `pending_sync` status for bookings

```sql
-- Add pending_sync to booking_status check constraint
ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS bookings_booking_status_check;

ALTER TABLE public.bookings
ADD CONSTRAINT bookings_booking_status_check
CHECK (booking_status IN ('pending_payment', 'pending_sync', 'confirmed',
       'checked_in', 'checked_out', 'cancelled', 'expired'));
```

### 7.2 Website: Add `idempotency_key` column to sync_events

```sql
ALTER TABLE public.sync_events
ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE INDEX IF NOT EXISTS idx_sync_events_idempotency
ON public.sync_events(idempotency_key);

ALTER TABLE public.sync_events
ADD COLUMN IF NOT EXISTS response_body jsonb DEFAULT '{}'::jsonb;
```

### 7.3 Website: Add UNIQUE constraint on bookings.pos_booking_id

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_pos_booking_id
ON public.bookings(pos_booking_id)
WHERE pos_booking_id IS NOT NULL;
```

### 7.4 Website: Database trigger function to emit sync events

```sql
-- Already exists per migration: emit_booking_sync_event()
-- Must be updated to filter source='pos':

CREATE OR REPLACE FUNCTION public.emit_booking_sync_event()
RETURNS trigger
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql AS $$
BEGIN
  -- PREVENT LOOP: skip if source is POS
  IF NEW.source = 'pos' THEN
    RETURN NEW;
  END IF;

  -- Only emit for confirmed/cancelled from confirmed sources
  IF NEW.booking_status IN ('confirmed', 'cancelled', 'checked_in', 'checked_out')
     AND (OLD.booking_status IS DISTINCT FROM NEW.booking_status) THEN

    INSERT INTO public.sync_events (
      event_type, entity_id, entity_type, payload, source,
      idempotency_key, created_at
    ) VALUES (
      CASE
        WHEN NEW.booking_status = 'confirmed' THEN 'booking_created'
        WHEN NEW.booking_status = 'cancelled' THEN 'booking_cancelled'
        WHEN NEW.booking_status = 'checked_in' THEN 'booking_checked_in'
        WHEN NEW.booking_status = 'checked_out' THEN 'booking_checked_out'
        ELSE 'booking_updated'
      END,
      NEW.id,
      'booking',
      jsonb_build_object(
        'room_id', NEW.room_id,
        'guest_name', NEW.guest_name,
        'guest_phone', NEW.guest_phone,
        'guest_email', NEW.guest_email,
        'check_in', NEW.check_in,
        'check_out', NEW.check_out,
        'total_price', NEW.total_price,
        'advance_amount', NEW.advance_amount,
        'balance_amount', NEW.balance_amount,
        'payment_status', NEW.payment_status,
        'booking_status', NEW.booking_status
      ),
      'website',
      'website:' || NEW.id || ':' || CASE
        WHEN NEW.booking_status = 'confirmed' THEN 'booking_created'
        WHEN NEW.booking_status = 'cancelled' THEN 'booking_cancelled'
        WHEN NEW.booking_status = 'checked_in' THEN 'booking_checked_in'
        WHEN NEW.booking_status = 'checked_out' THEN 'booking_checked_out'
        ELSE 'booking_updated'
      END,
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trg_emit_booking_sync_event ON public.bookings;
CREATE TRIGGER trg_emit_booking_sync_event
AFTER UPDATE OF booking_status ON public.bookings
FOR EACH ROW
WHEN (OLD.booking_status IS DISTINCT FROM NEW.booking_status)
EXECUTE FUNCTION public.emit_booking_sync_event();
```

### 7.5 Website: Create `sync_event_booking_insert` trigger

```sql
-- Also emit sync event when a NEW booking is inserted with confirmed status
-- (catches POS-originated bookings that skip the trigger)
CREATE OR REPLACE FUNCTION public.emit_new_booking_sync_event()
RETURNS trigger
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source = 'pos' AND NEW.booking_status IN ('confirmed', 'checked_in') THEN
    -- POS-originated bookings create a different event type
    INSERT INTO public.sync_events (
      event_type, entity_id, entity_type, payload, source,
      created_at
    ) VALUES (
      'pos_booking_created',
      NEW.id,
      'booking',
      jsonb_build_object(
        'website_booking_id', NEW.id,
        'pos_booking_id', NEW.pos_booking_id,
        'room_id', NEW.room_id,
        'guest_name', NEW.guest_name,
        'check_in', NEW.check_in,
        'check_out', NEW.check_out,
        'status', NEW.booking_status
      ),
      'pos',
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_new_booking_sync_event ON public.bookings;
CREATE TRIGGER trg_emit_new_booking_sync_event
AFTER INSERT ON public.bookings
FOR EACH ROW
WHEN (NEW.source = 'pos')
EXECUTE FUNCTION public.emit_new_booking_sync_event();
```

### 7.6 POS: Confirm columns exist on all sync tables

```sql
-- Verify sync_logs has all required columns
-- idempotency_key should exist (check: ALTER TABLE IF NOT EXISTS)
ALTER TABLE public.sync_logs
ADD COLUMN IF NOT EXISTS idempotency_key text;

-- sync_queue should have dead-letter support
ALTER TABLE public.sync_queue
ADD COLUMN IF NOT EXISTS dead_letter_at timestamptz;
ALTER TABLE public.sync_queue
ADD COLUMN IF NOT EXISTS dead_letter_reason text;

-- Add unique index on external_bookings for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_external_bookings_pos_source
ON public.external_bookings(pos_booking_id, source)
WHERE pos_booking_id IS NOT NULL;
```

### 7.7 POS: Room mappings foreign-keyed improvement

```sql
-- Ensure room_mappings has unique constraint
ALTER TABLE public.room_mappings
ADD CONSTRAINT IF NOT EXISTS uk_room_mappings_website_room
UNIQUE (website_room_id);

ALTER TABLE public.room_mappings
ADD CONSTRAINT IF NOT EXISTS uk_room_mappings_pos_room
UNIQUE (pos_room_id);
```

---

## 8. Edge Function Specifications

### 8.1 Website: `emit_booking_sync_event` trigger (already exists)

Purpose: Automatic sync event creation when booking status changes.

Location: Database trigger (not edge function).

**Status**: EXISTS (migration 20260618112514). Requires updates per Section 7.4.

### 8.2 Website: `sync-webhook-sender`

Purpose: Polls `sync_events` and delivers to POS.

**Status**: EXISTS at `insforge/functions/sync-webhook-sender/index.ts`.

**Enhancements needed**:
1. Add HMAC timestamp validation on POS responses
2. Handle 409 conflict by updating website booking to cancelled
3. Handle loop prevention — skip events where `source = 'pos' AND event_type = 'pos_booking_created'`
4. Add circuit breaker: if POS returns 5xx > 3 consecutive times, pause delivery for 60s

### 8.3 Website: `pos-sync-api`

Purpose: Receives POS push requests (create booking, update status).

**Status**: EXISTS at `insforge/functions/pos-sync-api/index.ts`.

**Enhancements needed**:
1. `POST /bookings` — Change idempotency check to use `pos_booking_id` UNIQUE constraint instead of checking bookings table (existing check queries by `pos_booking_id = idempotencyKey` which is wrong — should check by `pos_booking_id` field directly)
2. `POST /bookings` — After successful insert, trigger website availability update (mark room as unavailable on website)
3. `PUT /bookings/:id` — Ensure source is always set to 'pos' to prevent sync loop
4. Add `DELETE /bookings/:id` — Handle booking cancellation from POS with conflict-free logic

### 8.4 Website: `fonepay-payment`

Purpose: Payment processing with Fonepay integration.

**Status**: EXISTS at `insforge/functions/fonepay-payment/index.ts`.

**Enhancements needed**:
1. The `confirm_booking_payment` RPC must trigger `emit_booking_sync_event()` trigger
2. After payment confirmation, booking status changes → trigger fires → sync_event inserted

### 8.5 POS: `booking-webhook`

Purpose: Receives website webhooks for booking creation, updates, cancellations.

**Status**: EXISTS at `edge-functions/booking-webhook/index.js`.

**Enhancements needed**:
1. Add HMAC timestamp validation (±5 minute window)
2. After successful booking creation, update the POS room status in real-time
3. Handle `booking_created` event for the new unified event type name
4. After conflict response, trigger website sync for the conflicting booking info
5. Handle `pos_booking_created` event type (for POS→Website flow ack)

### 8.6 POS: `website-sync`

Purpose: Pushes POS booking creation and status changes to website.

**Status**: EXISTS at `edge-functions/website-sync/index.js`.

**Enhancements needed**:
1. `push_booking` action — Already sends to website `booking-webhook`. Change target to `pos-sync-api/bookings` POST for POS-originated bookings
2. `push_status_update` action — Already sends to website `booking-webhook`. Change target to `pos-sync-api/bookings/:id` PUT
3. Add HMAC timestamp header to all outgoing requests
4. Add retry queue logging for all failure types

---

## 9. RPC Specifications

### 9.1 Website RPCs

#### `confirm_booking_payment` (EXISTS)

```sql
-- Already exists. Called by fonepay-payment edge function.
-- Marks payment completed, updates booking to confirmed.
-- Triggers emit_booking_sync_event() via booking status change.
```

#### `check_room_availability` (NEW — needed for POS availability check)

```sql
CREATE OR REPLACE FUNCTION public.check_room_availability(
  p_room_id uuid,
  p_check_in date,
  p_check_out date,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS TABLE(
  available boolean,
  conflict_id uuid,
  conflict_guest_name text,
  conflict_check_in date,
  conflict_check_out date
)
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    false AS available,
    b.id AS conflict_id,
    b.guest_name AS conflict_guest_name,
    b.check_in::date AS conflict_check_in,
    b.check_out::date AS conflict_check_out
  FROM public.bookings b
  WHERE b.room_id = p_room_id
    AND b.booking_status IN ('confirmed', 'checked_in', 'pending_payment')
    AND b.check_in < p_check_out::date
    AND b.check_out > p_check_in::date
    AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id);

  IF NOT FOUND THEN
    RETURN QUERY SELECT true, NULL::uuid, NULL::text, NULL::date, NULL::date;
  END IF;
END;
$$;
```

### 9.2 POS RPCs

#### `create_booking` (EXISTS)

```sql
-- Already exists. Creates booking with idempotency check.
-- Called by booking-webhook for website-originated bookings.
```

#### `update_booking_dates` (EXISTS)

```sql
-- Already exists. Updates booking dates/guest info.
-- Called by booking-webhook for booking.updated events.
```

#### `cancel_external_booking` (EXISTS)

```sql
-- Already exists. Cancels booking linked to external source.
-- Called by booking-webhook for booking.cancelled events.
```

#### `process_check_in` (EXISTS)

```sql
-- Already exists. Processes check-in for a booking.
-- Triggers POS room state change.
```

#### `process_check_out` (EXISTS)

```sql
-- Already exists. Processes check-out for a booking.
-- Triggers POS room state change.
```

#### `link_external_booking` (EXISTS)

```sql
-- Already exists. Links POS booking to external booking ID.
-- Called after successful website booking creation in POS.
```

#### `log_sync_entry` (EXISTS)

```sql
-- Already exists. Logs sync activity with idempotency support.
```

#### `queue_sync_retry` (EXISTS)

```sql
-- Already exists. Queues failed sync for retry.
```

#### `get_availability_for_dates` (NEW)

```sql
CREATE OR REPLACE FUNCTION public.get_availability_for_dates(
  p_room_id uuid,
  p_check_in date,
  p_check_out date,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS TABLE(available boolean, conflicts jsonb)
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.room_id = p_room_id
        AND b.status IN ('confirmed', 'checked_in')
        AND b.check_in < p_check_out::date
        AND b.check_out > p_check_in::date
        AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
    ) AS available,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'guest_name', b.guest_name,
          'check_in', b.check_in,
          'check_out', b.check_out
        )
      )
      FROM public.bookings b
      WHERE b.room_id = p_room_id
        AND b.status IN ('confirmed', 'checked_in')
        AND b.check_in < p_check_out::date
        AND b.check_out > p_check_in::date
        AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)),
      '[]'::jsonb
    ) AS conflicts;
END;
$$;
```

#### `external_bookings_upsert` (NEW)

```sql
CREATE OR REPLACE FUNCTION public.external_bookings_upsert(
  p_pos_booking_id uuid,
  p_source text,
  p_external_booking_id text DEFAULT NULL,
  p_sync_status text DEFAULT 'pending'
)
RETURNS void
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.external_bookings
    (pos_booking_id, source, external_booking_id, last_sync_status, last_sync_at)
  VALUES
    (p_pos_booking_id, p_source, p_external_booking_id, p_sync_status, now())
  ON CONFLICT (pos_booking_id, source)
  DO UPDATE SET
    external_booking_id = COALESCE(p_external_booking_id, external_bookings.external_booking_id),
    last_sync_status = p_sync_status,
    last_sync_at = now();
END;
$$;
```

---

## 10. Idempotency & Retry Strategy

### 10.1 Idempotency Key Format

```
{source}:{entity_id}:{event_type}
```

Examples:
- `website:a1b2c3d4:booking_created`
- `pos:p1p2p3p4:booking_created`
- `pos:p1p2p3p4:checked_in`

### 10.2 Website Idempotency

| Endpoint | Key Source | Storage | Check Method |
|---|---|---|---|
| `POST /bookings` (create) | `X-Idempotency-Key` header or `pos_booking_id` field | `bookings.pos_booking_id` (UNIQUE) | Query `bookings` WHERE `pos_booking_id = key` |
| `PUT /bookings/:id` | `X-Idempotency-Key` header | In-memory (optional, low risk) | — |

### 10.3 POS Idempotency

| Endpoint | Key Source | Storage | Check Method |
|---|---|---|---|
| `booking-webhook` | `X-Idempotency-Key` header | `sync_logs.idempotency_key` | Query `sync_logs` WHERE `idempotency_key = key` |
| `website-sync push` | `idempotency_key` in body | `sync_logs.idempotency_key` | Same as above |

### 10.4 Retry Configuration

```
Max retries:      5
Initial backoff:  30 seconds
Backoff factor:   2x
Max backoff:      30 minutes
Dead-letter:      After 5 failures → status = 'dead' for manual review
```

| Attempt | Backoff | Cumulative |
|---|---|---|
| 1 | 30s | 30s |
| 2 | 60s | 1.5min |
| 3 | 120s | 3.5min |
| 4 | 240s | 7.5min |
| 5 | 480s | 15.5min |
| Dead | — | — |

### 10.5 Retry Implementation

Both sides implement retry:

**Website side** (`sync-webhook-sender`):
```typescript
// On failure: increment retry_count, store error_message, set last_attempt_at
// Function runs every 60s, re-processes events where:
//   processed = false
//   retry_count < max_retries
//   AND (last_attempt_at IS NULL OR last_attempt_at < now() - backoff_duration)
```

**POS side** (`website-sync` retry_queue action):
```typescript
// Same pattern via sync_queue table
// next_retry_at determines when to retry
// On max retries: mark status = 'dead'
```

### 10.6 Dead-Letter Queue

Both systems support dead-letter:
- **POS**: `sync_queue.status = 'dead'` with `dead_letter_at`, `dead_letter_reason`
- **Website**: `sync_events.retry_count >= max_retries` with `error_message`

Admin UI (`SyncAdminPanel` on POS) allows:
- Viewing dead-letter items
- Manual retry
- Force-acknowledge (mark as processed)
- Delete

---

## 11. HMAC Security Design

### 11.1 Signing Algorithm

```
HMAC-SHA256(raw_body, webhook_secret)
```

Where:
- `raw_body` = the complete HTTP body as a UTF-8 string (NOT the parsed JSON)
- `webhook_secret` = shared secret configured in both systems

### 11.2 Timestamp Validation

Every request MUST include `X-Timestamp` header with ISO 8601 timestamp.
Receiver MUST verify: `|now - timestamp| <= 5 minutes`

### 11.3 Implementation Reference

```typescript
// Signing (sender)
async function signPayload(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Verification (receiver)
async function verifySignature(
  secret: string,
  body: string,
  signature: string,
  timestamp: string
): Promise<{ valid: boolean; reason?: string }> {
  // Check timestamp window
  const now = Date.now();
  const eventTime = new Date(timestamp).getTime();
  if (Math.abs(now - eventTime) > 5 * 60 * 1000) {
    return { valid: false, reason: 'Timestamp outside acceptable window' };
  }

  // Verify HMAC
  const expected = await signPayload(secret, body);
  if (expected !== signature) {
    return { valid: false, reason: 'HMAC signature mismatch' };
  }

  return { valid: true };
}
```

### 11.4 Key Rotation

- `POS_WEBHOOK_SECRET` — shared between both systems for webhook signing
- `POS_SYNC_API_KEY` — static key for POS→website API auth
- `WEBSITE_SYNC_API_TOKEN` — token for website→POS API auth A
All configurable via InsForge secrets/env vars.

---

## 12. Failure Handling Matrix

| # | Failure Scenario | Detection | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **Duplicate webhook delivery** | Idempotency key check on receiver | Duplicate booking creation | Both sides check idempotency before processing; return 200 with `duplicate: true` |
| 2 | **Payment confirmed but sync to POS failed** | `sync_events` retry_count increments, last_error populated | Guest paid but POS has no record | Retry with exponential backoff up to 5 times. If exhausted, mark dead-letter + admin alert. Reconciliation cron re-processes dead events. |
| 3 | **POS rejects booking (room conflict)** | POS returns 409 | Website booking in confirmed but POS doesn't have it | Website MUST cancel booking, trigger refund/notification. Reconciliation cron detects mismatch. |
| 4 | **POS booking created but sync to website failed** | `sync_queue` status remains queued/failed | Walk-in guest double-booked if another guest books same room online | Retry with backoff. Website periodically reconciles by checking POS availability. |
| 5 | **HMAC signature mismatch** | Receiver validates signature | Request rejected with 403 | Log signature details (without secret) for debugging. Both sides verify shared secret matches. |
| 6 | **Out-of-order events (e.g., cancel before create)** | No idempotency match for cancel event | Cancel processed before booking exists | Receiver checks if booking exists before processing. If not, queue event for later processing or ignore. |
| 7 | **Network timeout during webhook delivery** | `sync-webhook-sender` timeout (10s) | Event not delivered | Retry logic automatically re-processes. Idempotency ensures no duplicate on re-delivery. |
| 8 | **Partial sync (website updated, POS not)** | POS has `sync_logs` with status=failed | Inconsistent state | Retry via sync_queue. Reconciliation cron identifies mismatches by comparing booking IDs from both systems. |
| 9 | **Double booking race condition** | Website creates booking at same time as POS for same room | Both sides think room is booked | POS ALWAYS wins. POS `create_booking` RPC uses atomic check. Website must check POS availability before booking. |
| 10 | **Hold expires before payment** | `hold_expires_at` check | Booking marked as expired, room released | Website `create-booking` expires old holds before creating new booking. Guest must re-book if hold expires. |
| 11 | **POS is down / unreachable** | `sync-webhook-sender` gets connection error | Events queue up on website | Circuit breaker pattern: after 3 consecutive failures, pause 60s. Events remain in `sync_events` with retry_count. |
| 12 | **Website is down / unreachable** | `website-sync` gets connection error | Events queue up on POS | Same circuit breaker. `sync_queue` retains items for retry. |
| 13 | **Database trigger fails** | `emit_booking_sync_event()` throws | Sync event not created | Trigger runs in same transaction as booking update. If trigger fails, booking update rolls back. |
| 14 | **Room mapping missing** | POS `booking-webhook` queries `room_mappings`, finds none | Website booking not created in POS | Return 200 with `skipped: true` and reason. Website must handle skipped bookings (admin alert). |

---

## 13. Reconciliation & Drift Detection

### 13.1 Scheduled Reconciliation Cron

A reconciliation job runs every 15 minutes on the POS system:

```
Reconciliation Cron (POS-side):
1. Fetch all bookings from website via pos-sync-api GET /bookings
   (filter: last 7 days, all statuses)
2. For each website booking with pos_booking_id:
   a. Look up POS booking by id
   b. Compare: status, check_in, check_out, guest_name
   c. If mismatch: log drift, attempt auto-correct
      - If website says confirmed but POS says cancelled → sync cancellation to website
      - If POS says checked_in but website says confirmed → sync check-in to website
      - If POS has no booking for pos_booking_id → dead-letter for admin review
3. For each website booking WITHOUT pos_booking_id:
   a. Payment was confirmed but POS never received it
   b. Attempt push again via sync-webhook-sender
   c. If max retries: dead-letter for admin review
4. For each POS booking with external_booking_id but no match on website:
   a. POS booking synced but website deleted it (rare)
   b. Dead-letter for admin review
```

### 13.2 Drift Detection Rules

| Drift Type | Severity | Auto-Correct | Alert |
|---|---|---|---|
| Status mismatch (confirmed vs checked_in) | Low | POS → Website | Log only |
| Status mismatch (confirmed vs cancelled) | High | POS wins | Admin notification |
| Booking exists on POS but not on website | High | Push to website | Admin notification |
| Booking exists on website but not on POS | Critical | Dead-letter | Admin alert + potential refund |
| Payment status mismatch | Medium | POS wins (payment = POS domain) | Admin notification |

### 13.3 Eventual Consistency Guarantee

Under normal operation, the system is **strongly consistent** (synchronous path):
- Website→POS: Guest waits for POS confirmation → booking confirmed
- POS→Website: POS waits for website confirmation → sync complete

Under failure (retry/reconciliation), the system falls back to **eventual consistency**:
- All events eventually delivered via retry
- Reconciliation cron corrects any remaining drift
- Maximum inconsistency window: 15 minutes (reconciliation interval)

---

## 14. Conflict Prevention Rules

### Rule 1: POS Always Wins Room Allocation

```
POS can ALWAYS assign a room, even if website shows it as available.
Website must never override POS room state.
```

### Rule 2: Website Must Check POS Availability

Before confirming payment (or before creating booking for pay_at_property),
website SHOULD check POS availability via `website-sync` `check_availability` action.

This is a soft check — POS makes the final decision during webhook processing.

### Rule 3: Hold-Based Temporary Reservation

Website uses `hold_expires_at` to temporarily reserve rooms:
- Booking created: hold for 15 minutes
- Payment initiated: refresh hold for another 15 minutes
- Payment confirmed: hold becomes permanent (booking confirmed)
- Hold expired: booking marked `expired`, room released

### Rule 4: Source-Based Loop Prevention

```
source = 'website': Booking originates from website → triggers website→POS sync
source = 'pos':     Booking originates from POS → DOES NOT trigger website→POS sync
```

Both sides check source before triggering sync events.

### Rule 5: Atomic Availability Check

POS `create_booking` RPC MUST use atomic `SELECT ... FOR UPDATE` or
serializable transaction to prevent concurrent booking creation for the same room.

---

## 15. Mapping to Existing Code

### Already Implemented (Reuse)

| Component | Location | Status |
|---|---|---|
| `booking-webhook` | `edge-functions/booking-webhook/index.js` | Works for Flow A, needs HMAC timestamp validation |
| `website-sync` | `edge-functions/website-sync/index.js` | Works for Flow B dispatch, needs target URL fix |
| `sync-webhook-sender` | `insforge/functions/sync-webhook-sender/index.ts` | Works for Flow A dispatch |
| `pos-sync-api` | `insforge/functions/pos-sync-api/index.ts` | Works for Flow B receive |
| `create-booking` | `insforge/functions/create-booking/index.ts` | Works for booking creation with holds |
| `fonepay-payment` | `insforge/functions/fonepay-payment/index.ts` | Works for payment processing |
| `confirm_booking_payment` RPC | Website DB function | Works, needs trigger update |
| `create_booking` RPC | POS DB function | Works |
| `link_external_booking` RPC | POS DB function | Works |
| `log_sync_entry` RPC | POS DB function | Works |
| `emit_booking_sync_event` trigger | Website DB trigger | EXISTS, needs source filter update |
| `booking-sync.ts` | `src/lib/services/booking-sync.ts` | Service layer, works |
| `booking-sync.types.ts` | `src/lib/services/booking-sync.types.ts` | Type definitions, works |
| `mutation-queue.ts` | `src/lib/services/mutation-queue.ts` | Offline queue with retry, works |
| `SyncAdminPanel` | POS UI component | Room mapping, sync logs, queue management |
| `room_mappings` table | POS DB | Works |
| `sync_logs` table | POS DB | Works |
| `sync_queue` table | POS DB | Works |
| `external_bookings` table | POS DB | Works |
| `sync_events` table | Website DB | Works, minor enhancements |
| `system_events` table | POS DB | Event logging, works |

### Needs Enhancement

| Component | Change Required | Priority |
|---|---|---|
| `emit_booking_sync_event` trigger | Add `source = 'pos'` filter to prevent loop | High |
| `sync-webhook-sender` | Add HMAC timestamp, handle 409 with cancellation | High |
| `pos-sync-api` POST /bookings | Fix idempotency check to use pos_booking_id field | High |
| `website-sync` push_booking | Add HMAC timestamp header | Medium |
| `booking-webhook` | Add timestamp validation (±5min) | Medium |
| Database triggers | Add `emit_new_booking_sync_event` for POS inserts | Medium |
| Reconciliation cron | New scheduled function on POS | Low (but recommended) |

### New Components Needed

| Component | Location | Purpose | Priority |
|---|---|---|---|
| `check_room_availability` RPC | Website DB | For POS availability checks | High |
| `get_availability_for_dates` RPC | POS DB | Atomic availability check | High |
| `external_bookings_upsert` RPC | POS DB | Upsert for external booking links | Medium |
| Reconciliation cron function | POS `edge-functions/reconciliation` | Drift detection + correction | Medium |

---

## 16. Implementation Order

### Phase 1: Foundation (Database Changes)

1. Website: Add `pending_sync` to booking_status constraint
2. Website: Add `idempotency_key` + `response_body` columns to `sync_events`
3. Website: Add UNIQUE index on `bookings.pos_booking_id`
4. POS: Add `dead_letter_at` + `dead_letter_reason` to `sync_queue`
5. POS: Add UNIQUE indexes on `room_mappings`
6. POS: Add UNIQUE index on `external_bookings(pos_booking_id, source)`

### Phase 2: Loop Prevention (Critical)

1. Website: Update `emit_booking_sync_event()` trigger — add `source = 'pos'` filter
2. Website: Create `emit_new_booking_sync_event()` trigger for POS inserts
3. POS: Verify `website-sync` push_booking sets correct target (`pos-sync-api/bookings` POST, not `booking-webhook`)

### Phase 3: Edge Function Enhancements

1. Website: Update `sync-webhook-sender` — HMAC timestamp, 409 handling
2. Website: Update `pos-sync-api` — fix idempotency check, add DELETE endpoint
3. POS: Update `booking-webhook` — timestamp validation, new event types
4. POS: Update `website-sync` — HMAC timestamp header

### Phase 4: RPCs + Reconciliation

1. Website: Create `check_room_availability` RPC
2. POS: Create `get_availability_for_dates` RPC
3. POS: Create `external_bookings_upsert` RPC
4. POS: Create reconciliation cron function

### Phase 5: Testing + Verification

1. Test Flow A: Website booking → payment → sync → POS confirmation
2. Test Flow B: POS booking → sync → Website creation
3. Test status updates: check-in, check-out, cancel (both directions)
4. Test failure scenarios: timeout, HMAC mismatch, duplicate, conflict, POS down
5. Test loop prevention: POS update on website does not re-trigger to POS
6. Test reconciliation: manual drift injection → cron detects and corrects
