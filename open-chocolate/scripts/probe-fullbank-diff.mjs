#!/usr/bin/env node
/**
 * Probe the full-bank packed layout differences under real device conditions.
 *
 * Populates ALL 16 slots of Bank A (distinct codes), then for each slot
 * bumps a single field (data1/d2/channel/type) and diffs the packed region
 * to reveal exactly which bytes change per field AND which bytes are shared
 * with the next record (overlap/marker-OR).
 *
 *   node scripts/probe-fullbank-diff.mjs
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

let rr = 66;
const pages = new Map();
let p0Count = 0;
let p0Waiters = [];
const hook = (entry) => {
  if (entry.dir !== 'RX') return;
  const b = Array.from(entry.bytes);
  if (b[3] === 0x0d && b.length > 200) {
    const id = b[9] | (b[10] << 7) | (b[11] << 14);
    pages.set(id, b.slice(17, b.length - 3));
    if (id === 0) {
      p0Count++;
      for (const w of p0Waiters) w();
      p0Waiters = [];
    }
  }
};
c.onMonitor(hook);
async function snapshot0() {
  const before = p0Count;
  const waiter = new Promise((res) => p0Waiters.push(res));
  await t.send(outputKey, buildReadRequest(0, rr++, false));
  await Promise.race([waiter, new Promise((r) => setTimeout(r, 4000))]);
  if (p0Count === before) {
    log('  (page-0 read timed out - full re-read)');
    await c.reread();
    return pages.get(0) ? Array.from(pages.get(0)) : [];
  }
  return Array.from(pages.get(0) ?? []);
}

let last = 0;
const pace = async () => {
  const w = 500 - (Date.now() - last);
  if (w > 0) await new Promise((r) => setTimeout(r, w));
  last = Date.now();
};
const base = (s) => ({
  enabled: true,
  channel: s % 16,
  type: s % 5,
  data1: 10 + s,
  data2: s % 5 === 0 ? 0 : 30 + s,
});
const setCell = (slot, code) => c.setFootswitchMidiCode(0, 0, 0, slot, code);
const setField = (slot, field, value) => c.writeConfig(midiCodeAddr(0, 0, 0, slot, field), value);

// populate all 16 slots
for (let s = 0; s < 16; s++) {
  await pace();
  await setCell(s, base(s));
}
let prev = await snapshot0();
out(`full bank baseline 106..240: ${hex(prev.slice(106, 240))}`);

const FIELD_LABELS = { 1: 'ch', 2: 'type', 3: 'd1', 4: 'd2' };
const FIELD_DELTA = { 1: 5, 2: 1, 3: 7, 4: 9 }; // nonzero changes so deltas are visible
for (let s = 0; s < 16; s++) {
  // bump each field individually, then restore
  for (const [field, label] of Object.entries(FIELD_LABELS)) {
    const f = Number(field);
    const oldVal = base(s)[label] ?? 0;
    const newVal = (oldVal + FIELD_DELTA[f]) & 0x7f;
    if (newVal === oldVal) continue;
    await pace();
    await setField(s, f, newVal);
    const cur = await snapshot0();
    const windowStart = s === 0 ? 106 : 106 + (s - 1) * 0; // all of 106..240
    const deltas = [];
    for (let i = 106; i < 240; i++) {
      if (prev[i] !== cur[i]) {
        deltas.push(
          `${i}:${prev[i].toString(16).padStart(2, '0')}->${cur[i].toString(16).padStart(2, '0')}`
        );
      }
    }
    out(
      `slot${String(s).padStart(2)} ${label}+${FIELD_DELTA[f]}: ${deltas.length ? deltas.join(' ') : '(no change)'}`
    );
    // restore
    await pace();
    await setField(s, f, oldVal);
    prev = await snapshot0();
  }
}

await t.close();
process.exit(0);
