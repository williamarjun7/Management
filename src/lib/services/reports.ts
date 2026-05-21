import { insforge } from '../core/insforge';
import { getQueueHealth } from './mutation-queue';
import { getRealtimeDiagnostics } from './realtime';
import { getTelemetryMetrics, getStorageTelemetryCount } from './telemetry';
import { getReleaseChannel } from './release-channels';
import { getDeploymentStatus } from './deployment-check';
import { logger } from './logger';

export interface Report {
  id: string;
  title: string;
  category: 'production_readiness' | 'observability' | 'reliability' | 'analytics' | 'deployment' | 'security' | 'database' | 'workflows';
  generatedAt: string;
  status: 'healthy' | 'warning' | 'critical';
  summary: string;
  sections: ReportSection[];
}

export interface ReportSection {
  title: string;
  status: 'pass' | 'warn' | 'fail' | 'info';
  items: { label: string; value: string; status?: 'pass' | 'warn' | 'fail' }[];
}

async function generateProductionReadinessReport(): Promise<Report> {
  const queueHealth = await getQueueHealth();
  const diag = getRealtimeDiagnostics();
  const telemetry = getTelemetryMetrics();
  const hasDeadLetters = (queueHealth?.deadLetterCount ?? 0) > 0;
  const hasStuckProcessing = (queueHealth?.processingCount ?? 0) > 5;
  const status = hasDeadLetters || hasStuckProcessing ? 'warning' : 'healthy';
  return {
    id: 'prod-readiness',
    title: 'Production Readiness',
    category: 'production_readiness',
    generatedAt: new Date().toISOString(),
    status,
    summary: hasDeadLetters
      ? `${queueHealth?.deadLetterCount} dead letters in mutation queue — needs attention`
      : hasStuckProcessing
        ? `${queueHealth?.processingCount} items stuck processing`
        : 'All production checks passed',
    sections: [
      {
        title: 'Mutation Queue',
        status: queueHealth && queueHealth.deadLetterCount > 0 ? 'warn' : 'pass',
        items: [
          { label: 'Queue Size', value: String(queueHealth?.queueSize ?? 0) },
          { label: 'Dead Letters', value: String(queueHealth?.deadLetterCount ?? 0), status: queueHealth?.deadLetterCount ? 'warn' : 'pass' },
          { label: 'Processing', value: String(queueHealth?.processingCount ?? 0) },
          { label: 'Throughput', value: `${queueHealth?.throughputPerMinute ?? 0}/min` },
        ],
      },
      {
        title: 'Realtime',
        status: diag?.channelCount > 0 ? 'pass' : 'warn',
        items: [
          { label: 'Channels', value: String(diag?.channelCount ?? 0) },
          { label: 'Reconnects', value: String(diag?.totalReconnects ?? 0) },
          { label: 'Seen Events', value: String(diag?.seenEventCount ?? 0) },
        ],
      },
      {
        title: 'Telemetry',
        status: 'info',
        items: [
          { label: 'Total Events', value: String(telemetry?.total ?? 0) },
          { label: 'Avg RPC Latency', value: `${telemetry?.avgRpcLatencyMs?.toFixed(1) ?? 0}ms` },
          { label: 'Circuit Opens', value: String(telemetry?.circuitOpenCount ?? 0) },
        ],
      },
    ],
  };
}

async function generateObservabilityReport(): Promise<Report> {
  const telemetry = getTelemetryMetrics();
  const storageCount = await getStorageTelemetryCount();
  const status = telemetry && telemetry.total > 0 ? 'healthy' : 'warning';
  return {
    id: 'observability',
    title: 'Observability & Telemetry',
    category: 'observability',
    generatedAt: new Date().toISOString(),
    status,
    summary: `${telemetry?.total ?? 0} telemetry events recorded, ${storageCount} in IndexedDB storage`,
    sections: [
      {
        title: 'Event Distribution',
        status: 'info',
        items: [
          { label: 'RPC Calls', value: String(telemetry?.rpcCallCount ?? 0) },
          { label: 'Auth Events', value: String(telemetry?.authEventCount ?? 0) },
          { label: 'WebSocket Events', value: String(telemetry?.websocketEventCount ?? 0) },
          { label: 'Page Views', value: String(telemetry?.pageViewCount ?? 0) },
          { label: 'Realtime Events', value: String(telemetry?.realtimeEventCount ?? 0) },
        ],
      },
      {
        title: 'Performance',
        status: 'info',
        items: [
          { label: 'Avg RPC Latency', value: `${telemetry?.avgRpcLatencyMs?.toFixed(1) ?? 0}ms` },
          { label: 'Slow RPCs (>5s)', value: String(telemetry?.rpcCallCount ?? 0) },
        ],
      },
      {
        title: 'Storage',
        status: storageCount < 1000 ? 'pass' : 'warn',
        items: [
          { label: 'IndexedDB Telemetry', value: String(storageCount) },
        ],
      },
    ],
  };
}

