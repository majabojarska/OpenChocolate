#!/usr/bin/env node
/**
 * Clean-slate record layout for Bank A slots 2+ (live device).
 *
 * Phase 0: clear ALL slots of fsA page0 bankA.
 * Phase 1: write each slot (0..15) one at a time from the zero baseline and
 *          record exactly which packed bytes its record occupies.
 * Phase 2: per-field sweep on the target slot, capturing a WIDE record window
 *          (12 bytes) so the header bytes and d2 continuation are visible.
 *
 *   node scripts/probe-clean-layout.mjs [--slot 4]
 */
import { CommsService } from '../src/lib/device.ts';
import { RtMidiTransport } from '../src/lib/rtmidi.ts';
import { midiCodeAddr } from '../src/lib/sysex.ts';
import { stderr, stdout } from 'node:process';

const argv2 = process.argv.slice(2);
const slotIdx = argv2.indexOf('--slot');
const TARGET_SLOT = Number(slotIdx >= 0 ? argv2[slotIdx + 1] : 4);

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

out('=== PHASE 0: clear all slots 0..15 ===');
for (let s = 0; s < 16; s++) await setCell(s, zero);
let base = await snapshot();
out(`baseline zeros @90..200: ${hex(base.slice(90, 200))}`);

out('\n=== PHASE 1: write slots one at a time (watch 90..300) ===');
let prev = base;
for (let s = 0; s < 16; s++) {
  const code = { enabled: true, channel: 1, type: 2, data1: 40 + s, data2: 80 + s };
  await setCell(s, code);
  const cur = await snapshot();
  const deltas = [];
  for (let i = 90; i < 300 && i < Math.min(prev.length, cur.length); i++) {
    if (prev[i] !== cur[i]) {
      deltas.push(
        `${i}:${prev[i].toString(16).padStart(2, '0')}->${cur[i].toString(16).padStart(2, '0')}`
      );
    }
  }
  out(`slot ${String(s).padStart(2)} -> ${deltas.length ? deltas.join(' ') : '(none)'}`);
  prev = cur;
}

out(`\n=== PHASE 2: per-field sweep on slot ${TARGET_SLOT} (wide window) ===`);
const baseLog = midiCodeAddr(0, 0, 0, TARGET_SLOT, 0);
async function writeField(field, value) {
  await c.writeConfig(baseLog + field, value);
}
async function readWide() {
  await snapshot();
  const raw = chunk0();
  const off = 106 + 3 + TARGET_SLOT * 5;
  return raw ? Array.from(raw.slice(off, off + 12)) : null;
}

await writeField(0, 1); // enable
for (const ch of [0, 1, 2, 3, 4, 7, 8, 15]) {
  await writeField(1, ch);
  out(`ch=${String(ch).padStart(2)} -> [${hex(await readWide())}]`);
}
for (const ty of [0, 1, 2, 3, 4]) {
  await writeField(2, ty);
  out(`type=${ty} -> [${hex(await readWide())}]`);
}
await writeField(2, 2); // NoteON keeps d1+d2
for (const d1 of [0, 1, 2, 3, 5, 7, 8, 15, 31, 63, 127]) {
  await writeField(3, d1);
  out(`d1=${String(d1).padStart(3)} -> [${hex(await readWide())}]`);
}
for (const d2 of [0, 1, 2, 3, 5, 8, 16, 31, 63, 96, 127]) {
  await writeField(4, d2);
  out(`d2=${String(d2).padStart(3)} -> [${hex(await readWide())}]`);
}
await t.close();
process.exit(0);
