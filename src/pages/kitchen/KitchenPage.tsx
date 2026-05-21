import { useEffect, useCallback, useRef, useState } from 'react';
import { useKitchenOrders, useTransitionOrderStatus } from '../../lib/hooks';
import { useAuth } from '../../lib/core/auth-context';
import { KitchenOrderCard } from '../../components/KitchenOrderCard';
import { playKitchenAlert } from '../../lib/services/kitchen-sound';
import { subscribeKitchenOrders } from '../../lib/services/realtime';
import type { Order } from '../../types';
import { CookingPot, Clock, CheckCircle, List, ArrowUpDown } from 'lucide-react';

type KdsFilter = 'all' | 'confirmed' | 'preparing' | 'ready';

export default function KitchenPage() {
  const { data: orders, isLoading, error } = useKitchenOrders();
  const { mutate: transitionStatus, isPending: isUpdating } = useTransitionOrderStatus();
  const { user } = useAuth();
  const [filter, setFilter] = useState<KdsFilter>('all');
  const [sortByTable, setSortByTable] = useState(false);

  useEffect(() => {
    const unsub = subscribeKitchenOrders(() => {
      playKitchenAlert();
    });
    return unsub;
  }, []);

  const idempotencyKeys = useRef<Map<string, string>>(new Map());

  const handleStatusChange = useCallback((orderId: string, newStatus: string) => {
    if (!user) return;
    const key = `kitchen:${orderId}:${newStatus}`;
    if (!idempotencyKeys.current.has(key)) {
      idempotencyKeys.current.set(key, crypto.randomUUID());
    }
    transitionStatus({
      p_order_id: orderId,
      p_new_status: newStatus,
      p_user_id: user.id,
      p_idempotency_key: idempotencyKeys.current.get(key)!,
    });
  }, [user, transitionStatus]);

  const confirmedOrders = (orders ?? []).filter((o: Order) => o.status === 'confirmed');
  const preparingOrders = (orders ?? []).filter((o: Order) => o.status === 'preparing');

  let displayedOrders = filter === 'all' ? (orders ?? [])
    : filter === 'ready' ? (orders ?? []).filter((o: Order) => o.status === 'ready')
    : (orders ?? []).filter((o: Order) => o.status === filter);

  if (sortByTable) {
    displayedOrders = [...displayedOrders].sort((a, b) => {
      const ta = a.restaurant_tables?.table_number;
      const tb = b.restaurant_tables?.table_number;
      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return ta.localeCompare(tb, undefined, { numeric: true });
    });
  }

  const urgentOrders = (orders ?? []).filter((o: Order) => {
    const elapsed = Date.now() - new Date(o.created_at).getTime();
    return o.status !== 'ready' && elapsed > 15 * 60000;
  }).length;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-6">
      <header className="flex items-center justify-between px-6 h-14 border-b bg-card shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-bold tracking-widest">KITCHEN DISPLAY</h1>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded-full">
            <Clock className="h-3 w-3" />
            LIVE
          </span>
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">
          {new Date().toLocaleTimeString()}
        </span>
      </header>

      <div className="flex items-center justify-between px-6 py-3 border-b bg-card shrink-0">
        <div className="flex gap-2">
          {([{ key: 'all', label: 'All Orders', icon: List },
            { key: 'confirmed', label: `New (${confirmedOrders.length})`, icon: Clock },
            { key: 'preparing', label: `Preparing (${preparingOrders.length})`, icon: CookingPot },
            { key: 'ready', label: 'Ready', icon: CheckCircle },
          ] as const).map((t) => {
            const Icon = t.icon;
            const active = filter === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key as KdsFilter)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <button
            onClick={() => setSortByTable((s) => !s)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${sortByTable ? 'bg-primary/10 text-primary' : 'hover:bg-accent'}`}
          >
            <ArrowUpDown className="h-3 w-3" />
            Table
          </button>
          {urgentOrders > 0 && (
            <span className="text-destructive font-semibold">{urgentOrders} urgent</span>
          )}
          <span>{filter === 'all' ? (orders ?? []).length : displayedOrders.length} orders</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 mb-4 text-sm text-destructive">
            Failed to load orders. Check connection.
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-sm text-muted-foreground animate-pulse">Loading orders...</div>
          </div>
        ) : displayedOrders.length === 0 ? (
          <div className="flex items-center justify-center h-48 rounded-xl border-2 border-dashed border-border">
            <p className="text-lg text-muted-foreground/60">
              {filter === 'all' ? 'No orders in kitchen' : 'No orders in this status'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))' }}>
            {displayedOrders.map((order: Order) => (
              <KitchenOrderCard
                key={order.id}
                order={order}
                onStatusChange={handleStatusChange}
                isUpdating={isUpdating}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
