import { insforge } from '../core/insforge';
import { logger } from './logger';
import type { TableStatus } from '../../types';

const VALID_TRANSITIONS: Record<TableStatus, TableStatus[]> = {
  available: ['occupied', 'reserved'],
  reserved: ['occupied', 'available'],
  occupied: ['ordering', 'billing', 'available'],
  ordering: ['billing', 'occupied'],
  billing: ['cleaning', 'available'],
  cleaning: ['available'],
  preparing: ['ready', 'occupied'],
  ready: ['dining', 'occupied'],
  dining: ['billing', 'occupied'],
};

export function isValidTransition(from: TableStatus, to: TableStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertValidTransition(from: TableStatus, to: TableStatus): void {
  if (!isValidTransition(from, to)) {
    throw new Error(`Invalid table status transition: "${from}" → "${to}"`);
  }
}

async function writeStatus(tableId: string, status: TableStatus): Promise<void> {
  const { error } = await insforge.database
    .from('restaurant_tables')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', tableId);
  if (error) throw error;
}

async function emitEvent(tableId: string, status: TableStatus): Promise<void> {
  try {
    await insforge.database.rpc('create_system_event', {
      p_event_type: 'TABLE_STATUS_CHANGED',
      p_entity_type: 'table',
      p_entity_id: tableId,
      p_payload: JSON.stringify({ status }),
    });
  } catch {
    logger.warn('create_system_event_failed', 'table-state', {
      metadata: { tableId, status },
      operation: 'emitStatusEvent',
    });
  }
}

export async function setTableStatus(tableId: string, status: TableStatus): Promise<void> {
  const { data: table } = await insforge.database
    .from('restaurant_tables')
    .select('status')
    .eq('id', tableId)
    .single();
  if (table) {
    assertValidTransition(table.status as TableStatus, status);
  }
  await writeStatus(tableId, status);
  await emitEvent(tableId, status);
}

export async function occupyTable(tableId: string): Promise<void> {
  if (!tableId) return;
  await setTableStatus(tableId, 'occupied');
}

export async function releaseTable(tableId: string): Promise<void> {
  await setTableStatus(tableId, 'available');
}

export async function refreshFromOrders(tableId: string): Promise<TableStatus | void> {
  if (!tableId) return;
  const { data: activeOrders } = await insforge.database
    .from('orders')
    .select('id')
    .eq('table_id', tableId)
    .not('status', 'in', '("cancelled","refunded","completed")');

  const newStatus: TableStatus = activeOrders && activeOrders.length > 0 ? 'occupied' : 'available';
  await writeStatus(tableId, newStatus);
  await emitEvent(tableId, newStatus);
  return newStatus;
}

export async function syncAllTables(): Promise<void> {
  const [activeResult, tablesResult] = await Promise.all([
    insforge.database
      .from('orders')
      .select('table_id')
      .not('status', 'in', '("cancelled","refunded","completed")'),
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
      await writeStatus(table.id, newStatus);
    })
  );
}
