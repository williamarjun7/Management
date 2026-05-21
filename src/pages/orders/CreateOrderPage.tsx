import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { useMenuCategories, useMenuItems, useCreateOrder, useTables } from "../../lib/hooks";
import { formatCurrency } from "../../lib/core/format-currency";
import { Percent } from "lucide-react";
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
  const [orderNotes, setOrderNotes] = useState("");
  const [cart, setCart] = useState<LineItem[]>([]);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState(0);

  const filteredItems =
    selectedCat === "all"
      ? allItems ?? []
      : (allItems ?? []).filter((i) => i.category_id === selectedCat);

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
        {
          menu_item_id: item.id,
          name: item.name,
          quantity: 1,
          unit_price: item.price,
          notes: "",
        },
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
  const discountAmount = discountType === "percentage"
    ? Math.min(subtotal * (Math.min(discountValue, 100) / 100), subtotal)
    : Math.min(discountValue, subtotal);
  const total = subtotal - discountAmount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tableId || cart.length === 0) return;

    await createOrder.mutateAsync({
      table_id: tableId,
      customer_name: customerName.trim() || undefined,
      notes: orderNotes.trim() || undefined,
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

  return (
    <div className="flex h-full gap-6 p-6">
      {/* Menu Browser */}
      <div className="flex-1">
        <h1 className="mb-4 text-2xl font-bold">New Order</h1>

        <div className="mb-4 flex items-center gap-2">
          <Select
            value={selectedCat}
            onChange={(e) => setSelectedCat(e.target.value)}
            options={[
              { value: "all", label: "All Items" },
              ...(categories ?? []).map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems
            .filter((i) => i.is_available)
            .map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addToCart(item)}
                className="min-h-[44px] rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent"
              >
                <div className="text-sm font-medium">{item.name}</div>
                <div className="text-xs text-muted-foreground">
                   {npr(item.price)}
                </div>
              </button>
            ))}
        </div>
      </div>

      {/* Cart Sidebar */}
      <aside className="w-80 shrink-0">
        <Card>
          <CardHeader>
            <CardTitle>Order Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="order-table">Table</Label>
                <Select
                  id="order-table"
                  value={tableId}
                  onChange={(e) => setTableId(e.target.value)}
                  options={[
                    ...(tables ?? []).map((t) => ({
                      value: t.id,
                      label: `Table ${t.table_number}${t.capacity ? ` (${t.capacity}pax)` : ''}`,
                    })),
                  ]}
                  placeholder="Select a table"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="order-customer">Customer Name (optional)</Label>
                <Input
                  id="order-customer"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Walk-in"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="order-notes">Order Notes (optional)</Label>
                <Input
                  id="order-notes"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Any special instructions"
                />
              </div>

              {/* Cart Items */}
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {cart.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No items added yet.</p>
                ) : (
                  cart.map((line) => (
                    <div key={line.menu_item_id} className="rounded-md border p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{line.name}</span>
                        <span className="text-sm">
                           {npr(line.unit_price * line.quantity)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateQuantity(line.menu_item_id, -1)}
                          className="flex h-7 w-7 items-center justify-center rounded border text-sm"
                        >
                          –
                        </button>
                        <span className="w-6 text-center text-sm">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(line.menu_item_id, 1)}
                          className="flex h-7 w-7 items-center justify-center rounded border text-sm"
                        >
                          +
                        </button>
                        <Input
                          placeholder="Notes"
                          value={line.notes}
                          onChange={(e) => updateNotes(line.menu_item_id, e.target.value)}
                          className="ml-2 h-7 text-xs"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{npr(subtotal)}</span>
                </div>

                {cart.length > 0 && (
                  <div className="rounded-md border p-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">Discount</span>
                      <div className="flex items-center gap-1 rounded bg-muted p-0.5">
                        <button
                          type="button"
                          onClick={() => { setDiscountType("percentage"); setDiscountValue(0); }}
                          className={`flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded ${discountType === "percentage" ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
                        ><Percent className="h-3 w-3" /></button>
                        <button
                          type="button"
                          onClick={() => { setDiscountType("fixed"); setDiscountValue(0); }}
                          className={`flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded ${discountType === "fixed" ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
                        ><span className="text-xs">Rs.</span></button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max={discountType === "percentage" ? 100 : subtotal}
                        value={discountValue || ""}
                        onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value)))}
                        placeholder={discountType === "percentage" ? "0%" : "0"}
                        className="h-7 text-xs"
                      />
                      {discountAmount > 0 && (
                        <button
                          type="button"
                          onClick={() => setDiscountValue(0)}
                          className="text-xs text-destructive whitespace-nowrap hover:underline"
                        >Clear</button>
                      )}
                    </div>
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-xs text-destructive">
                        <span>Savings</span>
                        <span>- {npr(discountAmount)}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span>{npr(total)}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate("/orders")}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={createOrder.isPending || cart.length === 0 || !tableId}
                >
                  {createOrder.isPending ? "Submitting…" : "Place Order"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
