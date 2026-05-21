import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { TableGrid } from '../../components/tables/TableGrid';
import { updateTableStatus } from '../../components/tables/table.service';
import { showSuccess, showError } from '../../components/ui/toast';
import { LayoutGrid } from 'lucide-react';

export default function TableManagementPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleOpenPos = (tableId: string) => {
    navigate(`/pos?table=${tableId}`);
  };

  const handleViewOrders = (tableId: string) => {
    navigate(`/orders?table=${tableId}`);
  };

  const handleBill = (tableId: string) => {
    navigate(`/billing?table=${tableId}`);
  };

  const handleReset = async (tableId: string) => {
    try {
      await updateTableStatus(tableId, 'available');
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      showSuccess('Table reset to available');
    } catch {
      showError('Failed to reset table');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Table Management</h1>
          <p className="text-sm text-muted-foreground">Manage and monitor restaurant tables</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LayoutGrid className="h-4 w-4" />
          <span>All Tables</span>
        </div>
      </div>

      <TableGrid
        onViewOrders={handleViewOrders}
        onOpenPos={handleOpenPos}
        onReset={handleReset}
        onBill={handleBill}
      />
    </div>
  );
}
