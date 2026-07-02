let _currencySymbol = 'Rs.';

export function setCurrencySymbol(sym: string) {
  _currencySymbol = sym;
}

export function formatCurrency(amount: number): string {
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${_currencySymbol} ${formatted}`;
}
