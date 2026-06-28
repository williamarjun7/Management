import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, ClipboardList } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import OrderCard from "../../components/OrderCard";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { showSuccess, showError } from "../../components/ui/toast";
import { useOrders, useTransitionOrderStatus } from "../../lib/hooks";
import { useAuth } from "../../lib/core/auth-context";
import { refreshTableStatus } from "../../lib/services/table-occupancy";
import { ORDER_STATUS_LABELS } from "../../types";
import type { Order } from "../../types";

const TABS = ["active", "completed", "cancelled"];

export default function OrdersPage() {
  const [activeTab, setActiveTab] = useState("active");
  const [search, setSearch] = useState("");
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: orders, isLoading, error, refetch } = useOrders(activeTab);
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

    transitionStatus.mutate({
      p_order_id: orderId,
      p_new_status: status,
      p_user_id: user.id,
      p_idempotency_key: getIdempotencyKey('order', orderId, status),
    }, {
      onSuccess: () => showSuccess(`Order marked as ${status}`),
      onError: (err) => showError(err?.message || "Failed to update order status"),
    });
  }, [user, transitionStatus, orders]);

  const handleCancelConfirm = useCallback(() => {
    if (!cancelTarget || !user) return;
    transitionStatus.mutate({
      p_order_id: cancelTarget.id,
      p_new_status: "cancelled",
      p_user_id: user.id,
      p_idempotency_key: getIdempotencyKey('order', cancelTarget.id, 'cancelled'),
    }, {
      onSuccess: async () => {
        showSuccess(`Order #${cancelTarget.order_number} cancelled`);
        if (cancelTarget.table_id) {
          await refreshTableStatus(cancelTarget.table_id).catch(() => {});
        }
        setCancelTarget(null);
      },
      onError: (err) => showError(err?.message || "Failed to cancel order"),
    });
  }, [cancelTarget, user, transitionStatus]);

  return (
    <div className="mx-auto w-full max-w-7xl flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Orders</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-2 rounded-md hover:bg-muted transition-colors" aria-label="Refresh data">
            <RefreshCw className="h-4 w-4" />
          </button>
          <Button onClick={() => navigate("/orders/new")}>+ New Order</Button>
        </div>
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

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load orders. Check connection.
        </div>
      ) : isLoading ? (
        <div className="grid gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="animate-pulse rounded-lg border bg-card p-4 space-y-3">
              <div className="h-4 bg-muted rounded w-1/3" />
              <div className="h-3 bg-muted rounded w-1/2" />
              <div className="h-3 bg-muted rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <ClipboardList className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-sm font-medium">
            {search ? "No orders match your search." : "No orders in this status."}
          </p>
          <p className="text-xs mt-1">Orders will appear here once placed.</p>
        </div>
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
