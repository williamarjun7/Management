export type Role = 'admin' | 'manager' | 'owner' | 'staff' | 'kitchen' | 'reception';
export type OrderStatus = 'active' | 'completed' | 'cancelled' | 'refunded';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded';
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'credit_account' | 'fonepay';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  credit_account: 'Credit Account',
  fonepay: 'FonePay',
};

export const PAYMENT_METHOD_ICONS: Record<PaymentMethod, string> = {
  cash: '💰',
  card: '💳',
  upi: '📱',
  credit_account: '📋',
  fonepay: '📷',
};

export const CASH_QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

export type QRPaymentStatus = 'idle' | 'generating' | 'displaying' | 'polling' | 'verifying' | 'success' | 'failed' | 'expired';

export interface FonepayTransactionRecord {
  id: string;
  invoice_id: string;
  transaction_id: string;
  amount: number;
  qr_generated_at: string;
  qr_expiry: string | null;
  status: string;
  verified_at: string | null;
  payment_log_id: string | null;
  gateway_reference: string | null;
  paid_amount: number | null;
  paid_at: string | null;
  created_at: string;
}

export interface FonepayConfig {
  merchantCode: string;
}

export interface CreditCustomer {
  id: string;
  name: string;
  phone: string | null;
  total_balance: number;
  outstanding: number;
  last_payment: string | null;
}
export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'refunded';
export type RoomStatus = 'available' | 'reserved' | 'booked' | 'occupied' | 'partial_paid' | 'fully_paid' | 'cleaning' | 'maintenance';
export type StockMovementType = 'purchase' | 'sale' | 'wastage' | 'adjustment' | 'room_usage';
export type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
export type TableStatus = 'available' | 'reserved' | 'occupied' | 'ordering' | 'preparing' | 'ready' | 'dining' | 'billing' | 'cleaning';
export type ServiceType = 'room_service' | 'minibar' | 'housekeeping' | 'other';
export type PaymentIntentStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'reversed';
export type InventoryHoldStatus = 'active' | 'consumed' | 'released' | 'expired';

export const ORDER_STATUS_LABELS: Record<string, string> = {
  active: "Active", completed: "Completed",
  cancelled: "Cancelled", refunded: "Refunded",
};

export const TABLE_STATUS_LABELS: Record<string, string> = {
  available: "Available", reserved: "Reserved", occupied: "Occupied",
  ordering: "Ordering", preparing: "Preparing", ready: "Ready",
  dining: "Dining", billing: "Billing", cleaning: "Cleaning",
};

export const TABLE_STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-500", reserved: "bg-blue-500", occupied: "bg-orange-500",
  ordering: "bg-violet-500", preparing: "bg-amber-500", ready: "bg-green-500",
  dining: "bg-teal-500", billing: "bg-red-500", cleaning: "bg-slate-500",
};

export const TABLE_STATUS_BG: Record<string, string> = {
  available: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800",
  reserved: "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800",
  occupied: "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800",
  ordering: "bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800",
  preparing: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800",
  ready: "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800",
  dining: "bg-teal-50 dark:bg-teal-950/20 border-teal-200 dark:border-teal-800",
  billing: "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800",
  cleaning: "bg-slate-50 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800",
};

export const ROOM_STATUS_LABELS: Record<string, string> = {
  available: "Available", reserved: "Booked", booked: "Booked", occupied: "Occupied",
  partial_paid: "Partial Paid", fully_paid: "Fully Paid",
  cleaning: "Cleaning", maintenance: "Maintenance",
};

export const ROOM_STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-500", reserved: "bg-yellow-500", booked: "bg-yellow-500",
  occupied: "bg-red-500", partial_paid: "bg-blue-500", fully_paid: "bg-green-500",
  cleaning: "bg-orange-500", maintenance: "bg-gray-500",
};

export const ROOM_STATUS_BG: Record<string, string> = {
  available: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800",
  reserved: "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800",
  booked: "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800",
  occupied: "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800",
  partial_paid: "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800",
  fully_paid: "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800",
  cleaning: "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800",
  maintenance: "bg-gray-50 dark:bg-gray-950/20 border-gray-200 dark:border-gray-800",
};

export interface AuditLog {
  id: string; user_id: string | null; action: string; entity_type: string;
  entity_id: string; previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null; reason: string | null;
  metadata: Record<string, unknown>; created_at: string;
}

export type AuditAction = string;

export interface AuditEntry {
  action: string;
  entity_type: string;
  entity_id: string;
  previous_state?: Record<string, unknown> | null;
  new_state?: Record<string, unknown> | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  event_type?: string | null;
}

export interface UserProfile {
  id: string; name: string | null; phone: string | null; role: Role;
  email: string | null; avatar_url: string | null; is_active: boolean;
  created_at: string; updated_at: string;
}

export interface RestaurantTable {
  id: string; table_number: string; capacity: number; section: string | null;
  is_active: boolean; status: TableStatus;
  created_at: string; updated_at: string;
}

