import { insforge } from '../core/insforge';
import { refetchAllQueries } from '../core/query-client';
import { logger } from './logger';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSynced: Date | null;
  error: string | null;
}

let syncState: SyncState = { status: 'idle', lastSynced: null, error: null };
let listeners: Array<(state: SyncState) => void> = [];

function notifyListeners() {
  for (const fn of listeners) fn(syncState);
}

export function onSyncStateChange(fn: (state: SyncState) => void) {
  listeners.push(fn);
  return () => { listeners = listeners.filter(f => f !== fn); };
}

export function getSyncState(): SyncState {
  return { ...syncState };
}

async function checkConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(window.location.origin, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export async function performFullSync(): Promise<SyncState> {
  if (syncState.status === 'syncing') return syncState;

  syncState = { ...syncState, status: 'syncing', error: null };
  notifyListeners();

  try {
    const online = await checkConnectivity();
    if (!online) {
      syncState = { status: 'error', lastSynced: syncState.lastSynced, error: 'No internet connection' };
      notifyListeners();
      return syncState;
    }

    const { data: session } = await insforge.auth.getCurrentUser();
    if (!session?.user) {
      syncState = { status: 'error', lastSynced: syncState.lastSynced, error: 'Session expired. Please login again.' };
      notifyListeners();
      return syncState;
    }

    // Fetch latest data from server
    const [
      tablesRes,
      categoriesRes,
      menuItemsRes,
      productsRes,
      customersRes,
      invoicesRes,
      paymentLogsRes,
      settingsRes,
    ] = await Promise.allSettled([
      insforge.database.from('restaurant_tables').select('*').order('table_number'),
      insforge.database.from('menu_categories').select('*').order('sort_order'),
      insforge.database.from('menu_items').select('*').order('name'),
      insforge.database.from('products').select('*').order('name'),
      insforge.database.from('customers').select('*').order('name'),
      insforge.database.from('invoices').select('*, invoice_items(*), payment_logs(*)').order('created_at', { ascending: false }).limit(200),
      insforge.database.from('payment_logs').select('*').order('created_at', { ascending: false }).limit(200),
      insforge.database.from('settings').select('*'),
    ]);

    const errors: string[] = [];

    if (tablesRes.status === 'rejected') errors.push(`Tables: ${tablesRes.reason?.message || 'failed'}`);
    if (categoriesRes.status === 'rejected') errors.push(`Categories: ${categoriesRes.reason?.message || 'failed'}`);
    if (menuItemsRes.status === 'rejected') errors.push(`Menu Items: ${menuItemsRes.reason?.message || 'failed'}`);
    if (productsRes.status === 'rejected') errors.push(`Inventory: ${productsRes.reason?.message || 'failed'}`);
    if (customersRes.status === 'rejected') errors.push(`Customers: ${customersRes.reason?.message || 'failed'}`);
    if (invoicesRes.status === 'rejected') errors.push(`Invoices: ${invoicesRes.reason?.message || 'failed'}`);
    if (paymentLogsRes.status === 'rejected') errors.push(`Payments: ${paymentLogsRes.reason?.message || 'failed'}`);
    if (settingsRes.status === 'rejected') errors.push(`Settings: ${settingsRes.reason?.message || 'failed'}`);

    // Refresh all React Query caches
    refetchAllQueries();

    const now = new Date();
    syncState = {
      status: errors.length > 0 ? 'error' : 'success',
      lastSynced: now,
      error: errors.length > 0 ? errors.join('; ') : null,
    };

    logger.info('sync_completed', 'sync-service', {
      metadata: { success: errors.length === 0, errors: errors.length },
    });

    notifyListeners();

    // Auto-reset success to idle after 5s
    if (errors.length === 0) {
      setTimeout(() => {
        if (syncState.status === 'success') {
          syncState = { ...syncState, status: 'idle' };
          notifyListeners();
        }
      }, 5000);
    }

    return syncState;
  } catch (err) {
    syncState = {
      status: 'error',
      lastSynced: syncState.lastSynced,
      error: (err as Error)?.message || 'Sync failed unexpectedly',
    };
    notifyListeners();
    return syncState;
  }
}
