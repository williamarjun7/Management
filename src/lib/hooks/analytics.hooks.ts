import { useQuery } from '@tanstack/react-query';
import { insforge } from '../core/insforge';
import { getTelemetryMetrics } from '../services/telemetry';
import { getRealtimeDiagnostics } from '../services/realtime';
import { getQueueHealth } from '../services/mutation-queue';
import type { Product } from '../../types';

// ── Revenue Analytics ──

export function useRevenueByPeriod(days = 7) {
  return useQuery({
    queryKey: ['analytics', 'revenue', 'daily', days],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('orders')
        .select('total, status, created_at, payment_method')
        .eq('status', 'completed')
        .gte('created_at', new Date(Date.now() - days * 86400000).toISOString())
        .order('created_at', { ascending: true });
      if (error) throw error;

      const dayBuckets: Record<string, number> = {};
      const methodBuckets: Record<string, { count: number; total: number }> = {};
      let totalRevenue = 0;
      let orderCount = 0;

      (data ?? []).forEach((o: { total: number; status: string; created_at: string; payment_method?: string }) => {
        const day = new Date(o.created_at).toISOString().slice(0, 10);
        dayBuckets[day] = (dayBuckets[day] || 0) + Number(o.total);
        const method = (o.payment_method as string) || 'unknown';
        if (!methodBuckets[method]) methodBuckets[method] = { count: 0, total: 0 };
        methodBuckets[method].count++;
        methodBuckets[method].total += Number(o.total);
        totalRevenue += Number(o.total);
        orderCount++;
      });

      return { dayBuckets, methodBuckets, totalRevenue, orderCount, days };
    },
  });
}

export function usePaymentMethodBreakdown() {
  return useQuery({
    queryKey: ['analytics', 'payments', 'methods'],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('payment_logs')
        .select('method, amount, status')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const methods: Record<string, { count: number; total: number }> = {};
      (data ?? []).forEach((p: { method: string; amount: number; status: string }) => {
        if (!methods[p.method]) methods[p.method] = { count: 0, total: 0 };
        methods[p.method].count++;
        methods[p.method].total += Number(p.amount);
      });
      return methods;
    },
  });
}

export function useAverageOrderValue(days = 30) {
  return useQuery({
    queryKey: ['analytics', 'aov', days],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('orders')
        .select('total, created_at')
        .eq('status', 'completed')
        .gte('created_at', new Date(Date.now() - days * 86400000).toISOString())
        .order('created_at', { ascending: true });
      if (error) throw error;

      const orders = (data ?? []) as { total: number; created_at: string }[];
      const dayBuckets: Record<string, { total: number; count: number }> = {};
      for (const o of orders) {
        const day = o.created_at.slice(0, 10);
        if (!dayBuckets[day]) dayBuckets[day] = { total: 0, count: 0 };
        dayBuckets[day].total += Number(o.total);
        dayBuckets[day].count++;
      }
      return Object.entries(dayBuckets).map(([date, { total, count }]) => ({
        date,
        aov: count > 0 ? total / count : 0,
        orderCount: count,
        revenue: total,
      }));
    },
  });
}

// ── Operational Analytics ──

export function useQueueAnalytics() {
  return useQuery({
    queryKey: ['analytics', 'queue'],
    queryFn: async () => {
      const health = await getQueueHealth();
      return health;
    },
    refetchInterval: 30000,
  });
}

export function useRealtimeAnalytics() {
  return useQuery({
    queryKey: ['analytics', 'realtime'],
    queryFn: async () => {
      const diag = getRealtimeDiagnostics();
      return diag;
    },
    refetchInterval: 30000,
  });
}

export function useSystemTelemetry() {
  return useQuery({
    queryKey: ['analytics', 'telemetry'],
    queryFn: () => getTelemetryMetrics(),
    refetchInterval: 60000,
  });
}

// ── Staff Analytics ──

export function useStaffRoleDistribution() {
  return useQuery({
    queryKey: ['analytics', 'staff', 'roles'],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('user_profiles')
        .select('role, is_active');
      if (error) throw error;
      const roles: Record<string, { active: number; inactive: number }> = {};
      (data ?? []).forEach((p: { role: string; is_active: boolean }) => {
        if (!roles[p.role]) roles[p.role] = { active: 0, inactive: 0 };
        if (p.is_active) roles[p.role].active++;
        else roles[p.role].inactive++;
      });
      return roles;
    },
  });
}

