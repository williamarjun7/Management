import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import OrderCard from "../../components/OrderCard";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { showSuccess, showError } from "../../components/ui/toast";
import { useOrders, useConfirmOrder, useTransitionOrderStatus } from "../../lib/hooks";
import { useAuth } from "../../lib/core/auth-context";
import { ORDER_STATUS_LABELS } from "../../types";
import type { Order } from "../../types";

const TABS = ["pending", "confirmed", "preparing", "ready", "served", "completed", "cancelled"];

export default function OrdersPage() {
  const [activeTab, setActiveTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: orders, isLoading } = useOrders(activeTab);
  const confirmOrder = useConfirmOrder();
  const transitionStatus = useTransitionOrderStatus();
  const idempotencyKeys = useRef<Map<string, string>>(new Map());

  function getIdempotencyKey(prefix: string, orderId: string, action: string): string {
    const key = `${prefix}:${orderId}:${action}`;
    if (!idempotencyKeys.current.has(key)) {
      idempotencyKeys.current.set(key, crypto.randomUUID());
    }
    return idempotencyKeys.current.get(key)!;
  }

  const filtered = (orders ?? []).filter((o) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      o.order_number.toLowerCase().includes(q) ||
      (o.restaurant_tables?.table_number ?? "").toString().includes(q)
    );
  });

  const handleStatusChange = useCallback((orderId: string, status: string) => {
    if (!user) return;
    if (status === "cancelled") {
      const order = orders?.find((o: Order) => o.id === orderId);
      if (order) setCancelTarget(order);
      return;
    }

    if (status === "confirmed") {
      confirmOrder.mutate({
        p_order_id: orderId,
        p_user_id: user.id,
        p_idempotency_key: getIdempotencyKey('order', orderId, 'confirmed'),
      }, {
        onSuccess: () => showSuccess(`Order #${orderId.slice(0, 8)} confirmed`),
        onError: (err) => showError(err?.message || "Failed to confirm order"),
      });
    } else {
      transitionStatus.mutate({
        p_order_id: orderId,
        p_new_status: status,
        p_user_id: user.id,
        p_idempotency_key: getIdempotencyKey('order', orderId, status),
      }, {
        onSuccess: () => showSuccess(`Order marked as ${status}`),
        onError: (err) => showError(err?.message || "Failed to update order status"),
      });
    }
  }, [user, confirmOrder, transitionStatus, orders]);

  const handleCancelConfirm = useCallback(() => {
    if (!cancelTarget || !user) return;
    transitionStatus.mutate({
      p_order_id: cancelTarget.id,
      p_new_status: "cancelled",
      p_user_id: user.id,
      p_idempotency_key: getIdempotencyKey('order', cancelTarget.id, 'cancelled'),
    }, {
      onSuccess: () => {
        showSuccess(`Order #${cancelTarget.order_number} cancelled`);
        setCancelTarget(null);
      },
      onError: (err) => showError(err?.message || "Failed to cancel order"),
    });
  }, [cancelTarget, user, transitionStatus]);

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Orders</h1>
        <Button onClick={() => navigate("/orders/new")}>+ New Order</Button>
      </div>

      <div className="mb-4">
        <Input
          placeholder="Search by order number or table…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((status) => (
          <button
            key={status}
            onClick={() => setActiveTab(status)}
            className={`min-h-[44px] whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors ${
              activeTab === status
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {ORDER_STATUS_LABELS[status] ?? status}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {search ? "No orders match your search." : "No orders in this status."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((order: Order) => (
            <OrderCard
              key={order.id}
              order={order}
              onStatusChange={handleStatusChange}
              userRole={user?.role}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => { if (!open) setCancelTarget(null); }}
        title="Cancel Order"
        description="This will mark the order as cancelled. Any inventory reservations will be released."
        consequence="Ordered items will not be prepared. If already in preparation, notify kitchen staff."
        entity={`Order #${cancelTarget?.order_number ?? ""}`}
        confirmLabel="Yes, Cancel Order"
        onConfirm={handleCancelConfirm}
        isPending={transitionStatus.isPending}
      />
    </div>
  );
}
