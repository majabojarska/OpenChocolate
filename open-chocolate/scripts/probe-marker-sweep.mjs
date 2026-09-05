#!/usr/bin/env node
/**
 * Per-marker field sweeps for Bank A slots 2+ and Bank B cells (live device).
 *
 * Phase 1 - positions: clear all 16 Bank-A slots, then populate slot k one at
 *   a time from a zero baseline and diff page 0. Pins each slot's fixed record
 *   position (changed@ indices) and captures its record for CODE={ch7,t2,93,71}
 *   (the walk codec table in protocol-addendum.md).
 * Phase 2 - per-marker codecs: for each marker family (repr. slot), sweep one
 *   logical field at a time (channel/type/data1/data2) and dump the slot's
 *   record window, so the packing of every field is visible.
 * Phase 3 - Bank B: populate cells one at a time and dump the 6-byte cells,
 *   then field-sweep the unmapped first-message (slot 0) and slots 3+.
 *
 * Reads use the fast path: a single 0D 41 request for page 0 (the device
 * streams chunk 0 first), matched by the monitor hook - no 24-page re-read.
 *
 *   node scripts/probe-marker-sweep.mjs [--slot 5] [--bankb-only]
 */
import { CommsService } from '../src/lib/device.ts';
import { RtMidiTransport } from '../src/lib/rtmidi.ts';
import { midiCodeAddr, buildReadRequest, advPackedBlockBase } from '../src/lib/sysex.ts';
import { MODES } from '../src/lib/modes.ts';
import { stderr, stdout } from 'node:process';

const argv2 = process.argv.slice(2);
const slotIdx = argv2.indexOf('--slot');
const ONLY_SLOT = Number(slotIdx >= 0 ? argv2[slotIdx + 1] : -1);
const BANKB_ONLY = argv2.includes('--bankb-only');
const COEXIST = argv2.includes('--coexist');

const log = (s) => stderr.write(s + '\n');
const out = (s) => stdout.write(s + '\n');
const hex = (a) => (a ?? []).map((x) => x.toString(16).padStart(2, '0')).join(' ');

const MODE_ADV_CUSTOM =
  MODES.find((m) => m.label.toLowerCase().includes('advanced custom'))?.value ?? 3;

const t = new RtMidiTransport();
const c = new CommsService(t, { scanSettleMs: 1500, ackTimeoutMs: 500 });
await c.scan();
const d = c.getDevices().find((x) => x.pair.name.toLowerCase().includes('sinco'));
if (!d) throw new Error('no SINCO device');
await c.connect(d.pair.key);
log(`connected ${d.pair.name}`);
const outputKey = d.pair.outputId;
const PBASE = advPackedBlockBase(0, 0); // 106 (page 0, switch A)

// ---------------------------------------------------------------- fast page0
let rr = 66;
const pages = new Map();
let page0Count = 0;
let page0Waiters = [];
const hook = (entry) => {
  if (entry.dir !== 'RX') return;
  const b = Array.from(entry.bytes);
  if (b[3] === 0x0d && b.length > 200) {
    const id = b[9] | (b[10] << 7) | (b[11] << 14);
    pages.set(id, b.slice(17, b.length - 3));
    if (id === 0) {
      page0Count++;
      for (const w of page0Waiters) w();
      page0Waiters = [];
    }
  }
};
c.onMonitor(hook);
async function readPage0() {
  const before = page0Count;
  const waiter = new Promise((res) => page0Waiters.push(res));
  await t.send(outputKey, buildReadRequest(0, rr++, false));
  await Promise.race([waiter, new Promise((r) => setTimeout(r, 4000))]);
  if (page0Count === before) return undefined; // no page-0 response in time
  return Array.from(pages.get(0) ?? []);
}
async function snapshot0() {
  const p = await readPage0();
  if (p) return p;
  log('  (page-0 read timed out - full re-read)');
  await c.reread();
  return pages.get(0) ? Array.from(pages.get(0)) : [];
}

let last = 0;
const pace = async () => {
  const w = 500 - (Date.now() - last);
  if (w > 0) await new Promise((r) => setTimeout(r, w));
  last = Date.now();
};
const zero = { enabled: false, channel: 0, type: 0, data1: 0, data2: 0 };
const CODE = { enabled: true, channel: 7, type: 2, data1: 93, data2: 71 };
const setCell = (slot, code, bank = 0) => c.setFootswitchMidiCode(0, 0, bank, slot, code);
// Single-field logical write (field 0=enable,1=ch,2=type,3=d1,4=d2).
const setField = (slot, field, value) => c.writeConfig(midiCodeAddr(0, 0, 0, slot, field), value);
async function clearA() {
  for (let s = 0; s < 16; s++) {
    await pace();
    await setCell(s, zero, 0);
  }
}
async function clearB() {
  for (let s = 0; s < 16; s++) {
    await pace();
    await setCell(s, zero, 1);
  }
}

