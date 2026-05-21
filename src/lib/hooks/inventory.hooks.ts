import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { insforge } from '../core/insforge';
import { logger } from '../services/logger';
import { writeAuditLog, createAuditEntry, AuditActions, AuditEntityTypes } from '../services/audit.service';
import type { Product, StockMovement, SystemEvent, Supplier, PurchaseOrder } from '../../types';
import { queryKeys } from '../core/query-keys';

// ─────────────── PRODUCTS ───────────────

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true })
        .limit(200);
      if (error) throw error;
      const products = (data ?? []) as Product[];
      const productIds = products.map((p) => p.id);
      let balanceMap: Record<string, number> = {};
      if (productIds.length > 0) {
        const { data: balances, error: balErr } = await insforge.database.rpc('get_stock_balances', {
          p_product_ids: productIds,
        });
        if (!balErr && balances) {
          balanceMap = (balances as { product_id: string; balance: number }[]).reduce(
            (acc, row) => { acc[row.product_id] = row.balance; return acc; },
            {} as Record<string, number>
          );
        }
      }
      return products.map((p) => ({
        ...p,
        stock_balance: balanceMap[p.id] ?? 0,
      })) as (Product & { stock_balance: number })[];
    },
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ['product', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('products')
        .select('*')
        .eq('id', id)
        .limit(1)
        .single();
      if (error) throw error;
      const product = data as Product;
      const { data: balance } = await insforge.database.rpc('get_stock_balance', {
        p_product_id: id,
      });
      return { ...product, stock_balance: (balance as number) ?? 0 } as Product & { stock_balance: number };
    },
  });
}

export function useStockMovements(productId?: string) {
  return useQuery({
    queryKey: ['stock-movements', productId],
    queryFn: async () => {
      let query = insforge.database
        .from('stock_movements')
        .select('*, products(name)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (productId) {
        query = query.eq('product_id', productId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as (StockMovement & { products?: { name: string } })[];
    },
  });
}

// ─────────────── AUDIT LOGS ───────────────

export function useAuditLogs(limit = 100) {
  return useQuery({
    queryKey: ['audit-logs', limit],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('system_events')
        .select('id, event_type, entity_type, entity_id, payload, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as SystemEvent[];
    },
  });
}

// ─────────────── INVENTORY OPERATIONS ───────────────

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (product: {
      name: string; sku?: string; category?: string; unit: string; reorder_level?: number;
    }) => {
      const { data, error } = await insforge.database
        .from('products')
        .insert([{ ...product, is_active: true }])
        .select();
      if (error) {
        logger.error('create_product_failed', 'hooks', {
          metadata: { product, error: (error as Error)?.message },
          operation: 'create_product',
        });
        throw error;
      }
      return data;
    },
    onSuccess: (data, vars) => {
      const record = Array.isArray(data) ? data[0] : data;
      writeAuditLog(createAuditEntry(AuditActions.CREATE, AuditEntityTypes.PRODUCT, record?.id ?? 'unknown', { new_state: { name: vars.name, sku: vars.sku, category: vars.category, unit: vars.unit } }));
      queryClient.invalidateQueries({ queryKey: queryKeys.products });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (product: {
      id: string; name: string; sku?: string; category?: string; unit: string; reorder_level?: number;
    }) => {
      const { id, ...data } = product;
      const { error } = await insforge.database
        .from('products')
        .update({ ...data, reorder_level: data.reorder_level ?? null })
        .eq('id', id);
      if (error) {
        logger.error('update_product_failed', 'hooks', {
          metadata: { id, product: data, error: (error as Error)?.message },
          operation: 'update_product',
        });
        throw error;
      }
    },
    onSuccess: (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.UPDATE, AuditEntityTypes.PRODUCT, vars.id, { new_state: { name: vars.name, sku: vars.sku, category: vars.category, unit: vars.unit } }));
      queryClient.invalidateQueries({ queryKey: queryKeys.products });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await insforge.database
        .from('products')
        .update({ is_active: false })
        .eq('id', id);
      if (error) {
        logger.error('delete_product_failed', 'hooks', {
          metadata: { id, error: (error as Error)?.message },
          operation: 'delete_product',
        });
        throw error;
      }
    },
    onSuccess: (_data, id) => {
      writeAuditLog(createAuditEntry(AuditActions.DELETE, AuditEntityTypes.PRODUCT, id));
      queryClient.invalidateQueries({ queryKey: queryKeys.products });
    },
  });
}

