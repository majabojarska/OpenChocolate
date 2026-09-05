import { describe, expect, it } from 'vitest';
import { execPath } from 'node:process';
import { fileURLToPath } from 'node:url';
import { RtMidiTransport } from '../rtmidi';

const fakeBridge = fileURLToPath(new URL('./fake-rtmidi-bridge.mjs', import.meta.url));

function makeTransport(): RtMidiTransport {
  return new RtMidiTransport({
    binaryPath: execPath,
    binaryArgs: [fakeBridge],
    ackTimeoutMs: 5000,
  });
}

describe('RtMidiTransport', () => {
  it('lists devices through the bridge, grouped like Web MIDI ports', async () => {
    const t = makeTransport();
    try {
      await t.requestAccess();
      const devices = t.listDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].name).toContain('Fake MIDI');
      expect(devices[0].inputId).toBe('input:0');
      expect(devices[0].outputId).toBe('output:0');
    } finally {
      await t.close();
    }
  });

  it('opens an input, sends bytes and receives messages', async () => {
    const t = makeTransport();
    const received: number[][] = [];
    t.onMessage((ev) => received.push([...ev.bytes]));
    try {
      await t.requestAccess();
      await t.openInput('input:0');
      await t.send('output:0', [0xf0, 0x00, 0x32, 0x01, 0x08, 0xf7]);
      // The stub emits its demo SysEx 20ms after the input opens.
      await new Promise((r) => setTimeout(r, 80));
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual([0xf0, 0x00, 0x32, 0x45, 0x58, 0xf7]);
    } finally {
      await t.close();
    }
  });

  it('rejects unknown port keys', async () => {
    const t = makeTransport();
    try {
      await t.requestAccess();
      await expect(t.send('output:99', [0xf0])).rejects.toThrow(/not open/);
      await expect(t.openInput('nope')).rejects.toThrow(/not an input key/);
    } finally {
      await t.close();
    }
  });
});
