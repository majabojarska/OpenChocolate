#!/usr/bin/env node
/**
 * Per-slot record dump: walk single-slot states 1..15 (consecutive diffing)
 * and print the FULL packed region 110..200 each step, so each slot's exact
 * record bytes for CODE={ch7,t2,93,71} are visible. Grouping identical
 * records reveals which slots share an encoding.
 *
 *   node scripts/probe-position-map.mjs
 */
import { CommsService } from '../src/lib/device.ts';
import { RtMidiTransport } from '../src/lib/rtmidi.ts';
import { stderr, stdout } from 'node:process';

const log = (s) => stderr.write(s + '\n');
const out = (s) => stdout.write(s + '\n');
const hex = (a) => (a ?? []).map((x) => x.toString(16).padStart(2, '0')).join(' ');

let last = 0;
const pace = async () => {
  const w = 500 - (Date.now() - last);
  if (w > 0) await new Promise((r) => setTimeout(r, w));
  last = Date.now();
};

const t = new RtMidiTransport();
const c = new CommsService(t, { scanSettleMs: 1500, ackTimeoutMs: 500 });
await c.scan();
const d = c.getDevices().find((x) => x.pair.name.toLowerCase().includes('sinco'));
if (!d) throw new Error('no SINCO device');
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
async function chunk0() {
  pages.clear();
  await c.reread();
  const p = pages.get(0);
  return p ? Array.from(p) : [];
}
async function setCell(slot, code) {
  await pace();
  await c.setFootswitchMidiCode(0, 0, 0, slot, code);
}
const zero = { enabled: false, channel: 0, type: 0, data1: 0, data2: 0 };
async function clearBank() {
  for (let s = 0; s < 16; s++) await setCell(s, zero);
}

const CODE = { enabled: true, channel: 7, type: 2, data1: 93, data2: 71 };

out(`CODE = ${JSON.stringify(CODE)}`);
out('region legend: nibble pairs = bytes 110..199 (idx = 110 + column)');
await clearBank();
await chunk0();
let prev = await chunk0();
// snapshot the all-zero baseline for reference
out(`baseline 110..199: ${hex(prev.slice(110, 200))}`);

for (let k = 1; k <= 15; k++) {
  if (k > 1) await setCell(k - 1, zero);
  await setCell(k, CODE);
  const region = await chunk0();
  const changed = [];
  for (let i = 110; i < 200 && i < Math.min(prev.length, region.length); i++) {
    if (prev[i] !== region[i]) changed.push(i);
  }
  out(
    `slot ${String(k).padStart(2)} changed@[${changed.join(',')}]\n` +
      `       110..199: ${hex(region.slice(110, 200))}`
  );
  prev = region;
}
await t.close();
process.exit(0);
