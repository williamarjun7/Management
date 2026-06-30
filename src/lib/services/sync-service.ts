import { insforge } from '../core/insforge';
import { refetchAllQueries } from '../core/query-client';
import { logger } from './logger';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSynced: Date | null;
  error: string | null;
  progress: string | null;
}

let syncState: SyncState = { status: 'idle', lastSynced: null, error: null, progress: null };
let listeners: Array<(state: SyncState) => void> = [];
let autoResetTimer: ReturnType<typeof setTimeout> | null = null;

function notifyListeners() {
  for (const fn of listeners) fn(syncState);
}

function setState(partial: Partial<SyncState>) {
  syncState = { ...syncState, ...partial };
  notifyListeners();
}

function scheduleAutoReset() {
  if (autoResetTimer) clearTimeout(autoResetTimer);
  autoResetTimer = setTimeout(() => {
    if (syncState.status === 'success' || syncState.status === 'error') {
      setState({ status: 'idle', progress: null });
    }
  }, 6000);
}

export function cancelAutoReset() {
  if (autoResetTimer) {
    clearTimeout(autoResetTimer);
    autoResetTimer = null;
  }
}

export function onSyncStateChange(fn: (state: SyncState) => void) {
  listeners.push(fn);
  return () => { listeners = listeners.filter(f => f !== fn); };
}

export function getSyncState(): SyncState {
  return { ...syncState };
}

async function fetchWithTimeout<T>(promise: PromiseLike<T>, ms = 15000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms)
    ),
  ]);
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

  cancelAutoReset();
  setState({ status: 'syncing', error: null, progress: 'Starting sync...' });

  try {
    const online = await checkConnectivity();
    if (!online) {
      setState({ status: 'error', error: 'No internet connection', progress: null });
      scheduleAutoReset();
      return syncState;
    }

    setState({ progress: 'Verifying session...' });
    const { data: session } = await fetchWithTimeout(insforge.auth.getCurrentUser(), 10000);
    if (!session?.user) {
      setState({ status: 'error', error: 'Session expired. Please login again.', progress: null });
      scheduleAutoReset();
      return syncState;
    }

    setState({ progress: 'Downloading updates...' });

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
      fetchWithTimeout(insforge.database.from('restaurant_tables').select('*').order('table_number'), 15000),
      fetchWithTimeout(insforge.database.from('menu_categories').select('*').order('sort_order'), 15000),
      fetchWithTimeout(insforge.database.from('menu_items').select('*').order('name'), 15000),
      fetchWithTimeout(insforge.database.from('products').select('*').order('name'), 15000),
      fetchWithTimeout(insforge.database.from('customers').select('*').order('name'), 15000),
      fetchWithTimeout(insforge.database.from('invoices').select('*, invoice_items(*), payment_logs(*)').order('created_at', { ascending: false }).limit(200), 30000),
      fetchWithTimeout(insforge.database.from('payment_logs').select('*').order('created_at', { ascending: false }).limit(200), 20000),
      fetchWithTimeout(insforge.database.from('settings').select('*'), 10000),
    ]);

    setState({ progress: 'Processing data...' });

    const errors: string[] = [];
    if (tablesRes.status === 'rejected') errors.push(`Tables: ${tablesRes.reason?.message || 'failed'}`);
    if (categoriesRes.status === 'rejected') errors.push(`Categories: ${categoriesRes.reason?.message || 'failed'}`);
    if (menuItemsRes.status === 'rejected') errors.push(`Menu Items: ${menuItemsRes.reason?.message || 'failed'}`);
    if (productsRes.status === 'rejected') errors.push(`Inventory: ${productsRes.reason?.message || 'failed'}`);
    if (customersRes.status === 'rejected') errors.push(`Customers: ${customersRes.reason?.message || 'failed'}`);
    if (invoicesRes.status === 'rejected') errors.push(`Invoices: ${invoicesRes.reason?.message || 'failed'}`);
    if (paymentLogsRes.status === 'rejected') errors.push(`Payments: ${paymentLogsRes.reason?.message || 'failed'}`);
    if (settingsRes.status === 'rejected') errors.push(`Settings: ${settingsRes.reason?.message || 'failed'}`);

    setState({ progress: 'Saving to local database...' });
    refetchAllQueries();

    const now = new Date();
    if (errors.length > 0) {
      setState({
        status: 'error',
        lastSynced: now,
        error: errors.join('; '),
        progress: null,
      });
    } else {
      setState({
        status: 'success',
        lastSynced: now,
        error: null,
        progress: null,
      });
    }

    logger.info('sync_completed', 'sync-service', {
      metadata: { success: errors.length === 0, errors: errors.length },
    });

    scheduleAutoReset();
    return syncState;
  } catch (err) {
    setState({
      status: 'error',
      lastSynced: syncState.lastSynced,
      error: (err as Error)?.message || 'Sync failed unexpectedly',
      progress: null,
    });
    scheduleAutoReset();
    return syncState;
  }
}

export function dismissError() {
  if (syncState.status === 'error' || syncState.status === 'success') {
    cancelAutoReset();
    setState({ status: 'idle', progress: null });
  }
}
