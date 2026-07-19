import { hashFile } from './hash.js';

export type EventType =
  | 'captured'
  | 'encrypted'
  | 'queued'
  | 'transferred_p2p'
  | 'exported_qr'
  | 'uploaded'
  | 'decrypted_local'
  | 'purged';

export interface CustodyEvent {
  type: EventType;
  timestamp: number;
  prev_hash: string;
  metadata?: Record<string, string>;
}

export interface CustodyLog {
  evidence_id: string;
  events: CustodyEvent[];
}

export function createLog(evidenceId: string): CustodyLog {
  return { evidence_id: evidenceId, events: [] };
}

export function getCanonicalForm(event: CustodyEvent): string {
  const obj: Record<string, unknown> = {};
  const keys = Object.keys(event).sort();
  for (const key of keys) {
    const val = (event as unknown as Record<string, unknown>)[key];
    if (val !== undefined) {
      obj[key] = val;
    }
  }
  return JSON.stringify(obj);
}

async function hashEvent(event: CustodyEvent): Promise<string> {
  const canonical = getCanonicalForm(event);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(canonical);
  return hashFile(bytes.buffer as ArrayBuffer);
}

export async function appendEvent(
  log: CustodyLog,
  type: EventType,
  metadata?: Record<string, string>
): Promise<CustodyLog> {
  let prev_hash: string;
  if (log.events.length === 0) {
    prev_hash = 'GENESIS';
  } else {
    const lastEvent = log.events[log.events.length - 1];
    prev_hash = await hashEvent(lastEvent);
  }

  const newEvent: CustodyEvent = {
    type,
    timestamp: Date.now(),
    prev_hash,
    ...(metadata !== undefined ? { metadata } : {}),
  };

  return {
    evidence_id: log.evidence_id,
    events: [...log.events, newEvent],
  };
}

export async function verifyLog(log: CustodyLog): Promise<boolean> {
  for (let i = 0; i < log.events.length; i++) {
    const event = log.events[i];
    if (i === 0) {
      if (event.prev_hash !== 'GENESIS') return false;
    } else {
      const prevEvent = log.events[i - 1];
      const expectedHash = await hashEvent(prevEvent);
      if (event.prev_hash !== expectedHash) return false;
    }
  }
  return true;
}
