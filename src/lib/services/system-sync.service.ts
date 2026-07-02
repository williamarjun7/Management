import { insforge } from '../core/insforge';

export interface SyncStepResult {
  step: string;
  status: string;
  duration_ms: number;
  errors: string[];
  [key: string]: unknown;
}

export interface SystemSyncReport {
  duration: string;
  results: SyncStepResult[];
  summary: {
    tables_fixed: number;
    invoices_fixed: number;
    rooms_fixed: number;
    auto_checked_out: number;
    balances_fixed: number;
    stock_fixed: number;
    low_stock_count: number;
    inventory_holds_released: number;
    orphaned_orders: number;
    orphaned_services: number;
    total_errors: number;
  };
  errors: string[];
}

type SystemAdminResponse<T = unknown> = { data?: T; error?: string };

export async function triggerSystemSync(
  performedBy?: string,
): Promise<SystemAdminResponse<{ report: SystemSyncReport }>> {
  const { data, error } = await insforge.functions.invoke('system-sync', {
    body: { performed_by: performedBy },
  });
  if (error) return { error: error.message || 'System sync request failed' };
  return { data: data as { report: SystemSyncReport } };
}
