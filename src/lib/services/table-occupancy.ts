/**
 * @deprecated Use table-state.ts instead.
 * This module is kept for backward compatibility.
 * All functions delegate to the centralized table-state service.
 */
export {
  refreshFromOrders as refreshTableStatus,
  syncAllTables,
} from './table-state';
