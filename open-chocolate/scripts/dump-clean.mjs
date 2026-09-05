#!/usr/bin/env node
/**
 * Cleanest possible read-back dump: populate Bank A bank 0 (16 codes) and
 * Bank B (6 cells), full reread, and print blob 100..245 with explicit
 * "idx:byte" per token. No hex()-related NaN, no windowing.
 */
import { CommsService } from '../src/lib/device.ts';
import { RtMidiTransport } from '../src/lib/rtmidi.ts';
import { stderr, stdout } from 'node:process';

const log = (s) => stderr.write(s + '\n');
const out = (s) => stdout.write(s + '\n');

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
    const id = b[9] | (b[10] << 7) | (b[11] << 14);
    pages.set(id, b.slice(17, b.length - 3));
  }
};
c.onMonitor(hook);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const zero = { enabled: false, channel: 0, type: 0, data1: 0, data2: 0 };
const setCell = (slot, code, bank = 0) => c.setFootswitchMidiCode(0, 0, bank, slot, code);

for (let s = 0; s < 16; s++) {
  await setCell(s, zero, 0);
  await sleep(50);
}
for (let s = 0; s < 16; s++) {
  await setCell(s, zero, 1);
  await sleep(50);
}
await c.reread();

for (let s = 0; s < 16; s++) {
  await setCell(
    s,
    { enabled: true, channel: s % 16, type: s % 5, data1: 10 + s, data2: s % 5 === 0 ? 0 : 30 + s },
    0
  );
  await sleep(50);
}
for (let s = 0; s <= 5; s++) {
  await setCell(
    s,
    { enabled: true, channel: (s + 1) % 16, type: 1, data1: 11 + s, data2: 22 + s },
    1
  );
  await sleep(50);
}
await c.reread();
const p0 = pages.get(0);
if (!p0) {
  out('NO PAGE 0');
  await t.close();
  process.exit(1);
}
out(`page0 length: ${p0.length}`);
const toks = Array.from(p0);
for (let b = 100; b <= 245; b++) {
  const v = toks[b];
  out(`${b}=${v === undefined ? '??' : v.toString(16).padStart(2, '0')}`);
}
await t.close();
process.exit(0);
