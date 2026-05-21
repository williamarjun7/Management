import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "./ui/card";
import { ORDER_STATUS_LABELS } from "../types";
import type { Order, OrderStatus } from "../types";

const statusBadgeVariant: Record<string, "default" | "secondary" | "warning" | "success" | "destructive"> = {
  pending: "warning",
  confirmed: "secondary",
  preparing: "default",
  ready: "success",
  served: "success",
  completed: "success",
  cancelled: "destructive",
  refunded: "destructive",
};

function timeElapsed(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  const remain = mins % 60;
  return `${hrs}h ${remain}m`;
}

const nextStatus: Record<string, OrderStatus | undefined> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "served",
  served: "completed",
};

interface Props {
  order: Order;
  onStatusChange?: (orderId: string, status: string) => void;
  onView?: (order: Order) => void;
  userRole?: string;
}

export default function OrderCard({ order, onStatusChange, onView, userRole }: Props) {
  const tableNumber = order.restaurant_tables?.table_number ?? "-";

  return (
    <Card className="min-h-[180px]">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">#{order.order_number}</span>
            <span className="text-xs text-muted-foreground">Table {tableNumber}</span>
          </div>
          {order.customer_name && (
            <p className="mt-0.5 text-xs text-muted-foreground">{order.customer_name}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={statusBadgeVariant[order.status] ?? "default"}>
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
          </Badge>
          <span className="text-xs text-muted-foreground">{timeElapsed(order.created_at)}</span>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <ul className="space-y-1">
          {(order.order_items ?? []).slice(0, 5).map((item) => (
            <li key={item.id} className="flex items-center justify-between text-sm">
              <span className="truncate">
                <span className="font-medium">{item.quantity}x</span>{" "}
                {item.item_name || "(unknown item)"}
              </span>
              <span className="ml-2 shrink-0 text-muted-foreground">
                Rs. {(item.unit_price * item.quantity).toFixed(2)}
              </span>
            </li>
          ))}
          {(order.order_items ?? []).length > 5 && (
            <li className="text-xs text-muted-foreground">
              +{(order.order_items ?? []).length - 5} more items
            </li>
          )}
        </ul>
      </CardContent>

      <CardFooter className="flex items-center justify-between border-t pt-3">
        <span className="text-sm font-semibold">
          Total: Rs. {(order.total ?? 0).toFixed(2)}
        </span>
        <div className="flex items-center gap-2">
          {onView && (
            <Button variant="ghost" size="sm" onClick={() => onView(order)}>
              View
            </Button>
          )}
          {onStatusChange && nextStatus[order.status] && (
            <Button
              size="sm"
              onClick={() => onStatusChange(order.id, nextStatus[order.status]!)}
            >
              Mark {ORDER_STATUS_LABELS[nextStatus[order.status]!]}
            </Button>
          )}
          {(order.status === "pending" || order.status === "confirmed") && onStatusChange && userRole !== 'staff' && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onStatusChange(order.id, "cancelled")}
            >
              Cancel
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
