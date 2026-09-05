#!/usr/bin/env node
/**
 * Crack the Bank A slots-2+ packed read layout (live device).
 *
 * Phase 1 - LOCATE: write a distinct code to each slot index and record which
 * raw packed bytes change. Reveals whether records sit at fixed offsets
 * (base+1+s*5) or are compacted by presence.
 *
 * Phase 2 - DERIVE: on a resolved slot, sweep each logical field
 * (channel/type/data1/data2) via single-byte 09 49 writes and capture the
 * packed record for each value, so the encoding rule can be read off.
 *
 *   node scripts/probe-slot-layout.mjs [--slot 4]
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

out(`=== PHASE 1: locate slot records (fsA page0 bankA, watch 90..300) ===`);
let prev = await snapshot();
for (let s = 1; s <= 12; s++) {
  const code = { enabled: true, channel: 1, type: 2, data1: 30 + s * 3, data2: 60 + s * 3 };
  await c.setFootswitchMidiCode(0, 0, 0, s, code);
  const cur = await snapshot();
  const deltas = [];
  for (let i = 90; i < 300 && i < Math.min(prev.length, cur.length); i++) {
    if (prev[i] !== cur[i]) {
      deltas.push(
        `${i}:${prev[i].toString(16).padStart(2, '0')}->${cur[i].toString(16).padStart(2, '0')}`
      );
    }
  }
  out(`slot ${String(s).padStart(2)}: ${deltas.length ? deltas.join(' ') : '(none)'}`);
  prev = cur;
}

out(`\n=== PHASE 2: per-field derive on slot ${TARGET_SLOT} ===`);
const base = midiCodeAddr(0, 0, 0, TARGET_SLOT, 0); // logical cell start
async function writeField(field, value) {
  await c.writeConfig(base + field, value);
}
async function readRecord() {
  await snapshot();
  // raw packed region around the fixed offset and a wider window
  const raw = chunk0();
  const off = 106 + 3 + TARGET_SLOT * 5; // packed base+3+s*5
  return { atOff: raw ? Array.from(raw.slice(off, off + 6)) : null, raw };
}

// enable on, then sweep channel
await writeField(0, 1);
for (const ch of [0, 1, 2, 3, 4, 7, 8, 15]) {
  await writeField(1, ch);
  const { atOff } = await readRecord();
  out(`ch=${String(ch).padStart(2)} -> [${hex(atOff)}]`);
}
for (const ty of [0, 1, 2, 3, 4]) {
  await writeField(2, ty);
  const { atOff } = await readRecord();
  out(`type=${ty} -> [${hex(atOff)}]`);
}
// d1/d2 sweeps with NoteON type (keeps both bytes)
await writeField(2, 2);
for (const d1 of [0, 1, 2, 3, 5, 7, 8, 15, 31, 63, 127]) {
  await writeField(3, d1);
  const { atOff } = await readRecord();
  out(`d1=${String(d1).padStart(3)} -> [${hex(atOff)}]`);
}
for (const d2 of [0, 1, 2, 3, 5, 8, 16, 31, 63, 96]) {
  await writeField(4, d2);
  const { atOff } = await readRecord();
  out(`d2=${String(d2).padStart(3)} -> [${hex(atOff)}]`);
}

await t.close();
process.exit(0);