export function useRecordStockMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_product_id: string;
      p_movement_type: string;
      p_quantity: number;
      p_unit: string;
      p_created_by: string;
      p_reason?: string;
    }) => {
      const idempotencyKey = crypto.randomUUID();
      const { data, error } = await insforge.database.rpc('record_stock_movement', {
        ...params,
        p_idempotency_key: idempotencyKey,
      });
      if (error) {
        logger.error('record_stock_movement_failed', 'hooks', {
          metadata: { params, error: (error as Error)?.message },
          operation: 'record_stock_movement',
        });
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    },
  });
}

// ─────────────── SUPPLIERS ───────────────

export function useSuppliers() {
  return useQuery({
    queryKey: queryKeys.suppliers,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('suppliers')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (supplier: {
      name: string; contact_person?: string; phone?: string;
      email?: string; address?: string; tax_id?: string; payment_terms?: string; notes?: string;
    }) => {
      const { data, error } = await insforge.database
        .from('suppliers')
        .insert([{ ...supplier, is_active: true }])
        .select()
        .single();
      if (error) {
        logger.error('create_supplier_failed', 'hooks', {
          metadata: { name: supplier.name, error: (error as Error)?.message },
          operation: 'create_supplier',
        });
        throw error;
      }
      return data as Supplier;
    },
    onSuccess: (data) => {
      writeAuditLog(createAuditEntry(AuditActions.CREATE, AuditEntityTypes.SYSTEM_EVENT, data.id, { new_state: { name: data.name } }));
      qc.invalidateQueries({ queryKey: queryKeys.suppliers });
    },
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (supplier: {
      id: string; name?: string; contact_person?: string; phone?: string;
      email?: string; address?: string; tax_id?: string; payment_terms?: string; notes?: string;
    }) => {
      const { id, ...rest } = supplier;
      const { error } = await insforge.database
        .from('suppliers')
        .update(rest)
        .eq('id', id);
      if (error) {
        logger.error('update_supplier_failed', 'hooks', {
          metadata: { id, error: (error as Error)?.message },
          operation: 'update_supplier',
        });
        throw error;
      }
    },
    onSuccess: (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.UPDATE, AuditEntityTypes.SYSTEM_EVENT, vars.id, { reason: 'Supplier updated' }));
      qc.invalidateQueries({ queryKey: queryKeys.suppliers });
    },
  });
}

// ─────────────── THRESHOLD ALERTS ───────────────

export function useThresholdAlerts() {
  return useQuery({
    queryKey: ['threshold-alerts'],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('products')
        .select('id, name, sku, category, unit, reorder_level')
        .not('reorder_level', 'is', null)
        .eq('is_active', true)
        .limit(200);
      if (error) throw error;
      const products = (data ?? []) as Product[];
      const productIds = products.map(p => p.id);
      if (productIds.length === 0) return [];
      const { data: balances, error: balErr } = await insforge.database.rpc('get_stock_balances', {
        p_product_ids: productIds,
      });
      if (balErr) return products.map(p => ({ ...p, stock_balance: 0, status: 'unknown' as const }));
      const balanceMap = (balances as { product_id: string; balance: number }[]).reduce(
        (acc, row) => { acc[row.product_id] = row.balance; return acc; },
        {} as Record<string, number>
      );
      return products.map(p => ({
        ...p,
        stock_balance: balanceMap[p.id] ?? 0,
        status: (balanceMap[p.id] ?? 0) <= 0 ? 'out_of_stock' as const
          : (balanceMap[p.id] ?? 0) <= (p.reorder_level ?? 0) ? 'low' as const
          : 'ok' as const,
      }));
    },
  });
}

// ─────────────── STOCK FORECAST ───────────────

