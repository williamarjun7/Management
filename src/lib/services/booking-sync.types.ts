export type SyncDirection = 'incoming' | 'outgoing';
export type SyncEventType = 'booking.created' | 'booking.updated' | 'booking.cancelled' | 'booking.checked_in' | 'booking.checked_out';
export type SyncStatus = 'pending' | 'success' | 'failed' | 'skipped';
export type QueueStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface RoomMapping {
  id: string;
  pos_room_id: string;
  website_room_id: string;
  website_room_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncLog {
  id: string;
  direction: SyncDirection;
  event_type: SyncEventType;
  entity_type: string;
  entity_id: string | null;
  external_id: string | null;
  status: SyncStatus;
  request_body: Record<string, unknown> | null;
  response_body: Record<string, unknown> | null;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  last_synced_at: string;
  source: string;
  idempotency_key: string | null;
  created_at: string;
}

export interface SyncQueueItem {
  id: string;
  sync_log_id: string | null;
  direction: SyncDirection;
  event_type: SyncEventType;
  payload: Record<string, unknown>;
  retry_count: number;
  max_retries: number;
  next_retry_at: string;
  last_error: string | null;
  status: QueueStatus;
  created_at: string;
  updated_at: string;
}

export interface ExternalBooking {
  id: string;
  pos_booking_id: string;
  source: string;
  external_booking_id: string;
  last_sync_status: string | null;
  last_sync_at: string | null;
  sync_metadata: Record<string, unknown>;
  created_at: string;
}

export interface WebsiteBookingEvent {
  event_type: SyncEventType;
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
  idempotency_key: string;
  timestamp: string;
}

export interface SyncPushResult {
  success: boolean;
  sync_log_id?: string;
  error?: string;
}

export interface AvailabilityCheck {
  available: boolean;
  room_id?: string;
  conflicting_bookings?: Array<{
    id: string;
    guest_name: string;
    check_in: string;
    check_out: string;
  }>;
  reason?: string;
}
