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
