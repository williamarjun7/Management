import { insforge } from '../core/insforge';
import type { RoomMapping, SyncLog, SyncQueueItem, ExternalBooking, SyncPushResult, AvailabilityCheck, PropagationFields, ReconciliationIssue } from './booking-sync.types';

const SYNC_FUNCTION = 'website-sync';

export async function pushBookingToWebsite(params: {
  external_booking_id: string;
  website_room_id: string;
  guest_name: string;
  guest_phone?: string;
  guest_email?: string;
  check_in: string;
  check_out: string;
  adults?: number;
  children?: number;
  nightly_rate?: number;
  total_amount?: number;
  notes?: string;
  payment_status?: string;
  paid_amount?: number;
  advance_amount?: number;
  balance_amount?: number;
  idempotency_key: string;
  propagation?: PropagationFields;
}): Promise<SyncPushResult> {
  const { data, error } = await insforge.functions.invoke(SYNC_FUNCTION, {
    body: { action: 'push_booking', ...params },
  });
  if (error) throw error;
  return data as SyncPushResult;
}

export async function pushStatusUpdateToWebsite(params: {
  external_booking_id: string;
  event_type: string;
  idempotency_key: string;
  payment_status?: string;
  paid_amount?: number;
  advance_amount?: number;
  balance_amount?: number;
  propagation?: PropagationFields;
}): Promise<SyncPushResult> {
  const { data, error } = await insforge.functions.invoke(SYNC_FUNCTION, {
    body: { action: 'push_status_update', ...params },
  });
  if (error) throw error;
  return data as SyncPushResult;
}

export async function checkWebsiteAvailability(params: {
  pos_room_id: string;
  check_in: string;
  check_out: string;
}): Promise<AvailabilityCheck> {
  const { data, error } = await insforge.functions.invoke(SYNC_FUNCTION, {
    body: { action: 'check_availability', ...params },
  });
  if (error) throw error;
  return data as AvailabilityCheck;
}

export async function triggerRetryQueue(): Promise<SyncPushResult> {
  const { data, error } = await insforge.functions.invoke(SYNC_FUNCTION, {
    body: { action: 'retry_queue' },
  });
  if (error) throw error;
  return data as SyncPushResult;
}

// ── Room Mappings ──

export async function getRoomMappings(): Promise<RoomMapping[]> {
  const { data, error } = await insforge.database
    .from('room_mappings')
    .select('*, rooms!inner(room_number, room_types!inner(name))')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as RoomMapping[];
}

export async function createRoomMapping(params: {
  pos_room_id: string;
  website_room_id: string;
  website_room_name?: string;
}): Promise<RoomMapping> {
  const { data, error } = await insforge.database
    .from('room_mappings')
    .insert([params])
    .select('*')
    .single();
  if (error) throw error;
  return data as RoomMapping;
}

export async function deleteRoomMapping(id: string): Promise<void> {
  const { error } = await insforge.database
    .from('room_mappings')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Sync Logs ──

export async function getSyncLogs(limit = 100, status?: string): Promise<SyncLog[]> {
  let q = insforge.database
    .from('sync_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status && status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SyncLog[];
}

export async function getSyncLog(id: string): Promise<SyncLog | null> {
  const { data, error } = await insforge.database
    .from('sync_logs')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as SyncLog | null;
}

// ── Sync Queue ──

export async function getSyncQueue(limit = 50): Promise<SyncQueueItem[]> {
  const { data, error } = await insforge.database
    .from('sync_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SyncQueueItem[];
}

// ── External Bookings ──

export async function getExternalBookings(limit = 100): Promise<ExternalBooking[]> {
  const { data, error } = await insforge.database
    .from('external_bookings')
    .select('*, bookings!inner(booking_number, guest_name, status)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ExternalBooking[];
}

export async function getExternalBookingByPosId(posBookingId: string): Promise<ExternalBooking | null> {
  const { data, error } = await insforge.database
    .from('external_bookings')
    .select('*')
    .eq('pos_booking_id', posBookingId)
    .maybeSingle();
  if (error) throw error;
  return data as ExternalBooking | null;
}

// ── Reconciliation Engine ──

export async function getReconciliationIssues(params?: {
  severity?: string;
  unresolvedOnly?: boolean;
  limit?: number;
}): Promise<ReconciliationIssue[]> {
  const { data, error } = await insforge.database
    .rpc('get_reconciliation_issues', {
      p_severity: params?.severity || null,
      p_unresolved_only: params?.unresolvedOnly ?? true,
      p_limit: params?.limit || 100,
    });
  if (error) throw error;
  return (data ?? []) as ReconciliationIssue[];
}

export async function resolveReconciliationIssue(id: string, resolution?: string): Promise<void> {
  const { error } = await insforge.database
    .rpc('resolve_reconciliation_issue', {
      p_id: id,
      p_resolution: resolution || null,
    });
  if (error) throw error;
}

export async function triggerReconciliation(params?: {
  severity?: string;
  limit?: number;
}): Promise<SyncPushResult> {
  const { data, error } = await insforge.functions.invoke('reconciliation', {
    body: {
      severity: params?.severity || null,
      limit: params?.limit || 200,
    },
  });
  if (error) throw error;
  return data as SyncPushResult;
}
