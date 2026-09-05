#!/usr/bin/env node
/**
 * Probe type=4 (SysEx) records across marker families on a live device, a
 * clean single-slot occupancy each, and dump the sector so the type-4
 * packing for each family can be derived.
 */
import { CommsService } from '../src/lib/device.ts';
import { RtMidiTransport } from '../src/lib/rtmidi.ts';
import { advPackedBlockBase, MIDI_CODE_SLOTS } from '../src/lib/sysex.ts';
import { stderr, stdout } from 'node:process';
const out = (s) => stdout.write(s + '\n');
const log = (s) => stderr.write(s + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = new RtMidiTransport();
const c = new CommsService(t, { scanSettleMs: 1500, ackTimeoutMs: 500 });
await c.scan();
const d = c.getDevices().find((x) => x.pair.name.toLowerCase().includes('sinco'));
if (!d) throw new Error('no SINCO device');
await c.connect(d.pair.key);
log(`connected ${d.pair.name}`);
const pages = new Map();
c.onMonitor((entry) => {
  if (entry.dir !== 'RX') return;
  const b = Array.from(entry.bytes);
  if (b[3] === 0x0d && b.length > 200) {
    pages.set(b[9] | (b[10] << 7) | (b[11] << 14), b.slice(17, b.length - 3));
  }
});
const zero = { enabled: false, channel: 0, type: 0, data1: 0, data2: 0 };
for (let s = 0; s < MIDI_CODE_SLOTS; s++) {
  await c.setFootswitchMidiCode(0, 0, 0, s, zero);
  await sleep(30);
}
for (const slot of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
  await c.setFootswitchMidiCode(0, 0, 0, slot, {
    enabled: true,
    channel: slot % 16,
    type: 4,
    data1: 40 + slot,
    data2: 60 + slot,
  });
  await sleep(40);
  pages.clear();
  await c.reread();
  const p0 = pages.get(0);
  if (!p0) {
    out(`slot ${slot}: no page 0`);
    continue;
  }
  const base = advPackedBlockBase(0, 0);
  const sector = Array.from(p0.slice(base, base + 220));
  out(`slot ${slot} (type4): ${sector.map((x) => x.toString(16).padStart(2, '0')).join(' ')}`);
}
await t.close();
process.exit(0);
