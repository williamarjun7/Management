import { insforge } from '../core/insforge';
import { logger } from './logger';
import { getCorrelationId } from './telemetry';

const AUDIT_ENABLED = true;

export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AuditEntryInput {
  action: string;
  entity_type: string;
  entity_id: string;
  previous_state?: Record<string, unknown> | null;
  new_state?: Record<string, unknown> | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  event_type?: string | null;
  severity?: AuditSeverity;
  workflow_id?: string | null;
  workflow_step?: string | null;
  trace_id?: string | null;
  actor_role?: string | null;
}

function getCurrentUserId(): string | null {
  try {
    const raw = localStorage.getItem('insforge-auth-token');
    if (!raw) return null;
    const payload = JSON.parse(atob(raw.split('.')[1]));
    return payload.sub || null;
  } catch {
    return null;
  }
}

export function generateDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const allKeys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  for (const key of allKeys) {
    const prevVal = before?.[key];
    const newVal = after?.[key];
    if (JSON.stringify(prevVal) !== JSON.stringify(newVal)) {
      diff[key] = { from: prevVal, to: newVal };
    }
  }
  return diff;
}

export function captureSnapshot<T extends Record<string, unknown>>(entity: T): T {
  return { ...entity };
}

export async function writeAuditLog(entry: AuditEntryInput): Promise<void> {
  if (!AUDIT_ENABLED) return;

  const userId = getCurrentUserId();
  if (!userId) {
    logger.warn('audit_skipped_no_user', 'audit', {
      metadata: { action: entry.action, entity_type: entry.entity_type },
    });
    return;
  }

  const correlationId = entry.trace_id || getCorrelationId();

  try {
    const { error } = await insforge.database.rpc('write_frontend_audit', {
      p_user_id: userId,
      p_action: entry.action,
      p_entity_type: entry.entity_type,
      p_entity_id: entry.entity_id,
      p_previous_state: entry.previous_state ?? null,
      p_new_state: entry.new_state ?? null,
      p_reason: entry.reason ?? null,
      p_event_type: entry.event_type ?? null,
      p_metadata: {
        ...(entry.metadata ?? {}),
        ...(entry.severity ? { severity: entry.severity } : {}),
        ...(entry.workflow_id ? { workflow_id: entry.workflow_id } : {}),
        ...(entry.workflow_step ? { workflow_step: entry.workflow_step } : {}),
        ...(entry.actor_role ? { actor_role: entry.actor_role } : {}),
        trace_id: correlationId,
      },
    });

    if (error) {
      logger.error('audit_write_failed', 'audit', {
        metadata: { action: entry.action, entity_type: entry.entity_type, error: (error as Error)?.message },
        operation: 'write_frontend_audit',
      });
    }
  } catch (err) {
    logger.error('audit_write_caught', 'audit', {
      metadata: { action: entry.action, entity_type: entry.entity_type, error: (err as Error)?.message },
      operation: 'write_frontend_audit',
    });
  }
}

export function createAuditEntry(
  action: string,
  entityType: string,
  entityId: string,
  extra?: Partial<AuditEntryInput>,
): AuditEntryInput {
  return {
    action,
    entity_type: entityType,
    entity_id: entityId,
    previous_state: extra?.previous_state ?? null,
    new_state: extra?.new_state ?? null,
    reason: extra?.reason ?? null,
    metadata: extra?.metadata ?? null,
    event_type: extra?.event_type ?? null,
    severity: extra?.severity,
    workflow_id: extra?.workflow_id ?? null,
    workflow_step: extra?.workflow_step ?? null,
    trace_id: extra?.trace_id ?? null,
    actor_role: extra?.actor_role ?? null,
  };
}

