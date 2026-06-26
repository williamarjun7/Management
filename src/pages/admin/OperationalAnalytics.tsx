import { useState } from 'react';
import { useOrders, useRooms } from '../../lib/hooks';
import { getTelemetryMetrics } from '../../lib/services/telemetry';
import { getRealtimeDiagnostics } from '../../lib/services/realtime';
import { exportCsv } from '../../lib/services/csv-export';
import { useRevenueByPeriod, usePaymentMethodBreakdown, useAverageOrderValue, useQueueAnalytics, useStaffRoleDistribution, useActiveStaff, useStaffOrderCounts, useLowStockProducts, useStockMovementTrends, useRevenueForecast, useOccupancyForecast } from '../../lib/hooks';
import type { Order } from '../../types';
import { TrendingUp, Bed, Timer, Users, Download, Loader2, AlertTriangle, BarChart3, LineChart, Package, TrendingDown, Calendar } from 'lucide-react';

function formatMs(ms: number | null): string {
  if (ms === null || ms === 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function OperationalAnalytics() {
  const { data: orders, isLoading: ordersLoading } = useOrders();
  const { data: rooms } = useRooms();
  const summary = getTelemetryMetrics();
  const realtimeDiag = getRealtimeDiagnostics();

  const { data: revenueData, isLoading: revenueLoading } = useRevenueByPeriod(7);
  const { data: paymentMethods } = usePaymentMethodBreakdown();
  const { data: aovData } = useAverageOrderValue(30);
  const { data: queueHealth } = useQueueAnalytics();
  const { data: staffRoles } = useStaffRoleDistribution();
  const { data: activeStaff } = useActiveStaff();
  const { data: staffOrderCounts } = useStaffOrderCounts();
  const { data: lowStockProducts } = useLowStockProducts();
  const { data: stockMovements } = useStockMovementTrends(14);
  const { data: revenueForecast } = useRevenueForecast(7);
  const { data: occupancyForecast } = useOccupancyForecast(7);

  const paidOrders = (orders ?? []).filter(
    (o: Order) => o.status === 'completed'
  );
  const grossRevenue = paidOrders.reduce((s, o) => s + Number(o.total), 0);
  const avgOrderValue = paidOrders.length > 0 ? grossRevenue / paidOrders.length : 0;

  const occupiedRooms = (rooms ?? []).filter((r) => r.status === 'occupied').length;
  const totalRooms = (rooms ?? []).length;
  const occupancyRate = totalRooms > 0 ? ((occupiedRooms / totalRooms) * 100).toFixed(1) : '0.0';

  const kitchenOrders = (orders ?? []).filter(
    (o: Order) => o.status === 'active'
  );
  const avgPrepMs = 0;

  const [period, setPeriod] = useState<'daily' | 'monthly'>('daily');

  const revenueByDay = revenueData ? Object.values(revenueData.dayBuckets) : [];
  const chartData = revenueByDay.length > 0 ? revenueByDay : new Array(7).fill(0);
  const chartMax = Math.max(...chartData, 1);

  function handleExport() {
    const date = new Date().toISOString().split('T')[0];
    exportCsv(
      [{
        grossRevenue: `Rs. ${grossRevenue.toFixed(2)}`,
        paidOrders: paidOrders.length,
        avgOrderValue: `Rs. ${avgOrderValue.toFixed(2)}`,
        occupancyRate: `${occupancyRate}%`,
        occupiedRooms,
        totalRooms,
        avgPrepTime: formatMs(avgPrepMs),
        activeOrders: kitchenOrders.length,
        pendingRevenue: `Rs. ${pendingRevenue.toFixed(0)}`,
        queueSize: queueHealth?.queueSize ?? 0,
        mutations: summary.queueUsage,
        channels: realtimeDiag.channelCount,
        lowStockItems: lowStockProducts?.length ?? 0,
        forecastTrend: revenueForecast?.trend ?? 'unknown',
        period,
        exportedAt: new Date().toISOString(),
      }],
      [
        { label: 'Gross Revenue', value: (r) => r.grossRevenue },
        { label: 'Paid Orders', value: (r) => r.paidOrders },
        { label: 'Avg Order Value', value: (r) => r.avgOrderValue },
        { label: 'Occupancy Rate', value: (r) => r.occupancyRate },
        { label: 'Occupied Rooms', value: (r) => r.occupiedRooms },
        { label: 'Total Rooms', value: (r) => r.totalRooms },
        { label: 'Avg Prep Time', value: (r) => r.avgPrepTime },
        { label: 'Active Orders', value: (r) => r.activeOrders },
        { label: 'Pending Revenue', value: (r) => r.pendingRevenue },
        { label: 'Queue Size', value: (r) => r.queueSize },
        { label: 'Mutations', value: (r) => r.mutations },
        { label: 'Channels', value: (r) => r.channels },
        { label: 'Low Stock Items', value: (r) => r.lowStockItems },
        { label: 'Forecast Trend', value: (r) => r.forecastTrend },
        { label: 'Period', value: (r) => r.period },
        { label: 'Exported At', value: (r) => r.exportedAt },
      ],
      `analytics-${date}`
    );
  }

  const pendingRevenue = (orders ?? []).filter(
    (o) => !['completed', 'cancelled', 'refunded'].includes(o.status)
  ).reduce((s, o) => s + Number(o.total), 0);

  const roleGroups = (activeStaff ?? []).reduce<Record<string, { name: string | null; email: string; role: string }[]>>((acc, s) => {
    const role = s.role ?? 'staff';
    if (!acc[role]) acc[role] = [];
    acc[role].push(s);
    return acc;
  }, {});

  if (ordersLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground">Business metrics and operational telemetry</p>
        </div>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-xs font-medium hover:bg-accent transition-colors min-h-[44px]"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground uppercase">Gross Revenue</span>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold">Rs. {grossRevenue.toFixed(2)}</p>
          <p className="text-xs text-emerald-400 mt-1">+{paidOrders.length} paid orders</p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground uppercase">Occupancy</span>
            <Bed className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-bold">{occupancyRate}%</p>
          <p className="text-xs text-cyan-400 mt-1">{occupiedRooms} / {totalRooms} rooms</p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground uppercase">Avg Prep Time</span>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">{formatMs(avgPrepMs)}</p>
          <p className="text-xs text-muted-foreground mt-1">{kitchenOrders.length} active orders</p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground uppercase">Active Staff</span>
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">{activeStaff?.length ?? '...'}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {staffRoles ? Object.keys(staffRoles).length : '—'} roles
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground uppercase">Forecast</span>
            <LineChart className={`h-4 w-4 ${revenueForecast?.trend === 'increasing' ? 'text-emerald-400' : revenueForecast?.trend === 'decreasing' ? 'text-red-400' : 'text-muted-foreground'}`} />
          </div>
          <p className="text-2xl font-bold">
            Rs. {revenueForecast ? revenueForecast.recentAvg.toFixed(0) : '...'}
          </p>
          <p className={`text-xs mt-1 capitalize ${
            revenueForecast?.trend === 'increasing' ? 'text-emerald-400' :
            revenueForecast?.trend === 'decreasing' ? 'text-red-400' : 'text-muted-foreground'
          }`}>
            {revenueForecast?.trend ?? '—'} daily avg
          </p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Revenue Flow Chart */}
        <div className="col-span-12 lg:col-span-8 rounded-xl border bg-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-semibold">Revenue Flow</h3>
              <p className="text-xs text-muted-foreground">Consolidated earnings</p>
            </div>
            <div className="flex rounded-lg bg-muted p-0.5 text-xs">
              <span
                onClick={() => setPeriod('daily')}
                className={`rounded-md px-3 py-1.5 font-medium cursor-pointer ${period === 'daily' ? 'bg-card' : 'text-muted-foreground hover:text-foreground'}`}
              >Daily</span>
              <span
                onClick={() => setPeriod('monthly')}
                className={`px-3 py-1.5 cursor-pointer ${period === 'monthly' ? 'rounded-md bg-card font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >Monthly</span>
            </div>
          </div>
          {revenueLoading ? (
            <div className="h-48 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="h-48 flex items-end justify-between gap-2 relative">
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
                <div className="border-b border-foreground" />
                <div className="border-b border-foreground" />
                <div className="border-b border-foreground" />
                <div className="border-b border-foreground" />
              </div>
              {chartData.map((val, i) => {
                const pct = (val / chartMax) * 100;
                const isHigh = val === chartMax;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                    <div
                      className={`w-full max-w-[32px] rounded-t ${isHigh ? 'bg-primary' : 'bg-emerald-500/60'}`}
                      style={{ height: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-between mt-3 text-[10px] text-muted-foreground uppercase font-semibold">
            {DAY_NAMES.map((l) => <span key={l}>{l}</span>)}
          </div>
        </div>

        {/* Staff Performance */}
        <div className="col-span-12 lg:col-span-4 rounded-xl border bg-card p-6">
          <h3 className="text-sm font-semibold mb-4">Staff Performance</h3>
          {activeStaff && activeStaff.length > 0 ? (
            <div className="space-y-4">
              {Object.entries(roleGroups).map(([role, members]) => {
                const totalOrders = Object.values(staffOrderCounts ?? {}).reduce((s, c) => s + c.total, 0);
                const roleOrders = Object.entries(staffOrderCounts ?? {})
                  .filter(([id]) => members.some(m => (m as any).id === id))
                  .reduce((s, [, c]) => s + c.total, 0);
                return (
                  <div key={role} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium capitalize">{role}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">{members.length} active</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{roleOrders} orders</p>
                      <p className="text-[10px] text-muted-foreground">
                        {totalOrders > 0 ? ((roleOrders / totalOrders) * 100).toFixed(0) : 0}% share
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active staff</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Payment Distribution */}
        <div className="col-span-12 lg:col-span-4 rounded-xl border bg-card p-6">
          <h3 className="text-sm font-semibold mb-4">Payment Distribution</h3>
          {paymentMethods && Object.keys(paymentMethods).length > 0 ? (
            <div className="space-y-4">
              {Object.entries(paymentMethods).map(([method, { count, total }]) => {
                const allTotal = Object.values(paymentMethods).reduce((s, m) => s + m.total, 0);
                const pct = allTotal > 0 ? (total / allTotal) * 100 : 0;
                return (
                  <div key={method}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-muted-foreground capitalize">{method}</span>
                      <span className="font-medium">Rs. {total.toFixed(0)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{count} transactions ({pct.toFixed(0)}%)</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {[
                { label: 'Completed', pct: paidOrders.length > 0 ? 72 : 0, color: 'bg-cyan-400' },
                { label: 'Pending', pct: paidOrders.length > 0 ? 18 : 0, color: 'bg-emerald-400' },
                { label: 'Unpaid', pct: paidOrders.length > 0 ? 10 : 100, color: 'bg-muted' },
              ].map((p) => (
                <div key={p.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{p.label}</span>
                    <span className="font-medium">{p.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${p.color}`} style={{ width: `${p.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Average Order Value */}
        <div className="col-span-12 lg:col-span-4 rounded-xl border bg-card p-6">
          <h3 className="text-sm font-semibold mb-4">Average Order Value</h3>
          {aovData && aovData.length > 0 ? (
            <>
              <div className="h-32 flex items-end justify-between gap-1">
                {aovData.slice(-14).map((day, i) => {
                  const maxAov = Math.max(...aovData.map(d => d.aov), 1);
                  const pct = (day.aov / maxAov) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div
                        className="w-full max-w-[16px] rounded-t bg-violet-500/60"
                        style={{ height: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>Last 14 days</span>
                <span className="font-medium">Rs. {aovData[aovData.length - 1]?.aov.toFixed(2) ?? '—'}</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No AOV data</p>
          )}
        </div>

        {/* System Telemetry */}
        <div className="col-span-12 lg:col-span-4 rounded-xl border bg-card p-6">
          <h3 className="text-sm font-semibold mb-4">System Telemetry</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-muted p-3">
              <p className="text-[10px] text-muted-foreground uppercase">Queue Size</p>
              <p className="text-lg font-bold">{queueHealth?.queueSize ?? 0}</p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-[10px] text-muted-foreground uppercase">Mutations</p>
              <p className="text-lg font-bold">{summary.queueUsage}</p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-[10px] text-muted-foreground uppercase">Channels</p>
              <p className="text-lg font-bold">{realtimeDiag.channelCount}</p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-[10px] text-muted-foreground uppercase">Avg RPC</p>
              <p className="text-lg font-bold">{summary.avgRpcLatencyMs ? `${summary.avgRpcLatencyMs}ms` : '—'}</p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-[10px] text-muted-foreground uppercase">Reconnects</p>
              <p className="text-lg font-bold">{summary.reconnectCount}</p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-[10px] text-muted-foreground uppercase">Events (1h)</p>
              <p className="text-lg font-bold">{summary.lastHour}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Low Stock & Inventory Alert */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6 rounded-xl border bg-card p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Low Stock Alerts
          </h3>
          {lowStockProducts && lowStockProducts.length > 0 ? (
            <div className="space-y-3">
              {lowStockProducts.slice(0, 8).map((p) => (
                <div key={p.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">{p.category ?? 'Uncategorized'} · {p.unit}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${(p as unknown as { stock_balance: number }).stock_balance <= 0 ? 'text-red-500' : 'text-amber-500'}`}>
                      {(p as unknown as { stock_balance: number }).stock_balance} {p.unit}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Reorder at: {p.reorder_level}</p>
                  </div>
                </div>
              ))}
              {lowStockProducts.length > 8 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  ...and {lowStockProducts.length - 8} more items
                </p>
              )}
            </div>
          ) : (
            <div className="py-8 text-center">
              <Package className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No low stock items</p>
              <p className="text-xs text-muted-foreground/60 mt-1">All products above reorder levels</p>
            </div>
          )}
        </div>

        {/* Revenue Forecast */}
        <div className="col-span-12 lg:col-span-6 rounded-xl border bg-card p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-500" />
            Revenue Forecast (Next 7 Days)
          </h3>
          {revenueForecast ? (
            <>
              <div className="h-32 flex items-end justify-between gap-2">
                {revenueForecast.forecast.map((day) => {
                  const maxVal = Math.max(...revenueForecast.forecast.map(d => d.upper), 1);
                  const pct = (day.projected / maxVal) * 100;
                  const lowerPct = (day.lower / maxVal) * 100;
                  return (
                    <div key={day.day} className="flex-1 flex flex-col items-center justify-end h-full relative">
                      <div
                        className="w-full max-w-[24px] rounded-t bg-emerald-500/30 absolute"
                        style={{ height: `${Math.max(pct, 4)}%`, bottom: 0 }}
                      />
                      <div
                        className="w-full max-w-[24px] rounded-t bg-emerald-500/60"
                        style={{ height: `${Math.max(pct, 4)}%`, bottom: 0 }}
                      />
                      <div
                        className="w-full max-w-[24px] rounded-t bg-emerald-500/10 absolute"
                        style={{ height: `${Math.max(lowerPct, 2)}%`, bottom: 0 }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-3 text-[10px] text-muted-foreground uppercase font-semibold">
                {revenueForecast.forecast.map((day) => (
                  <span key={day.day}>D+{day.day}</span>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
                <span>30-day avg: Rs. {revenueForecast.avgDaily.toFixed(0)}</span>
                <span>7-day avg: Rs. {revenueForecast.recentAvg.toFixed(0)}</span>
                <span className={`capitalize font-medium ${
                  revenueForecast.trend === 'increasing' ? 'text-emerald-500' :
                  revenueForecast.trend === 'decreasing' ? 'text-red-500' : ''
                }`}>
                  {revenueForecast.trend}
                </span>
              </div>
            </>
          ) : (
            <div className="py-8 text-center">
              <LineChart className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Loading forecast...</p>
            </div>
          )}
        </div>
      </div>

      {/* Occupancy Forecast */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6 rounded-xl border bg-card p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-cyan-500" />
            Occupancy Forecast
          </h3>
          {occupancyForecast ? (
            <>
              <div className="h-32 flex items-end justify-between gap-2">
                {occupancyForecast.forecast.slice(0, 7).map((day) => {
                  const pct = Math.min(day.occupancyRate, 100);
                  return (
                    <div key={day.date} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div
                        className="w-full max-w-[28px] rounded-t bg-cyan-500/60"
                        style={{ height: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-3 text-[10px] text-muted-foreground uppercase font-semibold">
                {occupancyForecast.forecast.slice(0, 7).map((day) => {
                  const d = new Date(day.date);
                  return <span key={day.date}>{DAY_NAMES[d.getDay()]}</span>;
                })}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
                <span>Total rooms: {String(occupancyForecast.totalRooms)}</span>
                <span>
                  Avg: {(occupancyForecast.forecast.reduce((s, d) => s + d.occupancyRate, 0) / occupancyForecast.forecast.length).toFixed(0)}%
                </span>
              </div>
            </>
          ) : (
            <div className="py-8 text-center">
              <Calendar className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Loading forecast...</p>
            </div>
          )}
        </div>

        {/* Stock Movement Trends */}
        <div className="col-span-12 lg:col-span-6 rounded-xl border bg-card p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-orange-500" />
            Stock Movement Trends
          </h3>
          {stockMovements && Object.keys(stockMovements).length > 0 ? (
            <>
              <div className="h-32 flex items-end justify-between gap-1">
                {Object.entries(stockMovements).slice(-14).map(([date, types]) => {
                  const total = Object.values(types).reduce((s, v) => s + v, 0);
                  const allTotals = Object.values(stockMovements).flatMap(d => Object.values(d));
                  const maxTotal = Math.max(...allTotals, 1);
                  const pct = (total / maxTotal) * 100;
                  return (
                    <div key={date} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div
                        className="w-full max-w-[16px] rounded-t bg-orange-500/60"
                        style={{ height: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 text-xs text-muted-foreground border-t pt-3">
                <span>Total movement types: {
                  Object.values(stockMovements).reduce((acc, types) => {
                    Object.keys(types).forEach(t => acc.add(t));
                    return acc;
                  }, new Set<string>()).size
                }</span>
              </div>
            </>
          ) : (
            <div className="py-8 text-center">
              <Package className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No stock movement data</p>
            </div>
          )}
        </div>
      </div>

      {/* Kitchen Live Status */}
      <div className="rounded-xl border bg-card p-6 border-l-4 border-cyan-500">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h4 className="text-sm font-semibold">Kitchen Live Status</h4>
              <p className="text-xs text-muted-foreground">Efficiency tracking</p>
            </div>
          </div>
          <div className="flex gap-6">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Active Orders</p>
              <p className="text-lg font-bold">{kitchenOrders.length}</p>
            </div>
            <div className="w-px bg-border" />
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Avg Order</p>
              <p className="text-lg font-bold text-emerald-400">Rs. {avgOrderValue.toFixed(2)}</p>
            </div>
            <div className="w-px bg-border" />
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Pending Rev</p>
              <p className="text-lg font-bold">Rs. {pendingRevenue.toFixed(0)}</p>
            </div>
            <div className="w-px bg-border" />
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Low Stock</p>
              <p className={`text-lg font-bold ${lowStockProducts && lowStockProducts.length > 0 ? 'text-amber-500' : ''}`}>
                {lowStockProducts?.length ?? 0}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
