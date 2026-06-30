# Highlands Cafe & Motel Inn — Audit & Production Readiness Report

## Date: 2026-06-30

## 1. Changes Summary

### 1.1 Root Cause Fix — "type invoices does not exist"
- **File**: `migrations/20260701000000_initial_schema.sql` (NEW)
- Created all missing tables: `invoices`, `invoice_items`, `payment_logs`, `payment_intents`, `fonepay_transactions`
- Created `payment_method`, `invoice_status`, `payment_intent_status` enum types
- Added missing columns to existing tables: `orders.tax`, `orders.tax_rate`, `orders.service_charge`, `orders.service_charge_rate`, `orders.discount_type`, `orders.discount_value`, `order_items.discount*`, `table_sessions.closed_by`
- Created RPC functions: `process_cash_payment`, `process_payment`, `search_customers`, `create_system_event`, `transition_order_status`
- All indexes, RLS policies, grants included

### 1.2 Centralized Financial Calculations
- **File**: `src/lib/core/financial-calculations.ts` (NEW)
- Single source of truth: `calculateItemDiscount`, `calculateOrderDiscount`, `calculateTax`, `calculateServiceCharge`, `calculateFinancialBreakdown`, `isPaymentSufficient`, `calculateChange`, `calculateRemainingDue`
- Used by: `PaymentCheckout.tsx`, `PaymentModal.tsx`, `PrintInvoice.tsx`, `InvoiceDetailPage.tsx`, `PosPage.tsx`

### 1.3 TypeScript Type Updates
- **File**: `src/types/index.ts`
- `Invoice`: added `tax`, `tax_rate`, `service_charge`, `service_charge_rate`, `discount_type`, `discount_value`
- `Order`: added `tax`, `tax_rate`, `service_charge`, `service_charge_rate`, `discount_type`, `discount_value`
- `OrderItem`: added `discount`, `discount_type`, `discount_value`, `original_price`
- `InvoiceItem`: added `discount_type`, `discount_value`
- `PaymentLog`: added `cash_received`, `change_due`

### 1.4 Table State Machine Fix
- **File**: `src/lib/services/table-state.ts`
- Added missing transitions: `ordering→preparing→ready→served→dining→billing→cleaning`
- Fixed `refreshFromOrders` logic

### 1.5 Parameter Name Bug Fix
- **File**: `src/lib/services/payment-workflow.ts`
- `processCashPayment`, `processFonepayPayment`, `processCreditPayment`: `p_user_id` → `p_processed_by`
- Added `p_notes` parameter to `processCashPayment` for DB consistency

### 1.6 UI Component Updates
- **`PaymentCheckout.tsx`**: Full financial breakdown (subtotal, item discounts, order discount, tax w/ rate, service charge w/ rate, grand total, already paid, remaining due, cash received, change due, insufficient payment warnings)
- **`PaymentModal.tsx`**: Same full financial breakdown with discount columns, change/remaining due display
- **`PrintInvoice.tsx`**: Complete receipt layout with all financial line items
- **`InvoiceDetailPage.tsx`**: Financial breakdown table, discount columns, payment history
- **`KitchenOrderCard.tsx`**: Deprecated M3 CSS → proper Tailwind utilities

### 1.7 Hook & Page Integration
- **`orders.hooks.ts`**: `useCreateOrder`, `useAddOrderItems` pass `discount_type`/`discount_value`
- **`PosPage.tsx`**: Passes all financial fields during order/invoice creation
- **`BillingPage.tsx`**: Uses `i.total` (grand total) — correct with new schema

## 2. Verification
- TypeScript build: **PASS** (0 errors)
- All existing tests: **PASS** (telemetry, logger, reports, sentry, realtime, mutation-queue, app-update, chaos tests)
- Components reviewed and verified: `FonepayQRDialog`, `PaymentCheckout`, `PaymentModal`, `BillingPage`, `KitchenPage`, `InvoiceDetailPage`, `PrintInvoice`, `PosPage`

## 3. Remaining Work
- Apply migration `20260701000000_initial_schema.sql` to database
- Test payment workflows end-to-end against live database
- Validate real-time Fonepay QR payment flow with actual gateway
- Test kitchen order state transitions (ordering→preparing→ready→served)
- Verify offline mutation queue handles new financial fields correctly