export const AuditActions = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  STATUS_CHANGE: 'STATUS_CHANGE',
  PAYMENT: 'PAYMENT',
  REFUND: 'REFUND',
  BOOKING: 'BOOKING',
  CHECK_IN: 'CHECK_IN',
  CHECK_OUT: 'CHECK_OUT',
  IMAGE_UPLOAD: 'IMAGE_UPLOAD',
  IMAGE_UPDATE: 'IMAGE_UPDATE',
  IMAGE_DELETE: 'IMAGE_DELETE',
  STOCK_MOVEMENT: 'STOCK_MOVEMENT',
  ROLE_CHANGE: 'ROLE_CHANGE',
  CONFIG_UPDATE: 'CONFIG_UPDATE',
  TABLE_STATUS_CHANGE: 'TABLE_STATUS_CHANGE',
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_CONFIRMED: 'ORDER_CONFIRMED',
  ORDER_STATUS_CHANGE: 'ORDER_STATUS_CHANGE',
  // New actions
  ROOM_STATE_TRANSITION: 'ROOM_STATE_TRANSITION',
  SPLIT_BILL: 'SPLIT_BILL',
  PARTIAL_PAYMENT: 'PARTIAL_PAYMENT',
  REFUND_PROCESSED: 'REFUND_PROCESSED',
  DISCOUNT_APPLIED: 'DISCOUNT_APPLIED',
  MERGE_ORDER: 'MERGE_ORDER',
  SPLIT_ORDER: 'SPLIT_ORDER',
  SPLIT_CREATED: 'SPLIT_CREATED',
  SPLIT_PAID: 'SPLIT_PAID',
  SPLIT_REFUNDED: 'SPLIT_REFUNDED',
  BILL_FINALIZED: 'BILL_FINALIZED',
  BILL_REPRINTED: 'BILL_REPRINTED',
  QUEUE_RECOVERY: 'QUEUE_RECOVERY',
  RELEASE_CHANNEL_CHANGE: 'RELEASE_CHANNEL_CHANGE',
  FEATURE_FLAG_CHANGE: 'FEATURE_FLAG_CHANGE',
  FAILED_AUTH: 'FAILED_AUTH',
  FAILED_PERMISSION: 'FAILED_PERMISSION',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SECURITY_VIOLATION: 'SECURITY_VIOLATION',
  DATA_EXPORT: 'DATA_EXPORT',
  SETTING_CHANGE: 'SETTING_CHANGE',
  SYSTEM_CONFIG: 'SYSTEM_CONFIG',
};

export const AuditEntityTypes = {
  USER: 'user',
  USER_PROFILE: 'user_profile',
  MENU_CATEGORY: 'menu_category',
  MENU_ITEM: 'menu_item',
  PRODUCT: 'product',
  ORDER: 'order',
  ORDER_ITEM: 'order_item',
  INVOICE: 'invoice',
  PAYMENT: 'payment',
  BOOKING: 'booking',
  ROOM: 'room',
  ROOM_TYPE: 'room_type',
  ROOM_SERVICE: 'room_service',
  TABLE: 'table',
  TABLE_SESSION: 'table_session',
  INVENTORY: 'inventory',
  STOCK_MOVEMENT: 'stock_movement',
  SETTING: 'setting',
  ROLE: 'role',
  WORKFLOW: 'workflow',
  // New entity types
  PAYMENT_INTENT: 'payment_intent',
  INVENTORY_HOLD: 'inventory_hold',
  SYSTEM_EVENT: 'system_event',
  AUDIT_LOG: 'audit_log',
  RELEASE_CHANNEL: 'release_channel',
  FEATURE_FLAG: 'feature_flag',
  QUEUE_ITEM: 'queue_item',
  BILL_SPLIT: 'bill_split',
  SPLIT_PAYMENT: 'split_payment',
  DEAD_LETTER: 'dead_letter',
  SESSION: 'session',
  NOTIFICATION: 'notification',
  REPORT: 'report',
  EXPORT: 'export',
};

export const AuditEventTypes: Record<string, string | null> = {
  [AuditActions.ORDER_CREATED]: 'ORDER_CREATED',
  [AuditActions.ORDER_CONFIRMED]: 'ORDER_CONFIRMED',
  [AuditActions.ORDER_STATUS_CHANGE]: 'ORDER_STATUS_CHANGED',
  [AuditActions.PAYMENT]: 'PAYMENT_RECEIVED',
  [AuditActions.REFUND]: 'PAYMENT_REVERSED',
  [AuditActions.BOOKING]: 'BOOKING_CREATED',
  [AuditActions.CHECK_IN]: 'ROOM_CHECKED_IN',
  [AuditActions.CHECK_OUT]: 'ROOM_CHECKED_OUT',
  [AuditActions.STOCK_MOVEMENT]: 'STOCK_MOVEMENT',
  [AuditActions.ROOM_STATE_TRANSITION]: 'ROOM_STATUS_CHANGED',
  [AuditActions.SPLIT_BILL]: 'BILL_GENERATED',
  [AuditActions.SPLIT_CREATED]: 'SPLIT_CREATED',
  [AuditActions.SPLIT_PAID]: 'SPLIT_PAID',
  [AuditActions.SPLIT_REFUNDED]: 'SPLIT_REFUNDED',
  [AuditActions.BILL_FINALIZED]: 'BILL_FINALIZED',
  [AuditActions.BILL_REPRINTED]: 'BILL_REPRINTED',
  [AuditActions.MERGE_ORDER]: 'ORDER_STATUS_CHANGED',
  [AuditActions.SPLIT_ORDER]: 'ORDER_STATUS_CHANGED',
};
