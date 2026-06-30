import { insforge } from '../../lib/core/insforge';
import { setTableStatus } from '../../lib/services/table-state';
import type { RestaurantTable, TableStatus } from '../../types';


const TABLE = 'restaurant_tables' as const;

const VALID_TABLE_STATUSES: readonly TableStatus[] = ['available', 'reserved', 'occupied', 'ordering', 'preparing', 'ready', 'dining', 'billing', 'cleaning'];

export function validateTableStatus(status: string): asserts status is TableStatus {
  if (!VALID_TABLE_STATUSES.includes(status as TableStatus)) {
    throw new Error(`Invalid table status "${status}". Must be one of: ${VALID_TABLE_STATUSES.join(', ')}`);
  }
}

export function isValidTableStatus(status: string): status is TableStatus {
  return VALID_TABLE_STATUSES.includes(status as TableStatus);
}

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
  validateTableStatus(status);
  await setTableStatus(id, status as TableStatus);
}

export async function updateTable(id: string, updates: Partial<RestaurantTable>): Promise<void> {
  const { status, ...otherFields } = updates;

  if (status) {
    validateTableStatus(status);
    await setTableStatus(id, status as TableStatus);
  }

  if (Object.keys(otherFields).length > 0) {
    const { error } = await insforge.database
      .from(TABLE)
      .update(otherFields)
      .eq('id', id);
    if (error && error.code === '23505') {
      throw new Error(`Table number "${updates.table_number}" already exists. Please use a different number.`);
    }
    if (error) throw error;
  }
}

export async function createTable(data: { table_number: string; capacity: number; room_id?: string; section?: string; notes?: string }): Promise<RestaurantTable> {
  const { data: result, error } = await insforge.database
    .from(TABLE)
    .insert([{ ...data, status: 'available', is_active: true, display_order: 0 }])
    .select()
    .single();
  if (error && error.code === '23505') {
    throw new Error(`Table number "${data.table_number}" already exists. Please use a different number.`);
  }
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
