#!/usr/bin/env node
/**
 * Controlled compaction experiment for Bank A slots 2+ (live device).
 *
 * Every test starts from a FULLY CLEARED bank (so state is unambiguous),
 * writes a FIXED distinctive code to a chosen set of slots, then:
 *   - diffs the packed region vs the cleared baseline (which bytes moved)
 *   - auto-searches the region for each candidate record encoding:
 *       R-codec (slot 0), codec2 (slot 1), and the observed slots-2+
 *       template [L? L?][ch<<3][type<<4][(d1&3)<<5][(d1>>2)|((d2&1)<<6)][d2>>1]
 *   - dumps the region so unknown layouts are visible.
 *
 * Also tests whether a VALUE CHANGE on an existing slot relocates its record
 * (sorted-by-value structure) or edits it in place (membership-indexed).
 *
 *   node scripts/probe-compaction.mjs
 */
import { CommsService } from '../src/lib/device.ts';
import { RtMidiTransport } from '../src/lib/rtmidi.ts';
import { encodePackedMidiCode, encodePackedMidiCode2 } from '../src/lib/sysex.ts';
import { stderr, stdout } from 'node:process';

const log = (s) => stderr.write(s + '\n');
const out = (s) => stdout.write(s + '\n');
const hex = (a) => (a ?? []).map((x) => x.toString(16).padStart(2, '0')).join(' ');

// Pacing: <=2 ops/sec.
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

// Capture raw read pages (chunk 0 covers blob 0..1153, incl. fsA block 93..510).
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

function findBytes(region, pat) {
  const res = [];
  for (let i = 0; i + pat.length <= region.length; i++) {
    let ok = true;
    for (let j = 0; j < pat.length; j++) {
      if (pat[j] !== null && region[i + j] !== pat[j]) {
        ok = false;
        break;
      }
    }
    if (ok) res.push(i);
  }
  return res;
}

// The fixed distinctive code used for every slot (identifiable under every
// candidate encoding). Slot-4 template content: ch<<3, type<<4, (d1&3)<<5,
// (d1>>2)|((d2&1)<<6), d2>>1 (with 2 wildcard link bytes).
const CODE = { enabled: true, channel: 7, type: 2, data1: 93, data2: 71 };
const rcodec = encodePackedMidiCode(CODE); // 5B R-codec
const codec2 = encodePackedMidiCode2(CODE); // 5B codec2
const tpl7 = [
  null,
  null,
  CODE.channel << 3,
  CODE.type << 4,
  (CODE.data1 & 3) << 5,
  (CODE.data1 >> 2) | ((CODE.data2 & 1) << 6),
  CODE.data2 >> 1,
]; // 7B: 2 link + 5 content
const tpl6 = tpl7.slice(1); // maybe only 1 link byte

function report(name, region, baseline, writtenSlots) {
  out(`\n== ${name}`);
  const deltas = [];
  for (let i = 93; i < 400 && i < Math.min(baseline.length, region.length); i++) {
    if (baseline[i] !== region[i]) {
      deltas.push(
        `${i}:${baseline[i].toString(16).padStart(2, '0')}->${region[i].toString(16).padStart(2, '0')}`
      );
    }
  }
  out(`deltas: ${deltas.length ? deltas.join(' ') : '(none)'}`);
  for (const [label, pat] of [
    ['R-codec', rcodec],
    ['codec2', codec2],
    ['tpl7', tpl7],
    ['tpl6', tpl6],
  ]) {
    const hits = findBytes(region, pat);
    if (hits.length)
      out(
        `  ${label} found at: ${hits.join(', ')} (${pat.map((x) => (x === null ? '?' : x.toString(16).padStart(2, '0'))).join(' ')})`
      );
  }
  out(`region 105..260: ${hex(region.slice(105, 260))}`);
  void writtenSlots;
}

const states = [
  { name: 'only slot 1', slots: [1] },
  { name: 'only slot 2', slots: [2] },
  { name: 'only slot 3', slots: [3] },
  { name: 'only slot 4', slots: [4] },
  { name: 'only slot 8', slots: [8] },
  { name: 'slots 1+3', slots: [1, 3] },
  { name: 'slots 2+4', slots: [2, 4] },
  { name: 'slots 1+2+3+4', slots: [1, 2, 3, 4] },
];

for (const state of states) {
  log(`state: ${state.name}`);
  await clearBank();
  const base = await chunk0();
  for (const s of state.slots) {
    await setCell(s, CODE);
  }
  const region = await chunk0();
  report(state.name, region, base, state.slots);
}

// VALUE-CHANGE test: with 1+2+3+4 populated, rewrite slot 4 with a different
// code. If its record MOVES, records are sorted by value; if it edits in
// place, the structure is membership-indexed.
log('\nvalue-change test (slots 1+2+3+4, rewrite slot 4)');
{
  // ensure 1+2+3+4 = CODE
  await clearBank();
  for (const s of [1, 2, 3, 4]) await setCell(s, CODE);
  const before = await chunk0();
  const NEW = { enabled: true, channel: 1, type: 3, data1: 12, data2: 34 };
  await setCell(4, NEW);
  const after = await chunk0();
  const deltas = [];
  for (let i = 93; i < 400 && i < Math.min(before.length, after.length); i++) {
    if (before[i] !== after[i]) {
      deltas.push(
        `${i}:${before[i].toString(16).padStart(2, '0')}->${after[i].toString(16).padStart(2, '0')}`
      );
    }
  }
  out(`\n== value-change slot4 (deltas): ${deltas.length ? deltas.join(' ') : '(none)'}`);
  out(
    `new tpl7: ${[null, null, NEW.channel << 3, NEW.type << 4, (NEW.data1 & 3) << 5, (NEW.data1 >> 2) | ((NEW.data2 & 1) << 6), NEW.data2 >> 1].map((x) => (x === null ? '?' : x.toString(16).padStart(2, '0'))).join(' ')}`
  );
  out(`region 105..260 after: ${hex(after.slice(105, 260))}`);
}

await t.close();
process.exit(0);
