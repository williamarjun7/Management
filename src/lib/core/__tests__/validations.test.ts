import { describe, it, expect } from 'vitest';
import {
  menuCategorySchema,
  menuItemSchema,
  orderItemInputSchema,
  createOrderSchema,
  paymentSchema,
  productSchema,
  stockMovementSchema,
  bookingSchema,
  roomServiceSchema,
  roomSchema,
  tableSchema,
  invoiceVoidSchema,
  createOrderSchemaFull,
} from '../validations';

describe('menuCategorySchema', () => {
  it('accepts valid category', () => {
    const r = menuCategorySchema.safeParse({ name: 'Beverages' });
    expect(r.success).toBe(true);
  });

  it('rejects empty name', () => {
    const r = menuCategorySchema.safeParse({ name: '' });
    expect(r.success).toBe(false);
  });

  it('accepts optional description', () => {
    const r = menuCategorySchema.safeParse({ name: 'Food', description: 'Hot meals' });
    expect(r.success).toBe(true);
  });

  it('rejects name over 100 characters', () => {
    const r = menuCategorySchema.safeParse({ name: 'x'.repeat(101) });
    expect(r.success).toBe(false);
  });
});

describe('menuItemSchema', () => {
  it('accepts valid menu item', () => {
    const r = menuItemSchema.safeParse({
      name: 'Burger', price: 9.99, category_id: 'cat-1',
    });
    expect(r.success).toBe(true);
  });

  it('rejects zero price', () => {
    const r = menuItemSchema.safeParse({
      name: 'Free Item', price: 0, category_id: 'cat-1',
    });
    expect(r.success).toBe(false);
  });

  it('coerces string price to number', () => {
    const r = menuItemSchema.safeParse({
      name: 'Burger', price: '12.50', category_id: 'cat-1',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.price).toBe(12.5);
  });

  it('accepts optional prep_time', () => {
    const r = menuItemSchema.safeParse({
      name: 'Pizza', price: 15, category_id: 'cat-1', prep_time: 20,
    });
    expect(r.success).toBe(true);
  });

  it('defaults is_available to true', () => {
    const r = menuItemSchema.safeParse({
      name: 'Soda', price: 2, category_id: 'cat-1',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.is_available).toBe(true);
  });
});

describe('orderItemInputSchema', () => {
  it('accepts valid order item', () => {
    const r = orderItemInputSchema.safeParse({
      menu_item_id: 'item-1', quantity: 2,
    });
    expect(r.success).toBe(true);
  });

  it('rejects zero quantity', () => {
    const r = orderItemInputSchema.safeParse({
      menu_item_id: 'item-1', quantity: 0,
    });
    expect(r.success).toBe(false);
  });

  it('rejects negative quantity', () => {
    const r = orderItemInputSchema.safeParse({
      menu_item_id: 'item-1', quantity: -1,
    });
    expect(r.success).toBe(false);
  });

  it('accepts optional notes', () => {
    const r = orderItemInputSchema.safeParse({
      menu_item_id: 'item-1', quantity: 1, notes: 'No onions',
    });
    expect(r.success).toBe(true);
  });
});

describe('createOrderSchema', () => {
  it('accepts valid order', () => {
    const r = createOrderSchema.safeParse({
      table_id: 'table-1',
      items: [{ menu_item_id: 'item-1', quantity: 2 }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects order with no items', () => {
    const r = createOrderSchema.safeParse({
      table_id: 'table-1', items: [],
    });
    expect(r.success).toBe(false);
  });

  it('rejects order without table', () => {
    const r = createOrderSchema.safeParse({
      items: [{ menu_item_id: 'item-1', quantity: 1 }],
    });
    expect(r.success).toBe(false);
  });

  it('accepts optional customer name and notes', () => {
    const r = createOrderSchema.safeParse({
      table_id: 'table-1',
      customer_name: 'John',
      notes: 'Corner table',
      items: [{ menu_item_id: 'item-1', quantity: 1 }],
    });
    expect(r.success).toBe(true);
  });
});

describe('paymentSchema', () => {
  it('accepts cash payment', () => {
    const r = paymentSchema.safeParse({ amount: 100, method: 'cash' });
    expect(r.success).toBe(true);
  });

  it('accepts credit account payment', () => {
    const r = paymentSchema.safeParse({ amount: 50, method: 'credit_account' });
    expect(r.success).toBe(true);
  });

  it('rejects zero amount', () => {
    const r = paymentSchema.safeParse({ amount: 0, method: 'cash' });
    expect(r.success).toBe(false);
  });

  it('rejects fonepay (not in allowed methods)', () => {
    const r = paymentSchema.safeParse({ amount: 100, method: 'fonepay' });
    expect(r.success).toBe(false);
  });

  it('rejects invalid method', () => {
    const r = paymentSchema.safeParse({ amount: 100, method: 'bitcoin' });
    expect(r.success).toBe(false);
  });

  it('accepts optional reference and notes', () => {
    const r = paymentSchema.safeParse({
      amount: 200, method: 'cash', reference: 'REF-001', notes: 'Payment for table 5',
    });
    expect(r.success).toBe(true);
  });
});

describe('productSchema', () => {
  it('accepts valid product', () => {
    const r = productSchema.safeParse({ name: 'Tomato', unit: 'kg' });
    expect(r.success).toBe(true);
  });

  it('rejects empty name', () => {
    const r = productSchema.safeParse({ name: '', unit: 'kg' });
    expect(r.success).toBe(false);
  });

  it('rejects empty unit', () => {
    const r = productSchema.safeParse({ name: 'Sugar', unit: '' });
    expect(r.success).toBe(false);
  });

  it('accepts optional sku and category', () => {
    const r = productSchema.safeParse({
      name: 'Flour', unit: 'kg', sku: 'FL-001', category: 'Baking',
    });
    expect(r.success).toBe(true);
  });
});

describe('stockMovementSchema', () => {
  it('accepts purchase movement', () => {
    const r = stockMovementSchema.safeParse({
      product_id: 'prod-1', movement_type: 'purchase', quantity: 50,
    });
    expect(r.success).toBe(true);
  });

  it('accepts wastage movement', () => {
    const r = stockMovementSchema.safeParse({
      product_id: 'prod-1', movement_type: 'wastage', quantity: 2,
    });
    expect(r.success).toBe(true);
  });

  it('rejects zero quantity', () => {
    const r = stockMovementSchema.safeParse({
      product_id: 'prod-1', movement_type: 'purchase', quantity: 0,
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid movement type', () => {
    const r = stockMovementSchema.safeParse({
      product_id: 'prod-1', movement_type: 'transfer', quantity: 10,
    });
    expect(r.success).toBe(false);
  });

  it('rejects missing product_id', () => {
    const r = stockMovementSchema.safeParse({
      movement_type: 'sale', quantity: 1,
    });
    expect(r.success).toBe(false);
  });
});

describe('bookingSchema', () => {
  it('accepts valid booking', () => {
    const r = bookingSchema.safeParse({
      room_id: 'room-1', guest_name: 'Alice',
      check_in: '2026-07-01', check_out: '2026-07-03',
      adults: 2, children: 0, nightly_rate: 100,
    });
    expect(r.success).toBe(true);
  });

  it('rejects checkout before checkin', () => {
    const r = bookingSchema.safeParse({
      room_id: 'room-1', guest_name: 'Bob',
      check_in: '2026-07-05', check_out: '2026-07-03',
      adults: 1, children: 0, nightly_rate: 100,
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty guest name', () => {
    const r = bookingSchema.safeParse({
      room_id: 'room-1', guest_name: '',
      check_in: '2026-07-01', check_out: '2026-07-02',
      adults: 1, children: 0, nightly_rate: 100,
    });
    expect(r.success).toBe(false);
  });

  it('rejects zero adults', () => {
    const r = bookingSchema.safeParse({
      room_id: 'room-1', guest_name: 'Carol',
      check_in: '2026-07-01', check_out: '2026-07-02',
      adults: 0, children: 0, nightly_rate: 100,
    });
    expect(r.success).toBe(false);
  });

  it('accepts optional phone and notes', () => {
    const r = bookingSchema.safeParse({
      room_id: 'room-1', guest_name: 'Dave', guest_phone: '9800000000',
      check_in: '2026-07-01', check_out: '2026-07-02',
      adults: 1, children: 1, nightly_rate: 150,
      notes: 'Late check-in',
    });
    expect(r.success).toBe(true);
  });
});

describe('roomServiceSchema', () => {
  it('accepts valid room service', () => {
    const r = roomServiceSchema.safeParse({
      booking_id: 'booking-1', room_id: 'room-1',
      description: 'Extra towel', quantity: 2,
      unit_price: 5, service_type: 'housekeeping',
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty description', () => {
    const r = roomServiceSchema.safeParse({
      booking_id: 'booking-1', room_id: 'room-1',
      description: '', quantity: 1, unit_price: 10,
      service_type: 'room_service',
    });
    expect(r.success).toBe(false);
  });

  it('rejects zero quantity', () => {
    const r = roomServiceSchema.safeParse({
      booking_id: 'booking-1', room_id: 'room-1',
      description: 'Water', quantity: 0, unit_price: 2,
      service_type: 'minibar',
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid service type', () => {
    const r = roomServiceSchema.safeParse({
      booking_id: 'booking-1', room_id: 'room-1',
      description: 'Food', quantity: 1, unit_price: 15,
      service_type: 'laundry',
    });
    expect(r.success).toBe(false);
  });
});

describe('roomSchema', () => {
  it('accepts valid room', () => {
    const r = roomSchema.safeParse({ room_number: '101', room_type_id: 'type-1' });
    expect(r.success).toBe(true);
  });

  it('rejects empty room number', () => {
    const r = roomSchema.safeParse({ room_number: '', room_type_id: 'type-1' });
    expect(r.success).toBe(false);
  });

  it('rejects empty room type', () => {
    const r = roomSchema.safeParse({ room_number: '102', room_type_id: '' });
    expect(r.success).toBe(false);
  });
});

describe('tableSchema', () => {
  it('accepts valid table', () => {
    const r = tableSchema.safeParse({ table_number: 'T1', capacity: 4 });
    expect(r.success).toBe(true);
  });

  it('rejects empty table number', () => {
    const r = tableSchema.safeParse({ table_number: '', capacity: 2 });
    expect(r.success).toBe(false);
  });

  it('rejects zero capacity', () => {
    const r = tableSchema.safeParse({ table_number: 'T5', capacity: 0 });
    expect(r.success).toBe(false);
  });

  it('accepts optional section and notes', () => {
    const r = tableSchema.safeParse({
      table_number: 'T3', capacity: 6, section: 'Patio', notes: 'Near window',
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid QR code URL', () => {
    const r = tableSchema.safeParse({
      table_number: 'T1', capacity: 2, qr_code_url: 'not-a-url',
    });
    expect(r.success).toBe(false);
  });
});

describe('invoiceVoidSchema', () => {
  it('accepts valid void reason', () => {
    const r = invoiceVoidSchema.safeParse({ reason: 'Customer cancelled' });
    expect(r.success).toBe(true);
  });

  it('rejects empty reason', () => {
    const r = invoiceVoidSchema.safeParse({ reason: '' });
    expect(r.success).toBe(false);
  });
});

describe('createOrderSchemaFull', () => {
  it('accepts order with discount', () => {
    const r = createOrderSchemaFull.safeParse({
      table_id: 'table-1',
      items: [{ menu_item_id: 'item-1', quantity: 2 }],
      discount: 50,
    });
    expect(r.success).toBe(true);
  });

  it('defaults discount to 0', () => {
    const r = createOrderSchemaFull.safeParse({
      table_id: 'table-1',
      items: [{ menu_item_id: 'item-1', quantity: 1 }],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.discount).toBe(0);
  });

  it('rejects negative discount', () => {
    const r = createOrderSchemaFull.safeParse({
      table_id: 'table-1',
      items: [{ menu_item_id: 'item-1', quantity: 1 }],
      discount: -10,
    });
    expect(r.success).toBe(false);
  });
});
