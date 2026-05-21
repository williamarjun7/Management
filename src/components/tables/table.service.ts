import { insforge } from '../../lib/core/insforge';
import type { RestaurantTable } from '../../types';

const TABLE = 'restaurant_tables' as const;

export async function fetchTables(): Promise<RestaurantTable[]> {
  const { data, error } = await insforge.database
    .from(TABLE)
    .select('*')
    .order('table_number', { ascending: true });
  if (error) throw error;
  return (data ?? []) as RestaurantTable[];
}

export async function fetchTable(id: string): Promise<RestaurantTable> {
  const { data, error } = await insforge.database
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as RestaurantTable;
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

export async function createTable(data: { table_number: string; capacity: number; section?: string }): Promise<RestaurantTable> {
  const { data: result, error } = await insforge.database
    .from(TABLE)
    .insert([{ ...data, status: 'available', is_active: true }])
    .select()
    .single();
  if (error) throw error;
  return result as RestaurantTable;
}
