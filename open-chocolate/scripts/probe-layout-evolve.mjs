#!/usr/bin/env node
/**
 * Occupancy evolution of the packed Bank A / Bank B read layout (live).
 *
 * Increments the populated-slot set {0}, {0,1}, {0,1,2}, ... each step
 * dumps blobs 106..232 (Bank A) and 194..250 (Bank B), so the movement of
 * every record under growing occupancy is visible.
 *
 *   node scripts/probe-layout-evolve.mjs [--banka|--bankb]
 */
import { CommsService } from '../src/lib/device.ts';
import { RtMidiTransport } from '../src/lib/rtmidi.ts';
import { buildReadRequest, advPackedBlockBase } from '../src/lib/sysex.ts';
import { MODES } from '../src/lib/modes.ts';
import { stderr, stdout } from 'node:process';

const argv2 = process.argv.slice(2);
const ONLY_BANKB = argv2.includes('--bankb');
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
const zero = { enabled: false, channel: 0, type: 0, data1: 0, data2: 0 };
const setCell = (slot, code, bank = 0) => c.setFootswitchMidiCode(0, 0, bank, slot, code);
async function clearBank(bank) {
  for (let s = 0; s < 16; s++) {
    await pace();
    await setCell(s, zero, bank);
  }
}

const code = (s, bank) => ({
  enabled: true,
  channel: (s + bank * 3) % 16,
  type: (s + bank * 2) % 5,
  data1: 10 + s + bank * 20,
  data2: 30 + s + bank * 25,
});

if (ONLY_BANKB) {
  out('=== Bank B occupancy evolution (cells 194..254) ===');
  await clearBank(1);
  const regionB = (raw) => hex(raw.slice(194, 254));
  let raw = await snapshot0();
  out(`slots: -        : ${regionB(raw)}`);
  for (let s = 0; s <= 5; s++) {
    await pace();
    await setCell(s, code(s, 1), 1);
    raw = await snapshot0();
    out(`slots: 0..${s}     : ${regionB(raw)}`);
  }
} else {
  out('=== Bank A occupancy evolution (records 106..232) ===');
  await clearBank(0);
  const regionA = (raw) => hex(raw.slice(106, 232));
  let raw = await snapshot0();
  out(`slots: -         : ${regionA(raw)}`);
  for (let s = 0; s <= 15; s++) {
    await pace();
    await setCell(s, code(s, 0), 0);
    raw = await snapshot0();
    out(`slots: 0..${String(s).padStart(2)} : ${regionA(raw)}`);
  }
}

await t.close();
process.exit(0);
