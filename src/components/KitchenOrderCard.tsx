import { useEffect, useState } from 'react';
import { Printer, Table2 } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/core/utils';
import type { Order } from '../types';

interface KitchenOrderCardProps {
  order: Order;
  onStatusChange: (orderId: string, status: string) => void;
  isUpdating: boolean;
}

function getElapsedMinutes(createdAt: string): number {
  return (Date.now() - new Date(createdAt).getTime()) / 60000;
}

function formatTime(minutes: number): string {
  const m = Math.floor(minutes);
  const s = Math.floor((minutes - m) * 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getCustomerLabel(order: Order): string {
  if (order.customer_name) return order.customer_name;
  if (order.restaurant_tables?.table_number) return `TABLE ${order.restaurant_tables.table_number}`;
  return 'TAKEAWAY';
}

export function KitchenOrderCard({
  order,
  onStatusChange,
  isUpdating,
}: KitchenOrderCardProps) {
  const [elapsed, setElapsed] = useState(() => getElapsedMinutes(order.created_at));

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(getElapsedMinutes(order.created_at));
    }, 1000);
    return () => clearInterval(timer);
  }, [order.created_at]);

  const isUrgent = elapsed > 15;
  const isWarning = elapsed > 10 && !isUrgent;
  const customerLabel = getCustomerLabel(order);

  const borderColorClass = isUrgent
    ? 'border-l-destructive'
    : isWarning
      ? 'border-l-amber-500'
      : 'border-l-primary';

  const timerColorClass = isUrgent
    ? 'text-destructive'
    : isWarning
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-primary';

  return (
    <article
      className={cn(
        'rounded-xl border-l-4 flex flex-col min-h-[480px] bg-card shadow-sm',
        borderColorClass,
        isUrgent && 'shadow-[0_0_20px_hsl(var(--destructive)/0.15)]',
      )}
    >
      <div className="p-4 border-b border-border flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {order.restaurant_tables?.table_number ? (
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-bold bg-primary/10 text-primary uppercase tracking-wider">
                <Table2 className="h-3 w-3" />
                Table {order.restaurant_tables.table_number}
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-muted text-muted-foreground uppercase tracking-wider">
                Takeaway
              </span>
            )}
            <span className="text-muted-foreground text-xs font-medium">#{order.order_number?.slice(-4) || order.id.slice(0, 4)}</span>
          </div>
          <h3 className="text-lg font-semibold text-foreground mt-1">{customerLabel}</h3>
        </div>
        <div className="flex flex-col items-end">
          <span className={cn('font-black text-2xl tabular-nums leading-none', timerColorClass)}>
            {formatTime(elapsed)}
          </span>
          <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-tighter mt-0.5">
            Minutes Elapsed
          </span>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-3 overflow-y-auto">
        {(order.order_items ?? []).map((item) => {
          const hasNotes = !!item.notes;
          const modifiers = item.modifiers ?? [];
          const modifierText = modifiers.map((m) => m.option || m.name).join(', ');
          const rightText = item.notes || modifierText || null;

          return (
            <div
              key={item.id}
              className={cn(
                'flex items-center justify-between',
                hasNotes && 'bg-muted/30 p-2 rounded border border-border',
              )}
            >
              <span className="text-lg font-semibold text-primary leading-tight">
                {item.quantity}x {item.item_name}
              </span>
              {rightText && (
                <span className={cn(
                  'text-sm ml-3 shrink-0',
                  hasNotes ? 'text-destructive font-medium' : 'text-muted-foreground',
                )}>
                  {rightText}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-4 bg-muted/30 rounded-b-xl flex gap-3">
        <Button
          onClick={() => onStatusChange(order.id, 'completed')}
          disabled={isUpdating}
          className="flex-1 py-3 h-auto text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 active:scale-95 transition-all rounded-lg"
        >
          COMPLETE
        </Button>
        <button
          onClick={() => window.print()}
          className="w-12 h-12 flex items-center justify-center rounded-lg border-2 border-border text-muted-foreground hover:bg-accent transition-colors shrink-0"
          title="Print order"
        >
          <Printer className="h-5 w-5" />
        </button>
      </div>
    </article>
  );
}
