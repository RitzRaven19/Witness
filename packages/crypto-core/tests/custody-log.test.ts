import { describe, it, expect } from 'vitest';
import {
  createLog,
  appendEvent,
  verifyLog,
  getCanonicalForm,
  CustodyLog,
  CustodyEvent,
} from '../src/custody-log.js';
import { hashFile } from '../src/hash.js';

describe('createLog', () => {
  it('creates empty log with correct evidenceId', () => {
    const log = createLog('evidence-123');
    expect(log.evidence_id).toBe('evidence-123');
    expect(log.events).toEqual([]);
  });
});

describe('appendEvent', () => {
  it('adds event with correct type and timestamp', async () => {
    const before = Date.now();
    const log = createLog('ev-1');
    const newLog = await appendEvent(log, 'captured');
    const after = Date.now();

    expect(newLog.events).toHaveLength(1);
    expect(newLog.events[0].type).toBe('captured');
    expect(newLog.events[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(newLog.events[0].timestamp).toBeLessThanOrEqual(after);
  });

  it('first event has prev_hash GENESIS', async () => {
    const log = createLog('ev-2');
    const newLog = await appendEvent(log, 'captured');
    expect(newLog.events[0].prev_hash).toBe('GENESIS');
  });

  it('second event prev_hash equals hash of first event canonical form', async () => {
    const log = createLog('ev-3');
    const log1 = await appendEvent(log, 'captured');
    const log2 = await appendEvent(log1, 'encrypted');

    const firstEvent = log1.events[0];
    const canonical = getCanonicalForm(firstEvent);
    const encoder = new TextEncoder();
    const expectedHash = await hashFile(encoder.encode(canonical).buffer as ArrayBuffer);

    expect(log2.events[1].prev_hash).toBe(expectedHash);
  });

  it('is immutable (does not mutate original log)', async () => {
    const log = createLog('ev-4');
    const newLog = await appendEvent(log, 'captured');

    expect(log.events).toHaveLength(0);
    expect(newLog.events).toHaveLength(1);
  });

  it('appends metadata when provided', async () => {
    const log = createLog('ev-5');
    const newLog = await appendEvent(log, 'uploaded', { url: 'https://example.com' });
    expect(newLog.events[0].metadata).toEqual({ url: 'https://example.com' });
  });
});

describe('verifyLog', () => {
  it('returns true for valid log', async () => {
    let log = createLog('ev-verify-1');
    log = await appendEvent(log, 'captured');
    log = await appendEvent(log, 'encrypted');
    log = await appendEvent(log, 'uploaded');

    const valid = await verifyLog(log);
    expect(valid).toBe(true);
  });

  it('returns true for empty log', async () => {
    const log = createLog('ev-verify-empty');
    expect(await verifyLog(log)).toBe(true);
  });

  it('returns false when an event prev_hash is tampered', async () => {
    let log = createLog('ev-tamper');
    log = await appendEvent(log, 'captured');
    log = await appendEvent(log, 'encrypted');

    // Tamper with the second event's prev_hash
    const tamperedLog: CustodyLog = {
      evidence_id: log.evidence_id,
      events: [
        log.events[0],
        { ...log.events[1], prev_hash: 'deadbeef00000000000000000000000000000000000000000000000000000000' },
      ],
    };

    expect(await verifyLog(tamperedLog)).toBe(false);
  });

  it('returns false when first event prev_hash is not GENESIS', async () => {
    const log = createLog('ev-bad-genesis');
    const tamperedLog: CustodyLog = {
      evidence_id: log.evidence_id,
      events: [
        {
          type: 'captured',
          timestamp: Date.now(),
          prev_hash: 'not-genesis',
        },
      ],
    };

    expect(await verifyLog(tamperedLog)).toBe(false);
  });

  it('verifies log with multiple events correctly', async () => {
    let log = createLog('ev-multi');
    const types = ['captured', 'encrypted', 'queued', 'transferred_p2p', 'uploaded'] as const;
    for (const t of types) {
      log = await appendEvent(log, t);
    }
    expect(log.events).toHaveLength(5);
    expect(await verifyLog(log)).toBe(true);
  });
});

describe('getCanonicalForm', () => {
  it('sorts keys deterministically', () => {
    const event: CustodyEvent = {
      type: 'captured',
      timestamp: 1000,
      prev_hash: 'GENESIS',
    };
    const canonical = getCanonicalForm(event);
    const parsed = JSON.parse(canonical);
    const keys = Object.keys(parsed);
    expect(keys).toEqual([...keys].sort());
  });
});
