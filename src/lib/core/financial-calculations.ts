export interface FinancialBreakdown {
  subtotal: number;
  itemDiscountTotal: number;
  orderDiscountAmount: number;
  totalDiscount: number;
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
  serviceChargeRate: number;
  serviceChargeAmount: number;
  grandTotal: number;
}

export interface CartLineItem {
  quantity: number;
  unit_price: number;
  discount_percentage?: number;
  discount_fixed?: number;
}

export interface OrderDiscountInput {
  type: 'percentage' | 'fixed';
  value: number;
  subtotal: number;
}

export function calculateItemDiscount(
  unitPrice: number,
  quantity: number,
  discountType: 'percentage' | 'fixed' | null,
  discountValue: number
): { discountAmount: number; finalUnitPrice: number; lineTotal: number } {
  const lineSubtotal = unitPrice * quantity;
  let discountAmount = 0;

  if (discountType === 'percentage') {
    const pct = Math.min(Math.max(discountValue, 0), 100);
    discountAmount = (lineSubtotal * pct) / 100;
  } else if (discountType === 'fixed') {
    discountAmount = Math.min(Math.max(discountValue, 0) * quantity, lineSubtotal);
  }

  const finalUnitPrice = unitPrice - (quantity > 0 ? discountAmount / quantity : 0);
  return { discountAmount, finalUnitPrice: Math.max(finalUnitPrice, 0), lineTotal: lineSubtotal - discountAmount };
}

export function calculateOrderDiscount(
  subtotal: number,
  discountType: 'percentage' | 'fixed' | null,
  discountValue: number
): number {
  if (discountType === 'percentage') {
    const pct = Math.min(Math.max(discountValue, 0), 100);
    return (subtotal * pct) / 100;
  }
  if (discountType === 'fixed') {
    return Math.min(Math.max(discountValue, 0), subtotal);
  }
  return 0;
}

export function calculateTax(subtotal: number, taxRate: number): number {
  if (taxRate <= 0) return 0;
  return (subtotal * Math.min(Math.max(taxRate, 0), 100)) / 100;
}

export function calculateServiceCharge(subtotal: number, serviceChargeRate: number): number {
  if (serviceChargeRate <= 0) return 0;
  return (subtotal * Math.min(Math.max(serviceChargeRate, 0), 100)) / 100;
}

export function calculateFinancialBreakdown(
  cartItems: CartLineItem[],
  orderDiscountInput?: OrderDiscountInput
): FinancialBreakdown {
  let subtotal = 0;
  let itemDiscountTotal = 0;

  for (const item of cartItems) {
    const lineSubtotal = item.unit_price * item.quantity;
    subtotal += lineSubtotal;

    if (item.discount_percentage) {
      const pct = Math.min(Math.max(item.discount_percentage, 0), 100);
      itemDiscountTotal += (lineSubtotal * pct) / 100;
    } else if (item.discount_fixed) {
      const fixedTotal = Math.min(Math.max(item.discount_fixed, 0) * item.quantity, lineSubtotal);
      itemDiscountTotal += fixedTotal;
    }
  }

  const orderDiscountAmount = orderDiscountInput
    ? calculateOrderDiscount(subtotal, orderDiscountInput.type, orderDiscountInput.value)
    : 0;

  const totalDiscount = itemDiscountTotal + orderDiscountAmount;
  const afterItemDiscount = subtotal - itemDiscountTotal;
  const afterAllDiscount = afterItemDiscount - orderDiscountAmount;
  const taxableAmount = Math.max(afterAllDiscount, 0);

  const taxRate = 0;
  const taxAmount = 0;
  const serviceChargeRate = 0;
  const serviceChargeAmount = 0;

  const grandTotal = Math.max(taxableAmount + taxAmount + serviceChargeAmount, 0);

  return {
    subtotal,
    itemDiscountTotal,
    orderDiscountAmount,
    totalDiscount,
    taxableAmount,
    taxRate,
    taxAmount,
    serviceChargeRate,
    serviceChargeAmount,
    grandTotal,
  };
}

export function isPaymentSufficient(amountReceived: number, grandTotal: number): boolean {
  return amountReceived >= grandTotal;
}

export function calculateChange(amountReceived: number, grandTotal: number): number {
  return Math.max(0, amountReceived - grandTotal);
}

export function calculateRemainingDue(amountReceived: number, grandTotal: number): number {
  return Math.max(0, grandTotal - amountReceived);
}
