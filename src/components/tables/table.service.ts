import { insforge } from '../../lib/core/insforge';
import type { RestaurantTable } from '../../types';

const TABLE = 'restaurant_tables' as const;

export async function fetchTables(options?: { all?: boolean }): Promise<RestaurantTable[]> {
  const query = insforge.database
    .from(TABLE)
    .select('*, dining_rooms(*)');
  if (!options?.all) {
    query.eq('is_active', true);
  }
  query.is('deleted_at', null);
  const { data, error } = await query.order('table_number', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as RestaurantTable[];
}

export async function fetchTable(id: string): Promise<RestaurantTable> {
  const { data, error } = await insforge.database
    .from(TABLE)
    .select('*, dining_rooms(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as unknown as RestaurantTable;
}

export async function updateTableStatus(id: string, status: string): Promise<void> {
  const { error } = await insforge.database
    .from(TABLE)
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

export async function updateTable(id: string, updates: Partial<RestaurantTable>): Promise<void> {
  const { error } = await insforge.database
    .from(TABLE)
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function createTable(data: { table_number: string; capacity: number; room_id?: string; section?: string; notes?: string }): Promise<RestaurantTable> {
  const { data: result, error } = await insforge.database
    .from(TABLE)
    .insert([{ ...data, status: 'available', is_active: true, display_order: 0 }])
    .select()
    .single();
  if (error) throw error;
  return result as unknown as RestaurantTable;
}

export async function toggleTableEnabled(id: string, is_active: boolean): Promise<void> {
  const { error } = await insforge.database
    .from(TABLE)
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function softDeleteTable(id: string): Promise<void> {
  const { error } = await insforge.database
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id);
  if (error) throw error;
}
