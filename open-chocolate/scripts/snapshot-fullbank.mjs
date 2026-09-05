#!/usr/bin/env node
/**
 * Clean full-bank snapshot: populate Bank A (16 distinct codes) + Bank B
 * (6 cells), read page 0 twice, and dump the RAW page-0 head bytes 100..250
 * to stdout (no re-parse). Ground truth for the layout work.
 */
import { CommsService } from '../src/lib/device.ts';
import { RtMidiTransport } from '../src/lib/rtmidi.ts';
import { buildReadRequest, midiCodeAddr } from '../src/lib/sysex.ts';
import { MODES } from '../src/lib/modes.ts';
import { stderr, stdout } from 'node:process';

const log = (s) => stderr.write(s + '\n');
const out = (s) => stdout.write(s + '\n');
const hex = (a) => (a ?? []).map((x) => x.toString(16).padStart(2, '0')).join(' ');

const t = new RtMidiTransport();
const c = new CommsService(t, { scanSettleMs: 1500, ackTimeoutMs: 500 });
await c.scan();
const d = c.getDevices().find((x) => x.pair.name.toLowerCase().includes('sinco'));
if (!d) throw new Error('no SINCO device');
await c.connect(d.pair.key);
log(`connected ${d.pair.name}`);
const outputKey = d.pair.outputId;

const pages = new Map();
const hook = (entry) => {
  if (entry.dir !== 'RX') return;
  const b = Array.from(entry.bytes);
  if (b[3] === 0x0d && b.length > 200) {
    const id = b[9] | (b[10] << 7) | (b[11] << 14);
    pages.set(id, b.slice(17, b.length - 3));
  }
};
c.onMonitor(hook);
async function readPage0() {
  // The device only serves page 0 through the full read-back sequence.
  pages.clear();
  await c.reread();
  const p = pages.get(0);
  return p ? Array.from(p) : null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const zero = { enabled: false, channel: 0, type: 0, data1: 0, data2: 0 };
const setCell = (slot, code, bank = 0) => c.setFootswitchMidiCode(0, 0, bank, slot, code);

// clear both banks
for (let s = 0; s < 16; s++) {
  await setCell(s, zero, 0);
  await sleep(60);
}
for (let s = 0; s < 16; s++) {
  await setCell(s, zero, 1);
  await sleep(60);
}
await readPage0();

// Bank A: 16 distinct codes
for (let s = 0; s < 16; s++) {
  await setCell(
    s,
    { enabled: true, channel: s % 16, type: s % 5, data1: 10 + s, data2: s % 5 === 0 ? 0 : 30 + s },
    0
  );
  await sleep(60);
}
// Bank B: 6 cells
for (let s = 0; s <= 5; s++) {
  await setCell(
    s,
    { enabled: true, channel: (s + 1) % 16, type: 1, data1: 11 + s, data2: 22 + s },
    1
  );
  await sleep(60);
}
const p0 = await readPage0();
out(`page0 length: ${p0?.length ?? 'null'}`);
if (p0) {
  out(`PAGE0 100..250: ${hex(p0.slice(100, 250))}`);
  out(`PAGE0 250..400: ${hex(p0.slice(250, 400))}`);
}
await t.close();
process.exit(0);