// Fixed record position per Bank-A slot index, pinned by phase 1 (full run)
// or phase 2 (per-marker pin). -1 = not yet known.
const posBySlot = new Array(16).fill(-1);

// ------------------------------------------------------- multi-slot coexist
// The single-slot walk found overlapping record positions (slot 2's record
// ends exactly where slot 3's marker sits). Verify how records coexist when
// multiple slots are populated before trusting the read path.
if (COEXIST) {
  out('=== COEXIST: multiple Bank-A slots populated ===');
  await clearA();
  await clearB();
  const codes = [
    [0, { channel: 1, type: 1, data1: 5, data2: 9 }],
    [1, { channel: 2, type: 2, data1: 6, data2: 10 }],
    [2, { channel: 3, type: 2, data1: 7, data2: 11 }],
    [3, { channel: 4, type: 2, data1: 8, data2: 12 }],
    [4, { channel: 5, type: 2, data1: 9, data2: 13 }],
  ];
  for (const [s, code] of codes) {
    await pace();
    await setCell(s, { enabled: true, ...code });
  }
  let co = await snapshot0();
  out(`slots0-4 populated: ${hex(co.slice(106, 190))}`);
  for (let s = 5; s <= 8; s++) {
    await pace();
    await setCell(s, { enabled: true, channel: s, type: 1, data1: 10 + s, data2: 14 + s });
  }
  co = await snapshot0();
  out(`slots0-8 populated: ${hex(co.slice(106, 230))}`);
  await clearA();
  // a full 1..15 bank, each slot a distinct code
  for (let s = 1; s <= 15; s++) {
    await pace();
    await setCell(s, { enabled: true, channel: s % 16, type: s % 5, data1: 20 + s, data2: 40 + s });
  }
  co = await snapshot0();
  out(`slots1-15 populated: ${hex(co.slice(106, 300))}`);
  // Bank B full 0..5 populate (6-byte cell grid assumption)
  await clearB();
  for (let s = 0; s <= 5; s++) {
    await pace();
    await setCell(
      s,
      { enabled: true, channel: (s + 1) % 16, type: 1, data1: 11 + s, data2: 22 + s },
      1
    );
  }
  co = await snapshot0();
  out(`bankB slots0-5 populated: ${hex(co.slice(194, 240))}`);
  await t.close();
  process.exit(0);
}

// ================================================================= PHASE 1
if (!BANKB_ONLY) {
  out('=== PHASE 1: fixed record positions (Bank A, slota 0..15) ===');
  await clearA();
  let base = await snapshot0();
  out(`baseline 100..220: ${hex(base.slice(100, 220))}`);
  const recordStart = posBySlot;
  for (let k = 1; k <= 15; k++) {
    if (ONLY_SLOT >= 0 && k !== ONLY_SLOT) continue;
    await pace();
    await setCell(k, CODE);
    const cur = await snapshot0();
    const changed = [];
    for (let i = 100; i < 320 && i < Math.min(base.length, cur.length); i++) {
      if (base[i] !== cur[i]) changed.push(i);
    }
    const start = changed.length ? changed[0] : -1;
    if (start >= 0) posBySlot[k] = start;
    out(
      `slot ${String(k).padStart(2)} changed@[${changed.join(',')}]` +
        (start >= 0 ? ` window16@${start}: ${hex(cur.slice(start, start + 16))}` : '')
    );
    // reset this slot (keep the baseline clean for the next one)
    await pace();
    await setCell(k, zero);
  }
  out('recordStart per index: ' + posBySlot.map((s, i) => `${i}:${s < 0 ? '-' : s}`).join(' '));
}

// ================================================================= PHASE 2
// Marker -> representative slot (from the period-7 walk).
const MARKER_SLOTS = { 0x02: 1, 0x08: 7, 0x04: 4, 0x01: 5, 0x10: 3, 0x20: 6, 0x40: 2 };
const SWEEPS = [
  ['ch', 1, [0, 1, 3, 7, 8, 15]],
  ['type', 2, [0, 1, 2, 3, 4]],
  ['d1', 3, [0, 1, 2, 3, 7, 8, 15, 31, 63, 93, 127]],
  ['d2', 4, [0, 1, 3, 5, 8, 16, 31, 63, 71, 96, 127]],
];
async function sweepSlot(slot, windowSize) {
  await clearA();
  await pace();
  await setCell(slot, CODE);
  let prev = await snapshot0();
  const pos = posBySlot[slot];
  const window = (raw) =>
    raw && pos >= 0 ? hex(raw.slice(pos, pos + windowSize)) : `(pos ${pos} n/a)`;
  out(`\n== sweep slot=${slot} record@${pos} window=${windowSize}B`);
  out(`  base          : ${window(prev)}`);
  for (const [name, field, values] of SWEEPS) {
    for (const v of values) {
      await pace();
      await setField(slot, field, v);
      const cur = await snapshot0();
      const w = window(cur);
      const wPrev = window(prev);
      const deltas = [];
      if (pos >= 0 && prev && cur) {
        for (let i = pos; i < pos + windowSize; i++) {
          if (prev[i] !== cur[i]) {
            deltas.push(
              `${i - pos}:${prev[i].toString(16).padStart(2, '0')}->${cur[i].toString(16).padStart(2, '0')}`
            );
          }
        }
      }
      out(
        `  ${name}=${String(v).padStart(3)}: ${w}${deltas.length ? `  d[${deltas.join(' ')}]` : ''}`
      );
      prev = cur;
    }
    // restore the base value for the next sweep group (keyed by FIELD number)
    const restored = { 1: 7, 2: 2, 3: 93, 4: 71 };
    await pace();
    await setField(slot, field, restored[field] ?? 0);
    prev = await snapshot0();
  }
}

