import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clearAllMocks } from '../../core/__tests__/setup';

const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('../../core/insforge', () => ({
  insforge: {
    database: { rpc: mockRpc },
  },
}));

vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn() },
  attachLogStore: vi.fn(),
}));

vi.mock('../telemetry', () => ({
  getCorrelationId: vi.fn(() => 'corr-id'),
}));

describe('audit.service', () => {
  beforeEach(() => {
    clearAllMocks();
    mockRpc.mockReset();
    localStorage.clear();
  });

  describe('generateDiff', () => {
    it('should detect changed fields', async () => {
      const { generateDiff } = await import('../audit.service');
      const diff = generateDiff({ name: 'Old', price: 100 }, { name: 'New', price: 100 });
      expect(diff.name).toBeDefined();
      expect(diff.name.from).toBe('Old');
      expect(diff.name.to).toBe('New');
      expect(diff.price).toBeUndefined();
    });

    it('should detect added fields', async () => {
      const { generateDiff } = await import('../audit.service');
      const diff = generateDiff({ name: 'Test' }, { name: 'Test', status: 'active' });
      expect(diff.status).toBeDefined();
      expect(diff.status.from).toBeUndefined();
      expect(diff.status.to).toBe('active');
    });

    it('should return empty for identical objects', async () => {
      const { generateDiff } = await import('../audit.service');
      const diff = generateDiff({ a: 1, b: 2 }, { a: 1, b: 2 });
      expect(Object.keys(diff).length).toBe(0);
    });

    it('should handle null objects', async () => {
      const { generateDiff } = await import('../audit.service');
      const diff = generateDiff(null, { a: 1 });
      expect(diff.a).toBeDefined();
      expect(diff.a.from).toBeUndefined();
    });
  });

  describe('captureSnapshot', () => {
    it('should return a shallow copy', async () => {
      const { captureSnapshot } = await import('../audit.service');
      const original = { name: 'Test', nested: { value: 1 } };
      const snap = captureSnapshot(original);
      expect(snap).toEqual(original);
      expect(snap).not.toBe(original);
    });
  });

  describe('writeAuditLog', () => {
    function setJwt() {
      const header = btoa(JSON.stringify({ alg: 'HS256' }));
      const payload = btoa(JSON.stringify({ sub: 'user-1' }));
      localStorage.setItem('insforge-auth-token', `${header}.${payload}.sig`);
    }

    it('should call the write_frontend_audit RPC with correct params', async () => {
      setJwt();
      mockRpc.mockResolvedValue({ data: { success: true }, error: null });
      const { writeAuditLog } = await import('../audit.service');
      await writeAuditLog({
        action: 'LOGIN',
        entity_type: 'user',
        entity_id: 'user-1',
        metadata: { email: 'test@test.com' },
      });
      expect(mockRpc).toHaveBeenCalledWith('write_frontend_audit', expect.objectContaining({
        p_action: 'LOGIN',
        p_entity_type: 'user',
      }));
    });

    it('should handle RPC errors gracefully', async () => {
      setJwt();
      mockRpc.mockRejectedValue(new Error('DB error'));
      const { writeAuditLog } = await import('../audit.service');
      await expect(writeAuditLog({
        action: 'TEST', entity_type: 'test', entity_id: '1',
      })).resolves.not.toThrow();
    });
  });

  describe('AuditActions / AuditEntityTypes constants', () => {
    it('should export expected constants', async () => {
      const mod = await import('../audit.service');
      expect(mod.AuditActions.LOGIN).toBe('LOGIN');
      expect(mod.AuditActions.LOGOUT).toBe('LOGOUT');
      expect(mod.AuditActions.CREATE).toBe('CREATE');
      expect(mod.AuditActions.UPDATE).toBe('UPDATE');
      expect(mod.AuditEntityTypes.USER).toBe('user');
      expect(mod.AuditEntityTypes.ORDER).toBe('order');
    });
  });

  describe('createAuditEntry', () => {
    it('should create a formatted entry', async () => {
      const { createAuditEntry, AuditActions, AuditEntityTypes } = await import('../audit.service');
      const entry = createAuditEntry(AuditActions.CREATE, AuditEntityTypes.ORDER, 'order-1', {
        new_state: { total: 100 },
        event_type: 'ORDER_CREATED',
      });
      expect(entry.action).toBe('CREATE');
      expect(entry.entity_type).toBe('order');
      expect(entry.entity_id).toBe('order-1');
      expect(entry.new_state).toEqual({ total: 100 });
    });
  });
});
