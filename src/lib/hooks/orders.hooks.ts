import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { insforge } from '../core/insforge';
import { logger } from '../services/logger';
import { writeAuditLog, createAuditEntry, AuditActions, AuditEntityTypes, AuditEventTypes } from '../services/audit.service';
import type { Order } from '../../types';
import { queryKeys } from '../core/query-keys';

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

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      table_id: string; customer_name?: string; notes?: string; discount?: number;
      items: { menu_item_id: string; item_name: string; quantity: number; unit_price: number; notes?: string }[];
    }) => {
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
          subtotal, discount, total,
          status: 'active',
        }])
        .select()
        .single();
      if (oe) throw oe;

      const { error: ie } = await insforge.database
        .from(T.orderItems)
        .insert(items.map((i) => ({
          order_id: (order as Order).id,
          menu_item_id: i.menu_item_id,
          item_name: i.item_name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          notes: i.notes || null,
        })));
      if (ie) throw ie;
      return order;
    },
    onSuccess: (data) => {
      writeAuditLog(createAuditEntry(AuditActions.ORDER_CREATED, AuditEntityTypes.ORDER, (data as Order).id, { new_state: { table_id: (data as Order).table_id, total: (data as Order).total }, event_type: AuditEventTypes.ORDER_CREATED }));
      qc.invalidateQueries({ queryKey: queryKeys.orders });
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
    onSuccess: (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.ORDER_STATUS_CHANGE, AuditEntityTypes.ORDER, vars.p_order_id, { new_state: { status: vars.p_new_status }, event_type: AuditEventTypes.ORDER_STATUS_CHANGE }));
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchenOrders });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders });
    },
  });
}
