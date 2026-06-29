import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn() },
  attachLogStore: vi.fn(),
}));

vi.mock('../mutation-queue', () => ({
  getQueueHealth: vi.fn().mockResolvedValue({
    queueSize: 5, deadLetterCount: 0, processingCount: 2,
    throughputPerMinute: 10, processingLockCount: 1,
    failedCount: 0, avgProcessingTimeMs: 150,
  }),
}));

vi.mock('../realtime', () => ({
  getRealtimeDiagnostics: vi.fn().mockReturnValue({
    channelCount: 3, totalReconnects: 2, seenEventCount: 100,
  }),
}));

vi.mock('../telemetry', () => ({
  getTelemetryMetrics: vi.fn().mockReturnValue({
    total: 500, rpcCallCount: 50, avgRpcLatencyMs: 200,
    circuitOpenCount: 0, authEventCount: 10, websocketEventCount: 20,
    pageViewCount: 100, realtimeEventCount: 30,
    avgKitchenPrepMs: 5000, avgPaymentMs: 2000,
  }),
  getStorageTelemetryCount: vi.fn().mockResolvedValue(150),
}));

vi.mock('../release-channels', () => ({
  getReleaseChannel: vi.fn().mockReturnValue('stable'),
}));

vi.mock('../deployment-check', () => ({
  getDeploymentStatus: vi.fn().mockReturnValue({
    healthy: true,
    checks: [
      { name: 'Database', status: 'pass' },
      { name: 'VITE_INSFORGE_URL', status: 'pass' },
      { name: 'localStorage', status: 'pass' },
    ],
  }),
}));

const mockFrom = vi.fn();

vi.mock('../../core/insforge', () => ({
  insforge: {
    database: {
      from: mockFrom,
      rpc: vi.fn(),
      select: vi.fn(),
    },
  },
}));

describe('reports', () => {
  beforeEach(() => { vi.clearAllMocks(); mockFrom.mockReset(); });

  async function importModule() {
    vi.resetModules();
    return await import('../reports');
  }

  function makeChain(resolvedValue: unknown) {
    const chain = {
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    };
    const resolve = (val: unknown) => Promise.resolve({ data: val, error: null, count: null });
    chain.select.mockResolvedValue(resolve(resolvedValue));
    chain.limit.mockResolvedValue(resolve(resolvedValue));
    return chain;
  }

  describe('generateAllReports', () => {
    it('should generate all 8 reports', async () => {
      const orders = [{ status: 'completed', total: 500 }];
      const bookings = [{ status: 'confirmed' }];
      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) return makeChain(orders);
        return makeChain(bookings);
      });

      const { generateAllReports } = await importModule();
      const reports = await generateAllReports();
      expect(reports.length).toBe(8);
      const categories = reports.map(r => r.category);
      expect(categories).toContain('production_readiness');
      expect(categories).toContain('security');
      expect(categories).toContain('analytics');
      expect(categories).toContain('deployment');
    });

    it('should include production readiness section in report', async () => {
      const orders = [{ status: 'completed', total: 500 }];
      const bookings = [{ status: 'confirmed' }];
      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) return makeChain(orders);
        return makeChain(bookings);
      });

      const { generateAllReports } = await importModule();
      const reports = await generateAllReports();
      const prodReport = reports.find(r => r.id === 'prod-readiness');
      expect(prodReport).toBeDefined();
      expect(prodReport!.category).toBe('production_readiness');
      expect(prodReport!.sections.length).toBeGreaterThanOrEqual(3);
    });

    it('should reflect dead letters in production readiness', async () => {
      const mq = await import('../mutation-queue');
      (mq.getQueueHealth as any).mockResolvedValue({
        queueSize: 10, deadLetterCount: 3, processingCount: 1,
      });
      const orders = [{ status: 'completed', total: 500 }];
      const bookings = [{ status: 'confirmed' }];
      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) return makeChain(orders);
        return makeChain(bookings);
      });

      const { generateAllReports } = await importModule();
      const reports = await generateAllReports();
      const prodReport = reports.find(r => r.id === 'prod-readiness');
      expect(prodReport!.status).toBe('warning');
    });
  });

  describe('generateReport', () => {
    it('should generate a specific report by id', async () => {
      const orders = [{ status: 'completed', total: 500 }];
      const bookings = [{ status: 'confirmed' }];
      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) return makeChain(orders);
        return makeChain(bookings);
      });

      const { generateReport } = await importModule();
      const report = await generateReport('reliability');
      expect(report?.id).toBe('reliability');
    });

    it('should handle database error gracefully', async () => {
      const chain = makeChain([]);
      chain.select.mockResolvedValue({ data: null, error: new Error('DB fail') });
      mockFrom.mockReturnValue(chain);

      const { generateReport } = await importModule();
      const report = await generateReport('analytics');
      expect(report).not.toBeNull();
    });

    it('should return null for unknown id', async () => {
      const orders = [{ status: 'completed', total: 500 }];
      mockFrom.mockReturnValue(makeChain(orders));

      const { generateReport } = await importModule();
      const report = await generateReport('nonexistent');
      expect(report).toBeNull();
    });
  });
});