export interface MenuCategory {
  id: string; name: string; description: string | null;
  sort_order: number; is_active: boolean; created_at: string; updated_at: string;
}

export interface MenuItem {
  id: string; category_id: string; name: string; description: string | null;
  price: number; image_url: string | null; is_available: boolean;
  is_active: boolean; preparation_time: number | null;
  created_at: string; updated_at: string;
}

export interface MenuItemModifier {
  id: string; menu_item_id: string; name: string;
  options: Array<{ name: string; price: number }>;
  max_selections: number; is_required: boolean;
}

export interface Recipe {
  id: string; menu_item_id: string; name: string; servings: number;
  instructions: string | null; created_at: string; updated_at: string;
}

export interface RecipeVersion {
  id: string; recipe_id: string; version: number; name: string; servings: number;
  instructions: string | null; is_current: boolean; created_at: string;
}

export interface RecipeItem {
  id: string; recipe_version_id: string; product_id: string | null;
  quantity: number; unit: string; created_at: string;
}

export interface Product {
  id: string; name: string; sku: string | null; category: string | null;
  unit: string; reorder_level: number | null; is_active: boolean;
  created_at: string; updated_at: string;
}

export interface StockMovement {
  id: string; product_id: string; movement_type: StockMovementType;
  quantity: number; unit: string; running_balance: number;
  reference_type: string | null; reference_id: string | null;
  reason: string | null; created_by: string | null; created_at: string;
}

export interface OrderItem {
  id: string; order_id: string; menu_item_id: string;
  recipe_version_id: string | null; item_name: string; quantity: number;
  unit_price: number; modifiers: Array<{ name: string; option: string; price: number }>;
  notes: string | null; status: OrderStatus; created_at: string; updated_at: string;
}

export interface Order {
  id: string; order_number: string; table_id: string | null;
  customer_name: string | null;
  customer_phone: string | null; status: OrderStatus;
  subtotal: number; discount: number;
  total: number; notes: string | null; created_by: string | null;
  assigned_to: string | null; idempotency_key: string | null;
  created_at: string; updated_at: string;
  restaurant_tables?: { table_number: string } | null;
  order_items?: OrderItem[];
}

export interface OrderStatusHistory {
  id: string; order_id: string; from_status: OrderStatus | null;
  to_status: OrderStatus; changed_by: string | null; reason: string | null;
  created_at: string;
}

export interface InvoiceItem {
  id: string; invoice_id: string; description: string; quantity: number;
  unit_price: number; total: number; reference_type: string | null;
  reference_id: string | null; created_at: string;
}

export interface PaymentLog {
  id: string; invoice_id: string; amount: number; method: PaymentMethod;
  reference: string | null; status: PaymentStatus; notes: string | null;
  processed_by: string | null; idempotency_key: string | null; created_at: string;
}

export interface Invoice {
  id: string; invoice_number: string; order_id: string | null;
  booking_id: string | null; customer_name: string | null;
  customer_phone: string | null; subtotal: number; discount: number; total: number;
  status: InvoiceStatus; notes: string | null; created_by: string | null;
  idempotency_key: string | null; created_at: string; updated_at: string;
  locked_for_payment: boolean | null; locked_until: string | null;
  invoice_items?: InvoiceItem[]; payment_logs?: PaymentLog[];
}

export interface RoomType {
  id: string; name: string; base_price: number; max_guests: number;
  is_active: boolean; created_at: string; updated_at: string;
}

export interface Room {
  id: string; room_number: string; room_type_id: string;
  status: RoomStatus; is_active: boolean;
  created_at: string; updated_at: string; room_types?: RoomType;
}

export interface RoomStateTransition {
  id: string; room_id: string; from_status: RoomStatus | null;
  to_status: RoomStatus; reason: string | null; changed_by: string | null;
  created_at: string;
}

export interface Booking {
  id: string; booking_number: string; room_id: string; guest_name: string;
  guest_phone: string | null; check_in: string; check_out: string;
  adults: number; children: number; status: BookingStatus;
  nightly_rate: number; total_amount: number; paid_amount: number;
  notes: string | null; created_by: string | null;
  idempotency_key: string | null; created_at: string; updated_at: string;
  rooms?: Room; room_services?: RoomService[];
}

export interface RoomService {
  id: string; booking_id: string; room_id: string; menu_item_id: string | null;
  description: string; quantity: number; unit_price: number; total: number;
  service_type: ServiceType; created_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  name: string | null;
  profile: UserProfile | null;
  emailVerified: boolean;
}

export type AuthStatus = 'anonymous' | 'verification_pending' | 'authenticated';

// ─── Split Bill Types ───

export type SplitType = 'equal' | 'item_based' | 'custom';
export type SplitPaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'refunded';

