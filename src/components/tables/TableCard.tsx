import type { RestaurantTable } from '../../types';
import { ShoppingCart, Eye, RotateCcw, CookingPot, Receipt, Sparkles } from 'lucide-react';

interface TableCardProps {
  table: RestaurantTable;
  onViewOrders: (tableId: string) => void;
  onOpenPos: (tableId: string) => void;
  onReset: (tableId: string) => void;
  onBill: (tableId: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; icon: React.ElementType }> = {
  available: { label: 'Available', dot: 'bg-emerald-500', icon: Sparkles },
  reserved: { label: 'Reserved', dot: 'bg-blue-500', icon: Sparkles },
  occupied: { label: 'Occupied', dot: 'bg-orange-500', icon: ShoppingCart },
  ordering: { label: 'Ordering', dot: 'bg-violet-500', icon: ShoppingCart },
  preparing: { label: 'Preparing', dot: 'bg-amber-500', icon: CookingPot },
  ready: { label: 'Ready', dot: 'bg-green-500', icon: CookingPot },
  dining: { label: 'Dining', dot: 'bg-teal-500', icon: Eye },
  billing: { label: 'Billing', dot: 'bg-red-500', icon: Receipt },
  cleaning: { label: 'Cleaning', dot: 'bg-slate-500', icon: RotateCcw },
};

export function TableCard({ table, onViewOrders, onOpenPos, onReset, onBill }: TableCardProps) {
  const cfg = STATUS_CONFIG[table.status] ?? STATUS_CONFIG.available;
  const Icon = cfg.icon;

  return (
    <div className="rounded-xl border-2 border-border bg-card overflow-hidden hover:border-primary/50 transition-colors">
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-bold">Table {table.table_number}</h3>
            <p className="text-xs text-muted-foreground">Capacity: {table.capacity}pax</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
            <span className="text-xs font-medium">{cfg.label}</span>
          </div>
        </div>

        <div className="flex items-center justify-center h-20 bg-muted/30 rounded-lg mb-2">
          <Icon className="h-8 w-8 text-muted-foreground/40" />
        </div>

        {table.section && (
          <p className="text-xs text-muted-foreground text-center">{table.section}</p>
        )}
      </div>

      <div className="grid grid-cols-4 border-t border-border divide-x divide-border">
        <button
          onClick={() => onViewOrders(table.id)}
          className="flex items-center justify-center gap-1 py-3 text-xs font-medium hover:bg-accent transition-colors"
          title="View Orders"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onOpenPos(table.id)}
          className="flex items-center justify-center gap-1 py-3 text-xs font-medium hover:bg-accent transition-colors text-primary"
          title="Open POS"
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          <span>POS</span>
        </button>
        <button
          onClick={() => onBill(table.id)}
          className="flex items-center justify-center gap-1 py-3 text-xs font-medium hover:bg-accent transition-colors"
          title="Billing"
        >
          <Receipt className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onReset(table.id)}
          className="flex items-center justify-center gap-1 py-3 text-xs font-medium hover:bg-accent transition-colors"
          title="Reset"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