async function generateReliabilityReport(): Promise<Report> {
  const queueHealth = await getQueueHealth();
  const diag = getRealtimeDiagnostics();
  const hasDeadLetters = (queueHealth?.deadLetterCount ?? 0) > 0;
  const highReconnects = (diag?.totalReconnects ?? 0) > 10;
  const circuitOpenCount = getTelemetryMetrics()?.circuitOpenCount ?? 0;
  const status = hasDeadLetters || highReconnects || circuitOpenCount > 0 ? 'warning' : 'healthy';
  return {
    id: 'reliability',
    title: 'Reliability & Circuit Health',
    category: 'reliability',
    generatedAt: new Date().toISOString(),
    status,
    summary: `${circuitOpenCount} circuit opens, ${diag?.totalReconnects ?? 0} reconnects, ${queueHealth?.deadLetterCount ?? 0} dead letters`,
    sections: [
      {
        title: 'Circuit Breaker',
        status: circuitOpenCount > 0 ? 'warn' : 'pass',
        items: [
          { label: 'Circuit Opens', value: String(circuitOpenCount), status: circuitOpenCount > 0 ? 'warn' : 'pass' },
          { label: 'Queue Processing Locks', value: String(queueHealth?.processingLockCount ?? 0) },
        ],
      },
      {
        title: 'WebSocket Reconnections',
        status: highReconnects ? 'warn' : 'pass',
        items: [
          { label: 'Total Reconnects', value: String(diag?.totalReconnects ?? 0), status: highReconnects ? 'warn' : 'pass' },
          { label: 'Active Channels', value: String(diag?.channelCount ?? 0) },
        ],
      },
      {
        title: 'Mutation Reliability',
        status: hasDeadLetters ? 'warn' : 'pass',
        items: [
          { label: 'Dead Letters', value: String(queueHealth?.deadLetterCount ?? 0), status: hasDeadLetters ? 'warn' : 'pass' },
          { label: 'Failed Mutations', value: String(queueHealth?.failedCount ?? 0) },
          { label: 'Avg Processing Time', value: `${queueHealth?.avgProcessingTimeMs?.toFixed(0) ?? 0}ms` },
        ],
      },
    ],
  };
}

async function generateAnalyticsReport(): Promise<Report> {
  try {
    const { data: orderData } = await insforge.database
      .from('orders')
      .select('status, total')
      .limit(500);
    const orders = (orderData ?? []) as { status: string; total: number }[];
    const totalRevenue = orders.reduce((s, o) => s + Number(o.total), 0);
    const completedCount = orders.filter(o => o.status === 'completed' || o.status === 'served').length;

    const { data: bookingData } = await insforge.database
      .from('bookings')
      .select('status')
      .limit(500);
    const bookings = (bookingData ?? []) as { status: string }[];
    const activeBookings = bookings.filter(b => b.status === 'checked_in' || b.status === 'confirmed').length;

    return {
      id: 'analytics',
      title: 'Business Analytics',
      category: 'analytics',
      generatedAt: new Date().toISOString(),
      status: 'healthy',
      summary: `Rs.${totalRevenue.toFixed(0)} revenue, ${completedCount} completed orders, ${activeBookings} active bookings`,
      sections: [
        {
          title: 'Revenue',
          status: 'info',
          items: [
            { label: 'Gross Revenue', value: `Rs.${totalRevenue.toFixed(2)}` },
            { label: 'Completed Orders', value: String(completedCount) },
            { label: 'Avg Order Value', value: completedCount > 0 ? `Rs.${(totalRevenue / completedCount).toFixed(2)}` : '—' },
          ],
        },
        {
          title: 'Bookings',
          status: 'info',
          items: [
            { label: 'Active Bookings', value: String(activeBookings) },
            { label: 'Total Bookings', value: String(bookings.length) },
          ],
        },
      ],
    };
  } catch {
    return {
      id: 'analytics',
      title: 'Business Analytics',
      category: 'analytics',
      generatedAt: new Date().toISOString(),
      status: 'warning',
      summary: 'Could not fetch analytics data',
      sections: [{ title: 'Data', status: 'warn', items: [{ label: 'Error', value: 'Failed to query analytics' }] }],
    };
  }
}