export interface BillSplit {
  id: string;
  invoice_id: string;
  order_id: string | null;
  split_type: SplitType;
  guest_name: string;
  subtotal: number;
  tax_amount: number;
  service_charge: number;
  discount_amount: number;
  total_amount: number;
  payment_status: SplitPaymentStatus;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  split_items?: SplitItem[];
  split_payments?: SplitPayment[];
}

export interface SplitItem {
  id: string;
  split_id: string;
  order_item_id: string | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
}

export interface SplitPayment {
  id: string;
  split_id: string;
  payment_method: PaymentMethod | 'digital_wallet' | 'mixed';
  amount: number;
  transaction_reference: string | null;
  notes: string | null;
  processed_by: string | null;
  paid_at: string;
  created_at: string;
}

export interface SplitGuest {
  id: string;
  name: string;
  items?: { order_item_id: string; item_name: string; quantity: number; unit_price: number }[];
  amount?: number;
}

export interface PaymentFormData {
  invoice_id: string; amount: number; method: PaymentMethod;
  reference?: string; notes?: string;
}

export interface ProductFormData {
  name: string; sku?: string; category?: string; unit: string; reorder_level?: number;
}

export interface StockMovementFormData {
  product_id: string; movement_type: StockMovementType;
  quantity: number; reason?: string;
}

export interface BookingFormData {
  room_id: string; guest_name: string; guest_phone?: string;
  check_in: string; check_out: string; adults: number; children: number;
  nightly_rate: number; notes?: string;
}

export interface RoomServiceFormData {
  booking_id: string; room_id: string; description: string;
  quantity: number; unit_price: number; service_type: ServiceType;
}

export interface PaymentIntent {
  id: string; invoice_id: string; amount: number; method: PaymentMethod;
  status: PaymentIntentStatus; idempotency_key: string | null;
  processed_at: string | null; failed_at: string | null;
  failed_reason: string | null; reversed_at: string | null;
  reversed_reason: string | null; created_by: string | null; created_at: string;
}

export interface InventoryHold {
  id: string; order_id: string; product_id: string; quantity: number;
  status: InventoryHoldStatus; created_at: string; expires_at: string;
}

export interface SystemEvent {
  id: string; event_type: string; entity_type: string;
  entity_id: string; payload: Record<string, unknown>; created_at: string;
}

export interface MutationQueueItem {
  id: string;
  operation: string;
  params: Record<string, unknown>;
  idempotencyKey: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead';
  createdAt: string;
  retryCount: number;
  lastError: string | null;
  processingStartedAt?: string;
  processorTabId?: string;
}

// ─── Table Sessions ───

export interface TableSession {
  id: string;
  table_id: string;
  staff_id: string | null;
  status: 'active' | 'paused' | 'closed';
  started_at: string;
  closed_at: string | null;
  metadata: Record<string, unknown>;
}

export type WorkflowStep = 'table_selected' | 'order_created' | 'kitchen_pending' | 'preparing' | 'ready' | 'served' | 'billing' | 'closed';

export type TableWorkflowStep = 'available' | 'occupied' | 'ordering' | 'billing' | 'cleaning' | 'available_complete';

export type BillingWorkflowStep = 'generate_bill' | 'process_payment' | 'close_session' | 'reset_table';

export interface WorkflowState {
  id: string;
  entity_type: 'order' | 'table' | 'billing';
  entity_id: string;
  current_step: string;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  context: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowLog {
  id: string;
  workflow_id: string;
  from_step: string | null;
  to_step: string;
  action: string;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface TransitionHistory {
  id: string;
  entity_type: string;
  entity_id: string;
  from_state: string | null;
  to_state: string;
  triggered_by: string | null;
  reason: string | null;
  created_at: string;
}

// ─── Housekeeping ───

export type TaskType = 'cleaning' | 'deep_clean' | 'turnover' | 'inspection';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface HousekeepingTask {
  id: string;
  room_id: string;
  assigned_to: string | null;
  task_type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  notes: string | null;
  completed_at: string | null;
  created_by: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
  rooms?: Room;
}

// ─── Maintenance ───

export type AssetType = 'room' | 'equipment' | 'furniture' | 'plumbing' | 'electrical' | 'hvac' | 'other';

export interface MaintenanceTask {
  id: string;
  room_id: string | null;
  asset_type: AssetType;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  reported_by: string | null;
  assigned_to: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  notes: string | null;
  completed_at: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
  rooms?: Room;
}

// ─── Suppliers ───

export interface Supplier {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_id: string | null;
  payment_terms: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Purchase Orders ───

export type PurchaseOrderStatus = 'draft' | 'ordered' | 'partial' | 'received' | 'cancelled';

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string | null;
  status: PurchaseOrderStatus;
  order_date: string;
  expected_date: string | null;
  received_date: string | null;
  notes: string | null;
  created_by: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
  suppliers?: Supplier;
  purchase_order_items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  received_quantity: number;
  created_at: string;
  products?: Product;
}
