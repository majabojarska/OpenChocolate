#!/usr/bin/env node
/**
 * Isolate each slot 2+ record: clear all, write ONLY slot K (with slots 0,1
 * populated), dump the region - reveals exact record position, size, and the
 * h0/h1 header values per state. Also tests whether position depends on
 * earlier slots (compaction) vs fixed.
 *
 *   node scripts/probe-isolate-slots.mjs
 */
import { CommsService } from '../src/lib/device.ts';
import { RtMidiTransport } from '../src/lib/rtmidi.ts';
import { stderr, stdout } from 'node:process';

const log = (s) => stderr.write(s + '\n');
const out = (s) => stdout.write(s + '\n');
const hex = (a) => (a ?? []).map((x) => x.toString(16).padStart(2, '0')).join(' ');

const t = new RtMidiTransport();
const c = new CommsService(t, { scanSettleMs: 1500, ackTimeoutMs: 500 });
await c.scan();
const d = c.getDevices().find((x) => x.pair.name.toLowerCase().includes('sinco'));
await c.connect(d.pair.key);
log(`connected ${d.pair.name}`);

const pages = new Map();
const hook = (entry) => {
  if (entry.dir !== 'RX') return;
  const b = Array.from(entry.bytes);
  if (b[3] === 0x0d && b.length > 200) {
    pages.set(b[9] | (b[10] << 7) | (b[11] << 14), b.slice(17, b.length - 3));
  }
};
c.onMonitor(hook);
const chunk0 = () => pages.get(0);
async function snapshot() {
  pages.clear();
  await c.reread();
  return chunk0() ? Array.from(chunk0()) : [];
}
async function setCell(slot, code) {
  await c.setFootswitchMidiCode(0, 0, 0, slot, code);
}
const zero = { enabled: false, channel: 0, type: 0, data1: 0, data2: 0 };

// fill slots 0,1 with fixed codes (they're the known R-codec/codec2 slots)
await setCell(0, { enabled: true, channel: 1, type: 2, data1: 40, data2: 80 });
await setCell(1, { enabled: true, channel: 2, type: 3, data1: 41, data2: 81 });

// Case A: only slot K present (K = 2..8)
for (let K = 2; K <= 8; K++) {
  for (let s = 2; s <= 15; s++) await setCell(s, zero);
  await setCell(K, { enabled: true, channel: 3, type: 2, data1: 40 + K, data2: 80 + K });
  const raw = await snapshot();
  out(`only slot ${K}: ${hex(raw.slice(105, 200))}`);
}

// Case B: compaction test - slot 4 with slot 3 absent vs present, comparing
// the RECORD POSITION of slot 4.
for (const with3 of [false, true]) {
  for (let s = 2; s <= 15; s++) await setCell(s, zero);
  if (with3) await setCell(3, { enabled: true, channel: 3, type: 1, data1: 43, data2: 83 });
  await setCell(4, { enabled: true, channel: 3, type: 2, data1: 44, data2: 84 });
  const raw = await snapshot();
  out(`slot4 ${with3 ? 'with slot3' : 'without slot3'}: ${hex(raw.slice(120, 150))}`);
}

await t.close();
process.exit(0);