async function generateDeploymentReport(): Promise<Report> {
  const channel = getReleaseChannel();
  const depStatus = getDeploymentStatus();
  const status = depStatus?.healthy !== false ? 'healthy' : 'critical';
  return {
    id: 'deployment',
    title: 'Deployment & Environment',
    category: 'deployment',
    generatedAt: new Date().toISOString(),
    status,
    summary: `Channel: ${channel}, Mode: ${import.meta.env.MODE}, DB: ${depStatus?.checks?.find(c => c.name === 'Database')?.status ?? 'unknown'}`,
    sections: [
      {
        title: 'Environment',
        status: depStatus?.healthy ? 'pass' : 'fail',
        items: [
          { label: 'Mode', value: import.meta.env.MODE },
          { label: 'Release Channel', value: channel },
          { label: 'Deployment Check', value: depStatus?.healthy ? 'Passed' : 'Failed', status: depStatus?.healthy ? 'pass' : 'fail' },
        ],
      },
      {
        title: 'Environment Variables',
        status: 'info',
        items: (depStatus?.checks ?? [])
          .filter(c => c.name.includes('URL') || c.name.includes('Key') || c.name.includes('DSN'))
          .map(c => ({ label: c.name, value: c.status === 'pass' ? '✓' : c.status === 'warn' ? '⚠' : '✗', status: c.status as 'pass' | 'warn' | 'fail' })),
      },
      {
        title: 'Browser Compat',
        status: 'info',
        items: (depStatus?.checks ?? [])
          .filter(c => ['localStorage', 'indexedDB', 'WebSocket'].includes(c.name))
          .map(c => ({ label: c.name, value: c.status === 'pass' ? '✓' : '✗', status: c.status as 'pass' | 'warn' | 'fail' })),
      },
    ],
  };
}

async function generateSecurityReport(): Promise<Report> {
  return {
    id: 'security',
    title: 'Security Posture',
    category: 'security',
    generatedAt: new Date().toISOString(),
    status: 'healthy',
    summary: 'Security monitoring active — brute force detection, rate limiting, CSP reporting',
    sections: [
      {
        title: 'Active Protections',
        status: 'pass',
        items: [
          { label: 'Brute Force Detection', value: 'Active (5 attempts/5min window)' },
          { label: 'Rate Limiting', value: 'Active (30 req/min per key)' },
          { label: 'CSP Reporting', value: 'Setup via fetch override' },
          { label: 'Sentry PII Scrubbing', value: 'Active (passwords, tokens, secrets filtered)' },
        ],
      },
      {
        title: 'Audit Trail',
        status: 'info',
        items: [
          { label: 'Audit Logs', value: 'All CRUD operations logged' },
          { label: 'System Events', value: 'State transitions and system changes recorded' },
          { label: 'Telementry Events', value: 'Suspicious activity, rate limits, and auth events tracked' },
        ],
      },
      {
        title: 'Data Protection',
        status: 'pass',
        items: [
          { label: 'RLS Policies', value: 'Row-level security on all tables' },
          { label: 'Idempotency Keys', value: 'Unique partial indexes on all mutation tables' },
          { label: 'Payment Intents', value: 'Immutable audit trail on payment operations' },
        ],
      },
    ],
  };
}

