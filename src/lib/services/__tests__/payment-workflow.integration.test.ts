import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllMocks, setRpcHandler, getRpcCallHistory } from '../../core/__tests__/setup';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn() },
  attachLogStore: vi.fn(),
}));

const refreshFromOrders = vi.fn().mockResolvedValue(undefined);
vi.mock('../table-state', () => ({ refreshFromOrders }));

type MockChain = {
  eq: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  then: (onfulfilled?: (value: unknown) => unknown, onrejected?: (reason: unknown) => never) => Promise<unknown>;
  catch: ReturnType<typeof vi.fn>;
};

function makeMockChain<T>(data: T): MockChain {
  const chain: Partial<MockChain> = {};
  chain.eq = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.single = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.not = vi.fn(() => chain);
  chain.then = (resolve?: (v: unknown) => unknown) =>
    Promise.resolve({ data, error: null }).then(resolve);
  chain.catch = vi.fn(() => chain);
  return chain as MockChain;
}

beforeEach(() => {
  clearAllMocks();
  refreshFromOrders.mockClear();
});

describe('markInvoicePaidAndSync — integration', () => {
  it('should complete active orders, close session, refresh table, and fire system event', async () => {
    setRpcHandler('transition_order_status', () => ({ data: { success: true }, error: null }));
    setRpcHandler('create_system_event', () => ({ data: {}, error: null }));

    const { insforge } = await import('../../core/insforge');
    vi.mocked(insforge.database.from)
      .mockImplementationOnce(() => makeMockChain([{ id: 'order-1' }]))   // orders query
      .mockImplementationOnce(() => makeMockChain({ id: 'session-1' }))   // sessions query
      .mockImplementationOnce(() => makeMockChain(undefined));             // session update

    const { markInvoicePaidAndSync } = await import('../payment-workflow');
    await markInvoicePaidAndSync('inv-1', 'table-1');

    const calls = getRpcCallHistory();
    const transitionCalls = calls.filter(c => c.name === 'transition_order_status');
    expect(transitionCalls).toHaveLength(1);
    expect(transitionCalls[0].params).toMatchObject({
      p_order_id: 'order-1',
      p_new_status: 'completed',
    });

    expect(refreshFromOrders).toHaveBeenCalledWith('table-1');

    const sessionUpdate = vi.mocked(insforge.database.from).mock.calls
      .find(c => c[0] === 'table_sessions');
    expect(sessionUpdate).toBeDefined();

    const systemEventCalls = calls.filter(c => c.name === 'create_system_event');
    expect(systemEventCalls).toHaveLength(1);
    expect(systemEventCalls[0].params).toMatchObject({
      p_event_type: 'PAYMENT_PROCESSED',
      p_entity_id: 'inv-1',
    });
  });

  it('should auto-detect active session when sessionId not provided', async () => {
    setRpcHandler('transition_order_status', () => ({ data: { success: true }, error: null }));
    setRpcHandler('create_system_event', () => ({ data: {}, error: null }));

    const { insforge } = await import('../../core/insforge');
    vi.mocked(insforge.database.from)
      .mockImplementationOnce(() => makeMockChain([{ id: 'order-1' }]))   // orders
      .mockImplementationOnce(() => makeMockChain({ id: 'session-99' }))  // session lookup
      .mockImplementationOnce(() => makeMockChain(undefined));             // session update

    const { markInvoicePaidAndSync } = await import('../payment-workflow');
    await markInvoicePaidAndSync('inv-2', 'table-1');

    const fromCalls = vi.mocked(insforge.database.from).mock.calls;
    const sessionQueryCall = fromCalls.find(c =>
      c[0] === 'table_sessions' && c[1] === undefined
    );
    expect(sessionQueryCall).toBeDefined();

    expect(refreshFromOrders).toHaveBeenCalledWith('table-1');
  });

  it('should handle no active orders gracefully (no transition calls)', async () => {
    setRpcHandler('transition_order_status', () => ({ data: { success: true }, error: null }));
    setRpcHandler('create_system_event', () => ({ data: {}, error: null }));

    const { insforge } = await import('../../core/insforge');
    vi.mocked(insforge.database.from)
      .mockImplementationOnce(() => makeMockChain([]))                     // no orders
      .mockImplementationOnce(() => makeMockChain({ id: 'session-1' }))
      .mockImplementationOnce(() => makeMockChain(undefined));

    const { markInvoicePaidAndSync } = await import('../payment-workflow');
    await markInvoicePaidAndSync('inv-3', 'table-2');

    const transitionCalls = getRpcCallHistory()
      .filter(c => c.name === 'transition_order_status');
    expect(transitionCalls).toHaveLength(0);

    const systemEventCalls = getRpcCallHistory()
      .filter(c => c.name === 'create_system_event');
    expect(systemEventCalls).toHaveLength(1);
  });

  it('should not release table when called without tableId', async () => {
    setRpcHandler('create_system_event', () => ({ data: {}, error: null }));

    const { markInvoicePaidAndSync } = await import('../payment-workflow');
    await markInvoicePaidAndSync('inv-4');

    expect(refreshFromOrders).not.toHaveBeenCalled();
    const transitionCalls = getRpcCallHistory()
      .filter(c => c.name === 'transition_order_status');
    expect(transitionCalls).toHaveLength(0);
  });
});
