import { useTables } from '../../lib/hooks';
import { TableCard } from './TableCard';

interface TableGridProps {
  onViewOrders: (tableId: string) => void;
  onOpenPos: (tableId: string) => void;
  onReset: (tableId: string) => void;
  onBill: (tableId: string) => void;
}

export function TableGrid({ onViewOrders, onOpenPos, onReset, onBill }: TableGridProps) {
  const { data: tables, isLoading } = useTables();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-sm text-muted-foreground animate-pulse">Loading tables...</p>
      </div>
    );
  }

  if (!tables || tables.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 rounded-xl border-2 border-dashed border-border">
        <p className="text-muted-foreground">No tables configured</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {tables.map((table) => (
        <TableCard
          key={table.id}
          table={table}
          onViewOrders={onViewOrders}
          onOpenPos={onOpenPos}
          onReset={onReset}
          onBill={onBill}
        />
      ))}
    </div>
  );
}