if (!BANKB_ONLY) {
  out('\n=== PHASE 2: per-marker field sweeps (Bank A slots 2+) ===');
  for (const [marker, slot] of Object.entries(MARKER_SLOTS)) {
    if (ONLY_SLOT >= 0 && slot !== ONLY_SLOT) continue;
    // pin this slot's position (cheap: one clear + one write + one read)
    await clearA();
    const before = await snapshot0();
    await pace();
    await setCell(slot, CODE);
    const cur = await snapshot0();
    await clearA();
    let start = -1;
    for (let i = 108; i < 320; i++) {
      if (before[i] !== cur[i]) {
        start = i;
        break;
      }
    }
    posBySlot[slot] = start;
    out(`marker ${marker.toString(16).padStart(2, '0')} slot=${slot} record@${start}`);
    await sweepSlot(slot, marker <= 0x08 ? 12 : 14);
  }
}

// ================================================================= PHASE 3
out('\n=== PHASE 3: Bank B cells (base+92, 6-byte stride) ===');
await clearB();
let bbase = await snapshot0();
out(`bankB baseline 194..240: ${hex(bbase.slice(194, 240))}`);
// Populate slots 0..5 one at a time; dump cells 194..260.
for (let s = 0; s <= 5; s++) {
  if (ONLY_SLOT >= 0 && s !== ONLY_SLOT) continue;
  await pace();
  await setCell(s, { enabled: true, channel: 3, type: 1, data1: 33, data2: 44 }, 1);
  const cur = await snapshot0();
  out(`bankB slot ${s}: ${hex(cur.slice(194, 260))}`);
  await pace();
  await setCell(s, zero, 1);
}

// Field sweeps on the unmapped Bank B layouts: slot 0 (first message) and
// slot 3 (slots 3+), plus slot 5 for the far end of the cell area.
const BS = [0, 3, 5];
const BSWEEPS = [
  ['ch', 1, [0, 2, 3, 7, 15]],
  ['type', 2, [0, 1, 2, 3]],
  ['d1', 3, [0, 1, 25, 33, 64, 93, 127]],
  ['d2', 4, [0, 1, 5, 44, 71, 127]],
];
for (const s of BS) {
  if (ONLY_SLOT >= 0 && s !== ONLY_SLOT) continue;
  await clearB();
  await pace();
  await setCell(s, { enabled: true, channel: 3, type: 1, data1: 33, data2: 44 }, 1);
  let prev = await snapshot0();
  const cell = (raw) => {
    const at = PBASE + 92 + s * 6;
    return raw ? hex(raw.slice(at, at + 12)) : '(n/a)';
  };
  out(`\n== bankB sweep slot=${s} cell@${PBASE + 92 + s * 6}`);
  out(`  base          : ${cell(prev)}`);
  for (const [name, field, values] of BSWEEPS) {
    for (const v of values) {
      await pace();
      // Bank B logical field write (midiCodeAddr with bank=1)
      await c.writeConfig(midiCodeAddr(0, 0, 1, s, field), v);
      const cur = await snapshot0();
      const w = cell(cur);
      const deltas = [];
      const at = PBASE + 92 + s * 6;
      for (let i = at; i < at + 12; i++) {
        if (prev[i] !== cur[i]) {
          deltas.push(
            `${i - at}:${prev[i].toString(16).padStart(2, '0')}->${cur[i].toString(16).padStart(2, '0')}`
          );
        }
      }
      out(
        `  ${name}=${String(v).padStart(3)}: ${w}${deltas.length ? `  d[${deltas.join(' ')}]` : ''}`
      );
      prev = cur;
    }
    const restored = { 1: 3, 2: 1, 3: 33, 4: 44 };
    await pace();
    await c.writeConfig(midiCodeAddr(0, 0, 1, s, field), restored[field] ?? 0);
    prev = await snapshot0();
  }
}

await t.close();
process.exit(0);
