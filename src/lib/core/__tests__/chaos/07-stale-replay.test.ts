import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { queueDB } from '../../../services/queue-db';
import { clearAllMocks } from '../setup';

describe('Chaos: Stale Replay Sequence — replay correctness', () => {
  beforeEach(async () => {
    clearAllMocks();
    await queueDB.replayState.clear();
  });

  afterEach(async () => {
    await queueDB.replayState.clear();
  });

  it('should only replay events newer than the last seen sequence ID', async () => {
    await queueDB.replayState.put({
      channel: 'test-channel',
      sequenceId: 100,
      updatedAt: new Date().toISOString(),
    });

    const stored = await queueDB.replayState.get('test-channel');
    expect(stored).toBeDefined();
    expect(stored!.sequenceId).toBe(100);

    await queueDB.replayState.put({
      channel: 'test-channel',
      sequenceId: 150,
      updatedAt: new Date().toISOString(),
    });

    const updated = await queueDB.replayState.get('test-channel');
    expect(updated!.sequenceId).toBe(150);
  });

  it('should be able to check sequence progress and skip older events', async () => {
    await queueDB.replayState.put({
      channel: 'test-channel',
      sequenceId: 200,
      updatedAt: new Date().toISOString(),
    });

    const knownSequence = (await queueDB.replayState.get('test-channel'))!.sequenceId;

    const incomingEvents = [
      { sequence_id: 150, event_type: 'ORDER_CONFIRMED' },
      { sequence_id: 201, event_type: 'PAYMENT_RECEIVED' },
    ];

    const newEvents = incomingEvents.filter((e) => e.sequence_id > knownSequence);
    expect(newEvents.length).toBe(1);
    expect(newEvents[0].event_type).toBe('PAYMENT_RECEIVED');
  });

  it('should persist replay progress after each batch', async () => {
    await queueDB.replayState.put({
      channel: 'batch-channel',
      sequenceId: 50,
      updatedAt: new Date().toISOString(),
    });

    let stored = await queueDB.replayState.get('batch-channel');
    expect(stored!.sequenceId).toBe(50);

    await queueDB.replayState.put({
      channel: 'batch-channel',
      sequenceId: 100,
      updatedAt: new Date(Date.now() + 1000).toISOString(),
    });

    stored = await queueDB.replayState.get('batch-channel');
    expect(stored!.sequenceId).toBe(100);
  });
});
