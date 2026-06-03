import { insforge } from '../lib/core/insforge';

/**
 * RuFlo Workflow Definitions
 *
 * Order Workflow:     Order Created (Active) → Completed | Cancelled
 * Table Workflow:     Available → Occupied → Ordering → Billing → Cleaning → Available
 * Billing Workflow:   Generate Bill → Process Payment → Payment Completed → Close Session → Reset Table
 * Payment Workflow:   Initiated → QR Generated → Awaiting Payment → Paid | Failed | Expired
 */

type WorkflowHandler = (payload: Record<string, unknown>) => Promise<void>;

interface WorkflowDefinition {
  name: string;
  steps: string[];
  transitions: Record<string, string[]>;
  handlers: Record<string, WorkflowHandler>;
}

// ────────────────────────────────────────────
// ORDER WORKFLOW
// ────────────────────────────────────────────

const orderWorkflowSteps = [
  'order_created',
  'completed',
  'cancelled',
];

const orderTransitions: Record<string, string[]> = {
  order_created: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

async function notifyRealtime(entityType: string, entityId: string, event: string, payload: Record<string, unknown> = {}) {
  try {
    await insforge.database.rpc('create_system_event', {
      p_event_type: event,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_payload: JSON.stringify(payload),
    });
  } catch {
    // Non-critical — realtime notification best-effort
  }
}

const orderHandlers: Record<string, WorkflowHandler> = {
  order_created: async (payload) => {
    await insforge.database
      .from('workflow_state')
      .insert([{
        entity_type: 'order',
        entity_id: payload.order_id,
        current_step: 'order_created',
        status: 'active',
        context: payload,
      }]);
    await notifyRealtime('order', payload.order_id as string, 'ORDER_CREATED', payload);
  },
  completed: async (payload) => {
    await insforge.database
      .from('workflow_state')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('entity_type', 'order')
      .eq('entity_id', payload.order_id);
    await notifyRealtime('order', payload.order_id as string, 'ORDER_COMPLETED', payload);
  },
  cancelled: async (payload) => {
    await insforge.database
      .from('workflow_state')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('entity_type', 'order')
      .eq('entity_id', payload.order_id);
    await notifyRealtime('order', payload.order_id as string, 'ORDER_CANCELLED', payload);
  },
};

// ────────────────────────────────────────────
// TABLE WORKFLOW
// ────────────────────────────────────────────

const tableWorkflowSteps = [
  'available',
  'occupied',
  'ordering',
  'billing',
  'cleaning',
  'available_complete',
];

const tableTransitions: Record<string, string[]> = {
  available: ['occupied', 'reserved'],
  occupied: ['ordering'],
  ordering: ['billing', 'occupied'],
  billing: ['cleaning'],
  cleaning: ['available_complete'],
  reserved: ['occupied', 'available'],
  available_complete: [],
};

const tableHandlers: Record<string, WorkflowHandler> = {
  available: async (payload) => {
    await notifyRealtime('table', payload.table_id as string, 'TABLE_STATUS_CHANGED', { status: 'available' });
  },
  occupied: async (payload) => {
    await notifyRealtime('table', payload.table_id as string, 'TABLE_STATUS_CHANGED', { status: 'occupied' });
  },
  ordering: async (payload) => {
    await notifyRealtime('table', payload.table_id as string, 'TABLE_STATUS_CHANGED', { status: 'ordering' });
  },
  billing: async (payload) => {
    await notifyRealtime('table', payload.table_id as string, 'TABLE_STATUS_CHANGED', { status: 'billing' });
  },
  cleaning: async (payload) => {
    await notifyRealtime('table', payload.table_id as string, 'TABLE_STATUS_CHANGED', { status: 'cleaning' });
  },
  available_complete: async (payload) => {
    await insforge.database
      .from('restaurant_tables')
      .update({ status: 'available' })
      .eq('id', payload.table_id as string);
    await notifyRealtime('table', payload.table_id as string, 'TABLE_STATUS_CHANGED', { status: 'available' });
  },
};

// ────────────────────────────────────────────
// BILLING WORKFLOW
// ────────────────────────────────────────────

const billingWorkflowSteps = [
  'generate_bill',
  'process_payment',
  'payment_completed',
  'close_session',
  'reset_table',
];

const billingTransitions: Record<string, string[]> = {
  generate_bill: ['process_payment'],
  process_payment: ['payment_completed'],
  payment_completed: ['close_session'],
  close_session: ['reset_table'],
  reset_table: [],
};

const billingHandlers: Record<string, WorkflowHandler> = {
  generate_bill: async (payload) => {
    await notifyRealtime('billing', payload.invoice_id as string, 'BILL_GENERATED', payload);
  },
  process_payment: async (payload) => {
    await notifyRealtime('billing', payload.invoice_id as string, 'PAYMENT_PROCESSED', payload);
  },
  payment_completed: async (payload) => {
    // Update invoice and table status
    if (payload.table_id) {
      await insforge.database
        .from('restaurant_tables')
        .update({ status: 'cleaning' })
        .eq('id', payload.table_id as string);
    }
    await notifyRealtime('billing', payload.invoice_id as string, 'PAYMENT_COMPLETED', payload);
  },
  close_session: async (payload) => {
    if (payload.table_session_id) {
      await insforge.database
        .from('table_sessions')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', payload.table_session_id);
    }
    await notifyRealtime('billing', payload.invoice_id as string, 'SESSION_CLOSED', payload);
  },
  reset_table: async (payload) => {
    if (payload.table_id) {
      await insforge.database
        .from('restaurant_tables')
        .update({ status: 'available' })
        .eq('id', payload.table_id);
      await notifyRealtime('table', payload.table_id as string, 'TABLE_STATUS_CHANGED', { status: 'available' });
    }
  },
};

// ────────────────────────────────────────────
// PAYMENT WORKFLOW (FonePay specific)
// ────────────────────────────────────────────

const paymentWorkflowSteps = [
  'initiated',
  'qr_generated',
  'awaiting_payment',
  'paid',
  'failed',
  'expired',
];

const paymentTransitions: Record<string, string[]> = {
  initiated: ['qr_generated', 'failed'],
  qr_generated: ['awaiting_payment', 'failed'],
  awaiting_payment: ['paid', 'failed', 'expired'],
  paid: [],
  failed: ['initiated'],  // Allow retry
  expired: ['initiated'], // Allow regeneration
};

const paymentHandlers: Record<string, WorkflowHandler> = {
  initiated: async (payload) => {
    await notifyRealtime('payment', payload.transaction_id as string, 'PAYMENT_INITIATED', payload);
  },
  qr_generated: async (payload) => {
    await notifyRealtime('payment', payload.transaction_id as string, 'FONEPAY_PAYMENT_INITIATED', payload);
  },
  awaiting_payment: async (payload) => {
    await notifyRealtime('payment', payload.transaction_id as string, 'PAYMENT_AWAITING', payload);
  },
  paid: async (payload) => {
    await notifyRealtime('payment', payload.transaction_id as string, 'PAYMENT_CONFIRMED', payload);
  },
  failed: async (payload) => {
    await notifyRealtime('payment', payload.transaction_id as string, 'PAYMENT_FAILED', payload);
  },
  expired: async (payload) => {
    await notifyRealtime('payment', payload.transaction_id as string, 'PAYMENT_EXPIRED', payload);
  },
};

// ────────────────────────────────────────────
// WORKFLOW REGISTRY
// ────────────────────────────────────────────

export const workflows: Record<string, WorkflowDefinition> = {
  order: {
    name: 'Order Workflow',
    steps: orderWorkflowSteps,
    transitions: orderTransitions,
    handlers: orderHandlers,
  },
  table: {
    name: 'Table Workflow',
    steps: tableWorkflowSteps,
    transitions: tableTransitions,
    handlers: tableHandlers,
  },
  billing: {
    name: 'Billing Workflow',
    steps: billingWorkflowSteps,
    transitions: billingTransitions,
    handlers: billingHandlers,
  },
  payment: {
    name: 'Payment Workflow',
    steps: paymentWorkflowSteps,
    transitions: paymentTransitions,
    handlers: paymentHandlers,
  },
};

export function getWorkflow(name: string): WorkflowDefinition | undefined {
  return workflows[name];
}

export function isValidTransition(workflowName: string, from: string, to: string): boolean {
  const wf = workflows[workflowName];
  if (!wf) return false;
  const allowed = wf.transitions[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export async function executeWorkflowStep(
  workflowName: string,
  step: string,
  payload: Record<string, unknown>
): Promise<void> {
  const wf = workflows[workflowName];
  if (!wf) throw new Error(`Workflow "${workflowName}" not found`);
  const handler = wf.handlers[step];
  if (!handler) throw new Error(`No handler for step "${step}" in workflow "${workflowName}"`);
  await handler(payload);
}

// ────────────────────────────────────────────
// WORKFLOW STATE MANAGEMENT
// ────────────────────────────────────────────

export async function createWorkflowState(
  entityType: string,
  entityId: string,
  initialStep: string,
  context: Record<string, unknown> = {}
): Promise<string | null> {
  const { data, error } = await insforge.database
    .from('workflow_state')
    .insert([{
      entity_type: entityType,
      entity_id: entityId,
      current_step: initialStep,
      status: 'active',
      context,
    }])
    .select()
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function transitionWorkflow(
  workflowId: string,
  fromStep: string,
  toStep: string,
  actorId?: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const { error: logError } = await insforge.database
    .from('workflow_logs')
    .insert([{
      workflow_id: workflowId,
      from_step: fromStep,
      to_step: toStep,
      action: 'transition',
      actor_id: actorId || null,
      metadata,
    }]);
  if (logError) throw logError;

  const { error: updateError } = await insforge.database
    .from('workflow_state')
    .update({ current_step: toStep, updated_at: new Date().toISOString() })
    .eq('id', workflowId);
  if (updateError) throw updateError;
}
