import { insforge } from '../core/insforge';
import { logger } from './logger';
import type { TableStatus } from '../../types';

const VALID_TRANSITIONS: Record<TableStatus, TableStatus[]> = {
  available: ['reserved', 'occupied', 'ordering'],
  reserved: ['occupied', 'available'],
  occupied: ['ordering', 'billing', 'available'],
  ordering: ['preparing', 'billing', 'occupied'],
  preparing: ['ready', 'billing', 'occupied'],
  ready: ['dining', 'billing', 'occupied'],
  dining: ['billing', 'occupied'],
  billing: ['occupied', 'cleaning'],
  cleaning: ['available', 'occupied'],
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
  const { data: table, error } = await insforge.database
    .from('restaurant_tables')
    .select('status')
    .eq('id', tableId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error(`Table ${tableId} not found`);
    }
    throw error;
  }
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

export async function refreshFromOrders(tableId: string): Promise<TableStatus | null> {
  if (!tableId) return null;
  const { data: activeOrders, error } = await insforge.database
    .from('orders')
    .select('id')
    .eq('table_id', tableId)
    .not('status', 'in', '("cancelled","refunded","completed")');

  if (error) return null;

  const { data: activeSessions } = await insforge.database
    .from('table_sessions')
    .select('id')
    .eq('table_id', tableId)
    .eq('status', 'active')
    .limit(1);

  const hasActiveOrders = activeOrders && activeOrders.length > 0;
  const hasActiveSession = activeSessions && activeSessions.length > 0;
  const newStatus: TableStatus = hasActiveOrders || hasActiveSession ? 'occupied' : 'available';

  await writeStatus(tableId, newStatus);
  await emitEvent(tableId, newStatus);
  return newStatus;
}

export async function syncAllTables(): Promise<void> {
  const [activeResult, sessionsResult, tablesResult] = await Promise.all([
    insforge.database
      .from('orders')
      .select('table_id')
      .not('status', 'in', '("cancelled","refunded","completed")'),
    insforge.database
      .from('table_sessions')
      .select('table_id')
      .eq('status', 'active'),
    insforge.database
      .from('restaurant_tables')
      .select('id, status'),
  ]);

  const activeOrderTableIds = new Set((activeResult.data ?? []).map(o => o.table_id));
  const activeSessionTableIds = new Set((sessionsResult.data ?? []).map(s => s.table_id));
  const allActiveTableIds = new Set([...activeOrderTableIds, ...activeSessionTableIds]);

  const tables = tablesResult.data;
  if (!tables) return;

  await Promise.allSettled(
    tables.map(async (table) => {
      const shouldBeOccupied = allActiveTableIds.has(table.id);
      if (shouldBeOccupied && table.status === 'occupied') return;
      if (!shouldBeOccupied && table.status === 'available') return;
      const newStatus: TableStatus = shouldBeOccupied ? 'occupied' : 'available';
      await writeStatus(table.id, newStatus);
    })
  );
}
