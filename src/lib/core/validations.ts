import { z } from "zod";

export const menuCategorySchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional().or(z.literal("")),
});

export type MenuCategoryFormData = z.infer<typeof menuCategorySchema>;

export const menuItemSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(500).optional().or(z.literal("")),
  price: z.coerce.number().min(0.01, "Price must be greater than 0"),
  category_id: z.string().min(1, "Category is required"),
  prep_time: z.coerce.number().min(0).optional().or(z.nan().transform(() => undefined)),
  is_available: z.boolean().default(true),
});

export type MenuItemFormData = z.infer<typeof menuItemSchema>;

export const orderItemInputSchema = z.object({
  menu_item_id: z.string().min(1, "Menu item is required"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  notes: z.string().max(200).optional().or(z.literal("")),
});

export type OrderItemInput = z.infer<typeof orderItemInputSchema>;

export const createOrderSchema = z.object({
  table_id: z.string().min(1, "Table is required"),
  customer_name: z.string().max(200).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
  items: z.array(orderItemInputSchema).min(1, "At least one item is required"),
});

export type CreateOrderFormData = z.infer<typeof createOrderSchema>;

const paymentMethodEnum = z.enum(["cash", "credit_account", "fonepay"]);
const movementTypeEnum = z.enum(["purchase", "sale", "wastage", "adjustment", "room_usage"]);
const serviceTypeEnum = z.enum(["room_service", "minibar", "housekeeping", "other"]);

export const paymentSchema = z.object({
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  method: paymentMethodEnum,
  reference: z.string().max(200).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export type PaymentFormData = z.infer<typeof paymentSchema>;

export const productSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  sku: z.string().max(50).optional().or(z.literal("")),
  category: z.string().max(100).optional().or(z.literal("")),
  unit: z.string().min(1, "Unit is required").max(20),
  reorder_level: z.coerce.number().min(0).optional().or(z.nan().transform(() => undefined)),
});

export type ProductFormData = z.infer<typeof productSchema>;

export const stockMovementSchema = z.object({
  product_id: z.string().min(1, "Product is required"),
  movement_type: movementTypeEnum,
  quantity: z.coerce.number().min(0.001, "Quantity must be greater than 0"),
  reason: z.string().max(500).optional().or(z.literal("")),
});

export type StockMovementFormData = z.infer<typeof stockMovementSchema>;

export const bookingSchema = z.object({
  room_id: z.string().min(1, "Room is required"),
  guest_name: z.string().min(1, "Guest name is required").max(200),
  guest_phone: z.string().max(20).optional().or(z.literal("")),
  check_in: z.string().min(1, "Check-in date is required"),
  check_out: z.string().min(1, "Check-out date is required"),
  adults: z.coerce.number().int().min(1, "At least 1 adult"),
  children: z.coerce.number().int().min(0),
  nightly_rate: z.coerce.number().min(0, "Rate must be positive"),
  notes: z.string().max(500).optional().or(z.literal("")),
}).refine(
  (data) => !data.check_in || !data.check_out || new Date(data.check_out) > new Date(data.check_in),
  { message: "Check-out must be after check-in", path: ["check_out"] }
);

export type BookingFormData = z.infer<typeof bookingSchema>;

export const roomServiceSchema = z.object({
  booking_id: z.string().min(1, "Booking is required"),
  room_id: z.string().min(1, "Room is required"),
  description: z.string().min(1, "Description is required").max(500),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  unit_price: z.coerce.number().min(0, "Unit price must be positive"),
  service_type: serviceTypeEnum,
});

export type RoomServiceFormData = z.infer<typeof roomServiceSchema>;

export const roomSchema = z.object({
  room_number: z.string().min(1, "Room number is required").max(10),
  room_type_id: z.string().min(1, "Room type is required"),
});

export type RoomFormData = z.infer<typeof roomSchema>;

export const tableSchema = z.object({
  table_number: z.string().min(1, "Table number is required").max(10),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1"),
  section: z.string().max(100).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
  qr_code_url: z.string().url("Invalid QR code URL").optional().or(z.literal("")),
});

export type TableFormData = z.infer<typeof tableSchema>;

export const invoiceVoidSchema = z.object({
  reason: z.string().min(1, "Reason is required").max(500),
});

export type InvoiceVoidFormData = z.infer<typeof invoiceVoidSchema>;

export const createOrderSchemaFull = createOrderSchema.extend({
  discount: z.coerce.number().min(0, "Discount cannot be negative").optional().default(0),
});