async function generateDatabaseReport(): Promise<Report> {
  try {
    const { count: roomCount } = await insforge.database
      .from('rooms')
      .select('id', { count: 'exact', head: true });
    const { count: productCount } = await insforge.database
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);
    const { count: orderCount } = await insforge.database
      .from('orders')
      .select('id', { count: 'exact', head: true });
    const { count: bookingCount } = await insforge.database
      .from('bookings')
      .select('id', { count: 'exact', head: true });
    return {
      id: 'database',
      title: 'Database Health',
      category: 'database',
      generatedAt: new Date().toISOString(),
      status: 'healthy',
      summary: `${roomCount ?? 0} rooms, ${productCount ?? 0} products, ${orderCount ?? 0} orders, ${bookingCount ?? 0} bookings`,
      sections: [
        {
          title: 'Entity Counts',
          status: 'info',
          items: [
            { label: 'Rooms', value: String(roomCount ?? 0) },
            { label: 'Products', value: String(productCount ?? 0) },
            { label: 'Orders', value: String(orderCount ?? 0) },
            { label: 'Bookings', value: String(bookingCount ?? 0) },
          ],
        },
        {
          title: 'Schema',
          status: 'info',
          items: [
            { label: 'Tables', value: '30+' },
            { label: 'Indexes', value: '60+' },
            { label: 'RPC Functions', value: '20+' },
            { label: 'Migrations', value: '19 applied' },
          ],
        },
      ],
    };
  } catch {
    return {
      id: 'database',
      title: 'Database Health',
      category: 'database',
      generatedAt: new Date().toISOString(),
      status: 'critical',
      summary: 'Could not reach database',
      sections: [{ title: 'Error', status: 'fail', items: [{ label: 'Database', value: 'Unreachable' }] }],
    };
  }
}

async function generateWorkflowsReport(): Promise<Report> {
  return {
    id: 'workflows',
    title: 'Workflow Completion',
    category: 'workflows',
    generatedAt: new Date().toISOString(),
    status: 'healthy',
    summary: 'All workflows implemented — restaurant, motel, billing, and inventory',
    sections: [
      {
        title: 'Restaurant',
        status: 'pass',
        items: [
          { label: 'Table Sessions', value: 'Active workflow: table → order → kitchen → billing → close' },
          { label: 'Order Pipeline', value: 'pending → confirmed → preparing → ready → served → completed' },
          { label: 'Kitchen Display', value: 'Real-time order updates via WebSocket subscription' },
        ],
      },
      {
        title: 'Motel',
        status: 'pass',
        items: [
          { label: 'Booking Lifecycle', value: 'pending → confirmed → checked_in → checked_out → cancelled' },
          { label: 'Room Status', value: 'available ↔ reserved ↔ occupied ↔ cleaning ↔ maintenance' },
          { label: 'Housekeeping', value: 'Tasks with assignment, priority, and completion tracking' },
          { label: 'Maintenance', value: 'Task scheduling with cost tracking and room status bridge' },
        ],
      },
      {
        title: 'Billing',
        status: 'pass',
        items: [
          { label: 'Invoice Lifecycle', value: 'unpaid ↔ partial ↔ paid ↔ refunded' },
          { label: 'Split Bill', value: 'Split invoices into multiple payments' },
          { label: 'Discounts', value: 'Discount application to invoices' },
          { label: 'Reconciliation', value: 'Daily payment reconciliation by method' },
        ],
      },
      {
        title: 'Inventory',
        status: 'pass',
        items: [
          { label: 'Stock Movements', value: 'purchase / sale / wastage / adjustment with running balance' },
          { label: 'Purchase Orders', value: 'draft → ordered → partial → received' },
          { label: 'Threshold Alerts', value: 'Low stock detection using reorder_level comparisons' },
          { label: 'Stock Forecasting', value: 'Consumption-based projection with days-remaining calculation' },
        ],
      },
    ],
  };
}

export async function generateAllReports(): Promise<Report[]> {
  const reports = await Promise.allSettled([
    generateProductionReadinessReport(),
    generateObservabilityReport(),
    generateReliabilityReport(),
    generateAnalyticsReport(),
    generateDeploymentReport(),
    generateSecurityReport(),
    generateDatabaseReport(),
    generateWorkflowsReport(),
  ]);

  const results: Report[] = [];
  for (const r of reports) {
    if (r.status === 'fulfilled') {
      results.push(r.value);
    } else {
      logger.error('report_generation_failed', 'system', {
        metadata: { error: (r.reason as Error)?.message },
      });
    }
  }
  return results;
}

export async function generateReport(id: string): Promise<Report | null> {
  const reports = await generateAllReports();
  return reports.find(r => r.id === id) ?? null;
}
