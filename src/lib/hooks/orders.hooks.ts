import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { insforge } from '../core/insforge';
import { logger } from '../services/logger';
import { writeAuditLog, createAuditEntry, AuditActions, AuditEntityTypes, AuditEventTypes } from '../services/audit.service';
import { occupyTable, refreshFromOrders } from '../services/table-state';
import type { Order } from '../../types';
import { queryKeys } from '../core/query-keys';

function requireOnline() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('You are currently offline. Please check your connection and try again.');
  }
}

const KITCHEN_STATUSES = ['active'];

const T = {
  orders: 'orders' as const,
  orderItems: 'order_items' as const,
};

// ─────────────── KITCHEN ───────────────

export function useKitchenOrders() {
  return useQuery({
    queryKey: queryKeys.kitchenOrders,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from(T.orders)
        .select('*, restaurant_tables(table_number), order_items(*)')
        .in('status', KITCHEN_STATUSES)
        .order('created_at', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });
}

// ─────────────── ORDERS ───────────────

export function useOrders(statusFilter?: string) {
  return useQuery({
    queryKey: statusFilter ? queryKeys.ordersByStatus(statusFilter) : queryKeys.orders,
    queryFn: async () => {
      let q = insforge.database
        .from(T.orders)
        .select('*, order_items(*), restaurant_tables(table_number)')
        .order('created_at', { ascending: false });
      if (statusFilter) q = q.eq('status', statusFilter);
      q = q.limit(100);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });
}

// ─────────────── ACTIVE ORDER BY TABLE ───────────────

export function useActiveOrderByTable(tableId?: string | null) {
  return useQuery({
    queryKey: queryKeys.activeOrderByTable(tableId ?? ''),
    queryFn: async () => {
      if (!tableId) return null;
      const { data, error } = await insforge.database
        .from(T.orders)
        .select('*, order_items(*)')
        .eq('table_id', tableId)
        .in('status', ['active'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data ?? []) as Order[])?.[0] ?? null;
    },
    enabled: !!tableId,
  });
}

// ─────────────── ADD ITEMS TO EXISTING ORDER ───────────────

export function useAddOrderItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      order_id: string;
      items: { menu_item_id: string; item_name: string; quantity: number; unit_price: number; notes?: string }[];
      discount?: number;
      discount_type?: 'percentage' | 'fixed';
      discount_value?: number;
    }) => {
      const { order_id, items } = values;

      const { error: ie } = await insforge.database
        .from(T.orderItems)
        .insert(items.map((i) => ({
          order_id,
          menu_item_id: i.menu_item_id,
          item_name: i.item_name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          notes: i.notes || null,
        })));
      if (ie) throw ie;

      const { data: existingOrder, error: fe } = await insforge.database
        .from(T.orders)
        .select('*, order_items(*)')
        .eq('id', order_id)
        .single();
      if (fe) throw fe;
      const order = existingOrder as Order;
      const newSubtotal = (order.order_items ?? []).reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0);
      const discount = Math.max(0, Math.min(values.discount ?? order.discount, newSubtotal));
      const newTotal = newSubtotal - discount;

      const { error: ue } = await insforge.database
        .from(T.orders)
        .update({
          subtotal: newSubtotal,
          discount,
          discount_type: values.discount_type ?? order.discount_type ?? null,
          discount_value: values.discount_value ?? order.discount_value ?? 0,
          total: newTotal,
        })
        .eq('id', order_id);
      if (ue) throw ue;

      return order;
    },
    onSuccess: (data) => {
      const order = data as Order;
      qc.invalidateQueries({ queryKey: queryKeys.orders });
      qc.invalidateQueries({ queryKey: queryKeys.tables });
      qc.invalidateQueries({ queryKey: queryKeys.kitchenOrders });
      if (order.table_id) {
        qc.invalidateQueries({ queryKey: queryKeys.activeOrderByTable(order.table_id) });
      }
    },
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      table_id: string; customer_name?: string; notes?: string; discount?: number;
      discount_type?: 'percentage' | 'fixed'; discount_value?: number;
      items: { menu_item_id: string; item_name: string; quantity: number; unit_price: number; notes?: string }[];
    }) => {
      requireOnline();
      const { items, ...rest } = values;
      const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
      const discount = Math.max(0, Math.min(rest.discount ?? 0, subtotal));
      const total = subtotal - discount;
      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase().slice(-4)}${Math.random().toString(36).toUpperCase().slice(2, 6)}`;
      const { data: order, error: oe } = await insforge.database
        .from(T.orders)
        .insert([{
          order_number: orderNumber,
          table_id: rest.table_id, customer_name: rest.customer_name || null,
          notes: rest.notes || null,
          subtotal, discount, discount_type: rest.discount_type ?? null,
          discount_value: rest.discount_value ?? 0,
          tax: 0, tax_rate: 0, service_charge: 0, service_charge_rate: 0,
          total,
          status: 'active',
        }])
        .select()
        .single();
      if (oe) throw oe;
      const orderId = (order as Order).id;

      const { error: ie } = await insforge.database
        .from(T.orderItems)
        .insert(items.map((i) => ({
          order_id: orderId,
          menu_item_id: i.menu_item_id,
          item_name: i.item_name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          notes: i.notes || null,
        })));
      if (ie) {
        await insforge.database
          .from(T.orders)
          .update({ status: 'cancelled', notes: 'Order creation failed - items could not be added' })
          .eq('id', orderId);
        throw ie;
      }
      return order;
    },
    onSuccess: async (data) => {
      const order = data as Order;
      writeAuditLog(createAuditEntry(AuditActions.ORDER_CREATED, AuditEntityTypes.ORDER, order.id, { new_state: { table_id: order.table_id, total: order.total }, event_type: AuditEventTypes.ORDER_CREATED }));
      qc.invalidateQueries({ queryKey: queryKeys.orders });
      qc.invalidateQueries({ queryKey: queryKeys.tables });
      qc.invalidateQueries({ queryKey: queryKeys.kitchenOrders });
      if (order.table_id) {
        qc.invalidateQueries({ queryKey: queryKeys.activeOrderByTable(order.table_id) });
        await occupyTable(order.table_id);
      }
    },
  });
}

// ─────────────── ORDER STATUS (RPC ONLY) ───────────────

export function useReserveInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_order_id: string;
      p_user_id: string;
    }) => {
      const idempotencyKey = crypto.randomUUID();
      const { data, error } = await insforge.database.rpc('reserve_inventory', {
        ...params,
        p_idempotency_key: idempotencyKey,
      });
      if (error) {
        logger.error('reserve_inventory_failed', 'hooks', {
          metadata: { params, error: (error as Error)?.message },
          operation: 'reserve_inventory',
        });
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders });
    },
  });
}

export function useReleaseInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (p_order_id: string) => {
      const idempotencyKey = crypto.randomUUID();
      const { data, error } = await insforge.database.rpc('release_inventory', {
        p_order_id,
        p_idempotency_key: idempotencyKey,
      });
      if (error) {
        logger.error('release_inventory_failed', 'hooks', {
          metadata: { p_order_id, error: (error as Error)?.message },
          operation: 'release_inventory',
        });
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders });
    },
  });
}

export function useTransitionOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_order_id: string;
      p_new_status: string;
      p_user_id: string;
      p_idempotency_key: string;
    }) => {
      const { data, error } = await insforge.database.rpc('transition_order_status', params);
      if (error) {
        logger.error('transition_order_status_failed', 'hooks', {
          metadata: { params, error: (error as Error)?.message },
          operation: 'transition_order_status',
        });
        throw error;
      }
      return data;
    },
    onSuccess: async (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.ORDER_STATUS_CHANGE, AuditEntityTypes.ORDER, vars.p_order_id, { new_state: { status: vars.p_new_status }, event_type: AuditEventTypes.ORDER_STATUS_CHANGE }));
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchenOrders });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders });
      queryClient.invalidateQueries({ queryKey: queryKeys.tables });

      try {
        const { data: order } = await insforge.database
          .from('orders')
          .select('table_id')
          .eq('id', vars.p_order_id)
          .single();
        if (order?.table_id) {
          await refreshFromOrders(order.table_id);
        }
      } catch {
        // non-blocking - table status refresh is best-effort
      }
    },
  });
}
