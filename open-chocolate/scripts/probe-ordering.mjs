#!/usr/bin/env node
/**
 * Ordering/compaction experiment: enable DIFFERENT presence patterns of
 * slots 2-8 (with unique channel per slot so records are identifiable by the
 * ch<<3 byte) and dump the packed region. Reveals the ordering rule: by
 * index? by insertion? value-sorted?
 *
 *   node scripts/probe-ordering.mjs
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

// slots 0,1 fixed (identifiable: slot0 R-codec ch7, slot1 codec2 ch6)
await setCell(0, { enabled: true, channel: 7, type: 2, data1: 90, data2: 70 });
await setCell(1, { enabled: true, channel: 6, type: 3, data1: 91, data2: 71 });

const patterns = [
  [2],
  [2, 3],
  [2, 4],
  [3, 4],
  [2, 3, 4],
  [8],
  [2, 8],
  [2, 5, 8],
  [2, 3, 4, 5, 6, 7, 8],
  [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
];
for (const pat of patterns) {
  for (let s = 2; s <= 15; s++) await setCell(s, zero);
  for (const s of pat) {
    // ch = slot value (identifiable ch<<3 = s*8), d1/d2 distinctive too
    await setCell(s, { enabled: true, channel: s, type: 2, data1: 4 * s + 1, data2: 100 + s });
  }
  const raw = await snapshot();
  out(`pat [${pat.join(',')}]: ${hex(raw.slice(105, 220))}`);
}
await t.close();
process.exit(0);
