import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { BottomSheet } from "../../components/ui/bottom-sheet";
import { useMenuCategories, useMenuItems, useCreateOrder, useTables } from "../../lib/hooks";
import { formatCurrency } from "../../lib/core/format-currency";
import {
  Percent, Search, Plus, Minus, ShoppingCart, X, Table2, User,
  ChevronRight, UtensilsCrossed
} from "lucide-react";
import type { MenuItem } from "../../types";

interface LineItem {
  menu_item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  notes: string;
}

export default function CreateOrderPage() {
  const navigate = useNavigate();
  const { data: categories } = useMenuCategories();
  const { data: allItems } = useMenuItems();
  const { data: tables } = useTables();
  const createOrder = useCreateOrder();
  const npr = (amount: number) => formatCurrency(amount);

  const [selectedCat, setSelectedCat] = useState<string>("all");
  const [tableId, setTableId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [cart, setCart] = useState<LineItem[]>([]);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);

  const q = searchQuery.toLowerCase();
  const filteredByCategory =
    selectedCat === "all"
      ? (allItems ?? [])
      : (allItems ?? []).filter((i) => i.category_id === selectedCat);
  const filteredItems = q
    ? filteredByCategory.filter(
        (i) => i.name.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q)
      )
    : filteredByCategory;

  const availableItems = filteredItems.filter((i) => i.is_available);
  const cartItemIds = new Set(cart.map((c) => c.menu_item_id));
  const cartCountByItem = cart.reduce(
    (acc, c) => {
      acc[c.menu_item_id] = (acc[c.menu_item_id] ?? 0) + c.quantity;
      return acc;
    },
    {} as Record<string, number>
  );
  const totalCartItems = cart.reduce((s, l) => s + l.quantity, 0);

  const categoryCounts = (categories ?? []).reduce(
    (acc, cat) => {
      acc[cat.id] = (allItems ?? [])
        .filter((i) => i.category_id === cat.id && cartItemIds.has(i.id))
        .reduce((sum, i) => sum + (cartCountByItem[i.id] ?? 0), 0);
      return acc;
    },
    {} as Record<string, number>
  );

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((l) => l.menu_item_id === item.id);
      if (existing) {
        return prev.map((l) =>
          l.menu_item_id === item.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...prev,
        { menu_item_id: item.id, name: item.name, quantity: 1, unit_price: item.price, notes: "" },
      ];
    });
  }

  function updateQuantity(menuItemId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) =>
          l.menu_item_id === menuItemId
            ? { ...l, quantity: Math.max(0, l.quantity + delta) }
            : l
        )
        .filter((l) => l.quantity > 0)
    );
  }

  function updateNotes(menuItemId: string, notes: string) {
    setCart((prev) =>
      prev.map((l) =>
        l.menu_item_id === menuItemId ? { ...l, notes } : l
      )
    );
  }

  const subtotal = cart.reduce((s, l) => s + l.unit_price * l.quantity, 0);
  const discountAmount =
    discountType === "percentage"
      ? Math.min(subtotal * (Math.min(discountValue, 100) / 100), subtotal)
      : Math.min(discountValue, subtotal);
  const total = subtotal - discountAmount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tableId || cart.length === 0) return;

    await createOrder.mutateAsync({
      table_id: tableId,
      customer_name: customerName.trim() || undefined,
      discount: discountAmount,
      items: cart.map((l) => ({
        menu_item_id: l.menu_item_id,
        item_name: l.name,
        quantity: l.quantity,
        unit_price: l.unit_price,
        notes: l.notes || undefined,
      })),
    });

    navigate("/orders");
  }

  function CartContent({ close }: { close?: () => void }) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto space-y-2 px-1 py-1">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ShoppingCart className="h-10 w-10 mb-3 text-muted-foreground/30" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs mt-1">Tap items to add them</p>
            </div>
          ) : (
            cart.map((line) => (
              <div key={line.menu_item_id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                  {line.quantity}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{line.name}</span>
                    <span className="text-sm font-medium tabular-nums ml-2">{npr(line.unit_price * line.quantity)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <button
                      onClick={() => updateQuantity(line.menu_item_id, -1)}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-bold w-7 text-center tabular-nums">{line.quantity}</span>
                    <button
                      onClick={() => updateQuantity(line.menu_item_id, 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-background hover:bg-primary/90 transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <Input
                      placeholder="Notes"
                      value={line.notes}
                      onChange={(e) => updateNotes(line.menu_item_id, e.target.value)}
                      className="ml-auto h-8 w-24 text-xs"
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-border space-y-3 p-4 shrink-0">
            {/* Discount section */}
            <div className="rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setShowDiscount(!showDiscount)}
                className="flex items-center justify-between w-full px-3 py-2.5 text-xs font-medium hover:bg-muted/50 transition-colors"
              >
                <span>Discount</span>
                <div className="flex items-center gap-1.5">
                  {discountAmount > 0 && <span className="text-destructive">-{npr(discountAmount)}</span>}
                  <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showDiscount ? "rotate-90" : ""}`} />
                </div>
              </button>
              {showDiscount && (
                <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                  <div className="flex items-center gap-1 rounded-md bg-muted p-0.5 w-fit">
                    <button
                      onClick={() => { setDiscountType("percentage"); setDiscountValue(0); }}
                      className={`px-2.5 py-1 text-xs rounded ${discountType === "percentage" ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
                    >%</button>
                    <button
                      onClick={() => { setDiscountType("fixed"); setDiscountValue(0); }}
                      className={`px-2.5 py-1 text-xs rounded ${discountType === "fixed" ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
                    >Rs.</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      max={discountType === "percentage" ? 100 : subtotal}
                      value={discountValue || ""}
                      onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value)))}
                      placeholder={discountType === "percentage" ? "0%" : "0"}
                      className="h-8 text-xs"
                    />
                    {discountAmount > 0 && (
                      <button onClick={() => setDiscountValue(0)} className="text-xs text-destructive hover:underline shrink-0">Clear</button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-base font-bold">
              <span>Total</span>
              <span className="tabular-nums">{npr(total)}</span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-2">
              <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={createOrder.isPending || cart.length === 0 || !tableId}>
                {createOrder.isPending ? "Submitting\u2026" : `Place Order (${totalCartItems})`}
              </Button>
            </form>
          </div>
        )}
      </div>
    );
  }

  const selectedTableInfo = (tables ?? []).find((t) => t.id === tableId);

  return (
    <div className="flex flex-col h-dvh">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-border bg-card shrink-0">
        <button onClick={() => navigate("/orders")} className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          <span>Back</span>
        </button>
        <h1 className="text-base font-semibold">New Order</h1>
        <div className="w-12" />
      </div>

      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        {/* Menu Items Area */}
        <section className="flex-1 flex flex-col min-h-0">
          {/* Search */}
          <div className="px-4 py-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search items..."
                className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Table & Customer (desktop only) */}
          <div className="hidden lg:flex items-center gap-3 px-4 py-3 border-b border-border">
            <div className="flex-1">
              <Select
                value={tableId}
                onChange={(e) => setTableId(e.target.value)}
                options={(tables ?? []).map((t) => ({
                  value: t.id,
                  label: `Table ${t.table_number}${t.capacity ? ` (${t.capacity}pax)` : ""}`,
                }))}
                placeholder="Select a table"
              />
            </div>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name (optional)"
              className="max-w-52"
            />
          </div>

          {/* Category pills (horizontal scroll) */}
          <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto no-scrollbar border-b border-border shrink-0">
            <button
              onClick={() => setSelectedCat("all")}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                selectedCat === "all"
                  ? "bg-primary text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            {(categories ?? []).map((cat) => {
              const count = categoryCounts[cat.id] ?? 0;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCat(cat.id)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors relative ${
                    selectedCat === cat.id
                      ? "bg-primary text-background"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat.name}
                  {count > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-background/20 text-[10px] font-bold">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Items Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {availableItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <UtensilsCrossed className="h-10 w-10 mb-3 text-muted-foreground/30" />
                <p className="text-sm">No items found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {availableItems.map((item) => {
                  const inCart = cartItemIds.has(item.id);
                  const qty = cartCountByItem[item.id] ?? 0;
                  return (
                    <div
                      key={item.id}
                      onClick={() => { if (!inCart) addToCart(item); }}
                      className={`group relative rounded-xl border overflow-hidden text-left cursor-pointer transition-all active:scale-[0.98] ${
                        inCart ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/60 bg-card"
                      }`}
                    >
                      <div className={`h-16 lg:h-20 flex items-center justify-center bg-gradient-to-br ${inCart ? "from-primary/10 to-primary/5" : "from-muted to-muted/50"}`}>
                        {inCart ? (
                          <span className="text-2xl font-bold text-primary/30">{qty}</span>
                        ) : (
                          <UtensilsCrossed className="h-6 w-6 text-muted-foreground/30" />
                        )}
                      </div>
                      <div className="absolute top-1.5 right-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] font-semibold shadow-sm">
                        {npr(item.price)}
                      </div>
                      {inCart && (
                        <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 bg-primary text-background rounded-md px-1.5 py-0.5 text-xs font-bold shadow-sm">
                          <ShoppingCart className="h-3 w-3" />
                          {qty}
                        </div>
                      )}
                      <div className="p-2.5">
                        <h3 className="text-sm font-semibold truncate">{item.name}</h3>
                        {item.description && (
                          <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">{item.description}</p>
                        )}
                        {inCart && (
                          <div className="flex items-center gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => updateQuantity(item.id, -1)}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card hover:bg-muted transition-colors"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-7 text-center text-sm font-bold tabular-nums">{qty}</span>
                            <button
                              onClick={() => addToCart(item)}
                              className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-background hover:bg-primary/90 transition-colors"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Desktop Cart Sidebar (lg+) */}
        <aside className="hidden lg:flex w-96 bg-card border-l border-border flex-col shrink-0">
          <div className="p-5 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold">Order Summary</h2>
                {totalCartItems > 0 && (
                  <span className="flex items-center justify-center min-w-[22px] h-5 rounded-full bg-primary text-[11px] font-bold text-background px-1.5">
                    {totalCartItems}
                  </span>
                )}
              </div>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-xs text-destructive hover:underline">Clear All</button>
              )}
            </div>
            {selectedTableInfo && (
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm font-medium">
                <Table2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>Table {selectedTableInfo.table_number}</span>
              </div>
            )}
          </div>

          <CartContent />
        </aside>
      </div>

      {/* Mobile FAB + Cart */}
      <div className="lg:hidden">
        {mobileCartOpen && (
          <BottomSheet open={mobileCartOpen} onClose={() => setMobileCartOpen(false)} title="Order Summary">
            {/* Table & Customer inside bottom sheet */}
            <div className="space-y-3 mb-4 px-1">
              <div>
                <Label htmlFor="mob-table" className="text-xs">Table</Label>
                <Select
                  id="mob-table"
                  value={tableId}
                  onChange={(e) => setTableId(e.target.value)}
                  options={(tables ?? []).map((t) => ({
                    value: t.id,
                    label: `Table ${t.table_number}${t.capacity ? ` (${t.capacity}pax)` : ""}`,
                  }))}
                  placeholder="Select a table"
                />
              </div>
              <div>
                <Label htmlFor="mob-customer" className="text-xs">Customer (optional)</Label>
                <Input
                  id="mob-customer"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Walk-in"
                  className="h-10"
                />
              </div>
            </div>
            <CartContent close={() => setMobileCartOpen(false)} />
          </BottomSheet>
        )}

        {!mobileCartOpen && (
          <>
            {/* Mobile table selector bar */}
            <div className="px-4 py-2 border-t border-border bg-card">
              <Select
                value={tableId}
                onChange={(e) => setTableId(e.target.value)}
                options={(tables ?? []).map((t) => ({
                  value: t.id,
                  label: `Table ${t.table_number}${t.capacity ? ` (${t.capacity}pax)` : ""}`,
                }))}
                placeholder="Select a table"
              />
            </div>
            {/* FAB */}
            <button
              onClick={() => setMobileCartOpen(true)}
              className="fixed bottom-24 right-4 z-50 flex items-center gap-2 h-14 rounded-full bg-primary text-background shadow-lg hover:bg-primary/90 transition-all active:scale-95 px-5"
            >
              <ShoppingCart className="h-5 w-5" />
              {totalCartItems > 0 && (
                <>
                  <span className="text-sm font-bold">{npr(total)}</span>
                  <span className="flex items-center justify-center min-w-[22px] h-5 rounded-full bg-background text-primary text-[11px] font-bold px-1.5">
                    {totalCartItems}
                  </span>
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
