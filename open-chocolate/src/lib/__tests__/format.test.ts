import { describe, expect, it } from 'vitest';
import { createMonitorEntry } from '../format';
import { toHex } from '../hex';

describe('createMonitorEntry', () => {
  it('formats bytes as space-separated uppercase hex', () => {
    const entry = createMonitorEntry('OUT', new Uint8Array([0x0f, 0x0a, 0xff]));
    expect(entry.data).toBe('0F 0A FF');
  });

  it('captures the current time as ISO timestamp', () => {
    const before = Date.now();
    const entry = createMonitorEntry('IN', new Uint8Array([0x01]));
    const after = Date.now();
    const ts = new Date(entry.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('preserves the direction', () => {
    expect(createMonitorEntry('IN', new Uint8Array([])).direction).toBe('IN');
    expect(createMonitorEntry('OUT', new Uint8Array([])).direction).toBe('OUT');
  });
});

describe('toHex', () => {
  it('handles empty input', () => {
    expect(toHex(new Uint8Array())).toBe('');
  });
});
