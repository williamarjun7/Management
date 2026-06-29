import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn(), getTabId: vi.fn().mockReturnValue('tab-1'), getDeviceId: vi.fn().mockReturnValue('dev-1') },
  attachLogStore: vi.fn(),
}));

const TELEMETRY_KEY = 'highlands_telemetry';

describe('telemetry', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  async function importModule() {
    vi.resetModules();
    return await import('../telemetry');
  }

  describe('recordTelemetry', () => {
    it('should record a telemetry event', async () => {
      const { recordTelemetry, getTelemetry } = await importModule();
      recordTelemetry('order_confirmed', 'trace-1', { order_id: 'o1' });
      const events = getTelemetry();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('order_confirmed');
      expect(events[0].trace_id).toBe('trace-1');
    });

    it('should persist to localStorage', async () => {
      const { recordTelemetry } = await importModule();
      recordTelemetry('payment_success', 'trace-2');
      vi.advanceTimersByTime(2100);
      const raw = localStorage.getItem(TELEMETRY_KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed).toHaveLength(1);
    });

    it('should limit in-memory events to MAX_IN_MEMORY_EVENTS', async () => {
      const { recordTelemetry, getTelemetry } = await importModule();
      for (let i = 0; i < 250; i++) {
        recordTelemetry('page_view', `trace-${i}`);
      }
      const events = getTelemetry();
      expect(events.length).toBeLessThanOrEqual(200);
    });
  });

  describe('recordTelemetryWithWorkflow', () => {
    it('should record event with workflow context', async () => {
      const { recordTelemetryWithWorkflow, getTelemetry } = await importModule();
      recordTelemetryWithWorkflow('workflow_step', 'trace-3', 'wf-1', 'step-1');
      const events = getTelemetry('workflow_step');
      expect(events).toHaveLength(1);
      expect(events[0].workflow_id).toBe('wf-1');
      expect(events[0].workflow_step).toBe('step-1');
    });
  });

  describe('recordTelemetryBatch', () => {
    it('should record multiple events at once', async () => {
      const { recordTelemetryBatch, getTelemetry } = await importModule();
      recordTelemetryBatch([
        { type: 'page_view', trace_id: 't1' },
        { type: 'page_view', trace_id: 't2' },
      ]);
      const events = getTelemetry('page_view');
      expect(events).toHaveLength(2);
    });
  });

  describe('getTelemetry', () => {
    it('should filter by type', async () => {
      const { recordTelemetry, getTelemetry } = await importModule();
      recordTelemetry('order_confirmed', 't1');
      recordTelemetry('payment_success', 't2');
      const confirmed = getTelemetry('order_confirmed');
      expect(confirmed).toHaveLength(1);
      expect(confirmed[0].type).toBe('order_confirmed');
    });

    it('should filter by since timestamp', async () => {
      const { recordTelemetry, getTelemetry } = await importModule();
      recordTelemetry('order_confirmed', 't1');
      vi.advanceTimersByTime(60000);
      recordTelemetry('order_confirmed', 't2');
      const recent = getTelemetry('order_confirmed', Date.now() - 30000);
      expect(recent).toHaveLength(1);
      expect(recent[0].trace_id).toBe('t2');
    });
  });

  describe('getTelemetryMetrics', () => {
    it('should compute metrics from stored events', async () => {
      const { recordTelemetry, getTelemetryMetrics } = await importModule();
      recordTelemetry('page_view', 't1');
      recordTelemetry('order_confirmed', 't2');
      const metrics = getTelemetryMetrics();
      expect(metrics.total).toBe(2);
      expect(metrics.today).toBe(2);
      expect(metrics.pageViewCount).toBe(1);
    });

    it('should compute average kitchen prep time', async () => {
      const { recordTelemetry, getTelemetryMetrics } = await importModule();
      recordTelemetry('kitchen_prep_ready', 't1', { duration_ms: 5000 });
      recordTelemetry('kitchen_prep_ready', 't2', { duration_ms: 7000 });
      const metrics = getTelemetryMetrics();
      expect(metrics.avgKitchenPrepMs).toBe(6000);
    });

    it('should count reconnects and failures', async () => {
      const { recordTelemetry, getTelemetryMetrics } = await importModule();
      recordTelemetry('reconnect', 't1');
      recordTelemetry('mutation_failed', 't2');
      const metrics = getTelemetryMetrics();
      expect(metrics.reconnectCount).toBe(1);
      expect(metrics.failedMutationCount).toBe(1);
    });
  });

  describe('getTelemetrySummary', () => {
    it('should return metrics summary', async () => {
      const { recordTelemetry, getTelemetrySummary } = await importModule();
      recordTelemetry('page_view', 't1');
      const summary = getTelemetrySummary();
      expect(summary.total).toBe(1);
    });
  });

  describe('clearTelemetry', () => {
    it('should clear all telemetry events', async () => {
      const { recordTelemetry, getTelemetry, clearTelemetry } = await importModule();
      recordTelemetry('page_view', 't1');
      expect(getTelemetry()).toHaveLength(1);
      clearTelemetry();
      expect(getTelemetry()).toHaveLength(0);
    });
  });

  describe('generateCorrelationId', () => {
    it('should generate a correlation ID', async () => {
      const { generateCorrelationId } = await importModule();
      const id = generateCorrelationId();
      expect(id).toContain('-');
    });
  });

  describe('getCorrelationId', () => {
    it('should create and return session correlation ID', async () => {
      const { getCorrelationId } = await importModule();
      const id1 = getCorrelationId();
      const id2 = getCorrelationId();
      expect(id1).toBe(id2);
    });
  });

  describe('setCorrelationId / clearCorrelationId', () => {
    it('should set and clear correlation ID', async () => {
      const { setCorrelationId, clearCorrelationId, getCorrelationId } = await importModule();
      setCorrelationId('custom-id');
      expect(getCorrelationId()).toBe('custom-id');
      clearCorrelationId();
      expect(getCorrelationId()).not.toBe('custom-id');
    });
  });

  describe('generateWorkflowId', () => {
    it('should generate a workflow ID', async () => {
      const { generateWorkflowId } = await importModule();
      const id = generateWorkflowId();
      expect(id).toMatch(/^wf-/);
    });
  });
});