export function useStockForecast(productId: string | undefined, days = 7) {
  return useQuery({
    queryKey: ['stock-forecast', productId, days],
    enabled: !!productId,
    queryFn: async () => {
      const lookbackDays = 30;
      const { data, error } = await insforge.database
        .from('stock_movements')
        .select('movement_type, quantity, created_at, running_balance')
        .eq('product_id', productId)
        .gte('created_at', new Date(Date.now() - lookbackDays * 86400000).toISOString())
        .order('created_at', { ascending: true })
        .limit(500);
      if (error) throw error;
      const movements = (data ?? []) as StockMovement[];
      const outgoing = movements.filter(m => m.movement_type === 'sale' || m.movement_type === 'wastage');
      const totalConsumed = outgoing.reduce((s, m) => s + Math.abs(Number(m.quantity)), 0);
      const avgDailyConsumption = lookbackDays > 0 ? totalConsumed / lookbackDays : 0;
      const latestBalance = movements.length > 0 ? Number(movements[movements.length - 1].running_balance) : 0;
      const daysRemaining = avgDailyConsumption > 0 ? Math.floor(latestBalance / avgDailyConsumption) : 999;
      const projected = Array.from({ length: days }, (_, i) => ({
        day: i + 1,
        projectedBalance: Math.max(0, latestBalance - avgDailyConsumption * (i + 1)),
        dailyConsumption: avgDailyConsumption,
      }));
      return {
        productId,
        currentBalance: latestBalance,
        avgDailyConsumption,
        daysRemaining,
        totalConsumed,
        lookbackDays,
        projected,
        needsReorder: daysRemaining <= 7,
      };
    },
  });
}

// ─────────────── PURCHASE ORDERS ───────────────

export function usePurchaseOrders(status?: string) {
  return useQuery({
    queryKey: ['purchase-orders', status],
    queryFn: async () => {
      let query = insforge.database
        .from('purchase_orders')
        .select('*, suppliers(*), purchase_order_items(*)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (status && status !== 'all') {
        query = query.eq('status', status);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as (PurchaseOrder & { suppliers: Supplier; purchase_order_items: import('../../types').PurchaseOrderItem[] })[];
    },
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_supplier_id: string;
      p_items: Array<{ product_id: string; product_name: string; quantity: number; unit: string; unit_price: number; total_price: number }>;
      p_expected_date?: string;
      p_notes?: string;
      p_created_by?: string;
    }) => {
      const poNumber = 'PO-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      const { data: poData, error: poError } = await insforge.database
        .from('purchase_orders')
        .insert([{
          po_number: poNumber,
          supplier_id: params.p_supplier_id,
          status: 'draft',
          expected_date: params.p_expected_date || null,
          notes: params.p_notes || null,
          created_by: params.p_created_by || null,
        }])
        .select()
        .single();
      if (poError) {
        logger.error('create_purchase_order_failed', 'hooks', {
          metadata: { supplier_id: params.p_supplier_id, error: (poError as Error)?.message },
          operation: 'create_purchase_order',
        });
        throw poError;
      }
      const poId = (poData as { id: string }).id;
      const itemsToInsert = params.p_items.map(item => ({ ...item, purchase_order_id: poId }));
      const { error: itemsError } = await insforge.database
        .from('purchase_order_items')
        .insert(itemsToInsert);
      if (itemsError) {
        logger.error('create_po_items_failed', 'hooks', {
          metadata: { po_id: poId, error: (itemsError as Error)?.message },
          operation: 'create_purchase_order_items',
        });
        throw itemsError;
      }
      return { id: poId, po_number: poNumber };
    },
    onSuccess: (data) => {
      writeAuditLog(createAuditEntry(AuditActions.CREATE, AuditEntityTypes.SYSTEM_EVENT, data.id, { new_state: { po_number: data.po_number } }));
      qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders });
    },
  });
}

export function useReceivePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_po_id: string;
      p_received_by: string;
      p_items?: Array<{ id: string; quantity: number }>;
    }) => {
      const { data, error } = await insforge.database.rpc('receive_purchase_order', {
        ...params,
        p_items: params.p_items ? JSON.stringify(params.p_items) : null,
        p_idempotency_key: crypto.randomUUID(),
      });
      if (error) {
        logger.error('receive_purchase_order_failed', 'hooks', {
          metadata: { po_id: params.p_po_id, error: (error as Error)?.message },
          operation: 'receive_purchase_order',
        });
        throw error;
      }
      return data;
    },
    onSuccess: (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.UPDATE, AuditEntityTypes.SYSTEM_EVENT, vars.p_po_id, { reason: 'Purchase order received' }));
      qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders });
      qc.invalidateQueries({ queryKey: queryKeys.products });
      qc.invalidateQueries({ queryKey: ['stock-movements'] });
    },
  });
}
