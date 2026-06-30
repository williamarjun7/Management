import { insforge } from '../core/insforge';
import type { TableSession } from '../../types';

export async function openTableSession(
  tableId: string,
  staffId: string
): Promise<TableSession | null> {
  // Close any existing active session for this table
  await insforge.database
    .from('table_sessions')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('table_id', tableId)
    .eq('status', 'active');

  const { data, error } = await insforge.database
    .from('table_sessions')
    .insert([{
      table_id: tableId,
      staff_id: staffId,
      status: 'active',
    }])
    .select()
    .single();

  if (error) throw error;
  return data as TableSession;
}

export async function closeTableSession(sessionId: string): Promise<void> {
  const { error } = await insforge.database
    .from('table_sessions')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw error;
}

export async function getActiveTableSession(tableId: string): Promise<TableSession | null> {
  const { data, error } = await insforge.database
    .from('table_sessions')
    .select('*')
    .eq('table_id', tableId)
    .eq('status', 'active')
    .single();
  if (error && error.code === 'PGRST116') return null;
  if (error) throw error;
  return data as TableSession;
}

export async function getStaffActiveSessions(staffId: string): Promise<TableSession[]> {
  const { data, error } = await insforge.database
    .from('table_sessions')
    .select('*')
    .eq('staff_id', staffId)
    .eq('status', 'active')
    .order('started_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TableSession[];
}

export async function recordTransition(
  entityType: string,
  entityId: string,
  fromState: string | null,
  toState: string,
  triggeredBy: string | null,
  reason?: string
): Promise<void> {
  const { error } = await insforge.database
    .from('transition_history')
    .insert([{
      entity_type: entityType,
      entity_id: entityId,
      from_state: fromState,
      to_state: toState,
      triggered_by: triggeredBy,
      reason: reason || null,
    }]);
  if (error) throw error;
}

/** @deprecated Use the TableStatus type from types/index.ts instead. */
export const TABLE_STATES = [
  'available',
  'reserved',
  'occupied',
  'ordering',
  'preparing',
  'ready',
  'dining',
  'billing',
  'cleaning',
] as const;
