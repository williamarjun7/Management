import { insforge } from '../core/insforge';
import type { TableStatus } from '../../types';

export async function refreshTableStatus(tableId: string): Promise<void> {
  if (!tableId) return;

  const { data: activeOrders, error } = await insforge.database
    .from('orders')
    .select('id')
    .eq('table_id', tableId)
    .not('status', 'in', '("cancelled","refunded")');

  if (error) throw error;

  const newStatus: TableStatus = activeOrders && activeOrders.length > 0 ? 'occupied' : 'available';

  const { error: updateError } = await insforge.database
    .from('restaurant_tables')
    .update({ status: newStatus })
    .eq('id', tableId);
  if (updateError) throw updateError;

  try {
    await insforge.database.rpc('create_system_event', {
      p_event_type: 'TABLE_STATUS_CHANGED',
      p_entity_type: 'table',
      p_entity_id: tableId,
      p_payload: JSON.stringify({ status: newStatus }),
    });
  } catch {
    // non-blocking notification
  }
}

export async function syncAllTables(): Promise<void> {
  const [activeResult, tablesResult] = await Promise.all([
    insforge.database
      .from('orders')
      .select('table_id')
      .not('status', 'in', '("cancelled","refunded")'),
    insforge.database
      .from('restaurant_tables')
      .select('id, status'),
  ]);

  const activeTableIds = new Set((activeResult.data ?? []).map(o => o.table_id));
  const tables = tablesResult.data;
  if (!tables) return;

  await Promise.allSettled(
    tables.map(async (table) => {
      const shouldBeOccupied = activeTableIds.has(table.id);
      if (shouldBeOccupied && table.status === 'occupied') return;
      if (!shouldBeOccupied && table.status === 'available') return;

      const newStatus: TableStatus = shouldBeOccupied ? 'occupied' : 'available';
      await insforge.database
        .from('restaurant_tables')
        .update({ status: newStatus })
        .eq('id', table.id);
    })
  );
}