export function useActiveStaff() {
  return useQuery({
    queryKey: ['analytics', 'staff', 'active'],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('user_profiles')
        .select('id, name, email, role, is_active')
        .eq('is_active', true);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string | null; email: string; role: string; is_active: boolean }>;
    },
  });
}

export function useStaffOrderCounts() {
  return useQuery({
    queryKey: ['analytics', 'staff', 'orders'],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('orders')
        .select('created_by, status')
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString());
      if (error) throw error;
      const staffCounts: Record<string, { total: number; completed: number }> = {};
      (data ?? []).forEach((o: { created_by: string | null; status: string }) => {
        if (!o.created_by) return;
        if (!staffCounts[o.created_by]) staffCounts[o.created_by] = { total: 0, completed: 0 };
        staffCounts[o.created_by].total++;
        if (o.status === 'completed') staffCounts[o.created_by].completed++;
      });
      return staffCounts;
    },
  });
}

// ── Inventory Analytics ──

export function useLowStockProducts() {
  return useQuery({
    queryKey: ['analytics', 'inventory', 'low-stock'],
    queryFn: async () => {
      const { data, error } = await insforge.database.rpc('get_low_stock_products');
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });
}

export function useStockMovementTrends(days = 14) {
  return useQuery({
    queryKey: ['analytics', 'inventory', 'movements', days],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('stock_movements')
        .select('movement_type, quantity, created_at')
        .gte('created_at', new Date(Date.now() - days * 86400000).toISOString())
        .order('created_at', { ascending: true });
      if (error) throw error;

      const dayBuckets: Record<string, Record<string, number>> = {};
      (data ?? []).forEach((m: { movement_type: string; quantity: number; created_at: string }) => {
        const day = m.created_at.slice(0, 10);
        if (!dayBuckets[day]) dayBuckets[day] = {};
        const type = m.movement_type || 'adjustment';
        dayBuckets[day][type] = (dayBuckets[day][type] || 0) + Math.abs(Number(m.quantity));
      });
      return dayBuckets;
    },
  });
}

// ── Forecasting ──

export function useRevenueForecast(days = 7) {
  return useQuery({
    queryKey: ['analytics', 'forecast', 'revenue', days],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('orders')
        .select('total, created_at')
        .eq('status', 'completed')
        .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
        .order('created_at', { ascending: true });
      if (error) throw error;

      const dailyRevenue: Record<string, number> = {};
      (data ?? []).forEach((o: { total: number; created_at: string }) => {
        const day = o.created_at.slice(0, 10);
        dailyRevenue[day] = (dailyRevenue[day] || 0) + Number(o.total);
      });

      const values = Object.values(dailyRevenue);
      const avgDaily = values.length > 0
        ? values.reduce((a, b) => a + b, 0) / values.length
        : 0;

      const recentDays = Object.keys(dailyRevenue).sort().slice(-7);
      const recentAvg = recentDays.length > 0
        ? recentDays.reduce((s, d) => s + (dailyRevenue[d] || 0), 0) / recentDays.length
        : 0;

      const trend = recentAvg > avgDaily ? 'increasing' : recentAvg < avgDaily ? 'decreasing' : 'stable';
      const forecast = Array.from({ length: days }, (_, i) => ({
        day: i + 1,
        projected: recentAvg,
        lower: recentAvg * 0.8,
        upper: recentAvg * 1.2,
      }));

      return { avgDaily, recentAvg, trend, forecast, historicalDays: Object.keys(dailyRevenue).length };
    },
  });
}

export function useOccupancyForecast(days = 7) {
  return useQuery({
    queryKey: ['analytics', 'forecast', 'occupancy', days],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('bookings')
        .select('check_in, check_out, status')
        .gte('check_in', new Date().toISOString())
        .lte('check_in', new Date(Date.now() + 30 * 86400000).toISOString())
        .in('status', ['confirmed', 'checked_in']);
      if (error) throw error;

      const dailyBookings: Record<string, number> = {};
      (data ?? []).forEach((b: { check_in: string; check_out: string }) => {
        const day = b.check_in.slice(0, 10);
        dailyBookings[day] = (dailyBookings[day] || 0) + 1;
      });

      const { count: roomCount } = await insforge.database
        .from('rooms')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);

      const totalRooms = (roomCount as number) ?? 20;

      return {
        dailyBookings,
        totalRooms,
        forecast: Array.from({ length: days }, (_, i) => {
          const date = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
          const booked = dailyBookings[date] || 0;
          return { date, booked, occupancyRate: totalRooms > 0 ? (booked / totalRooms) * 100 : 0 };
        }),
      };
    },
  });
}
