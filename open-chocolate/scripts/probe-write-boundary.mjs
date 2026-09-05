#!/usr/bin/env node
/**
 * Binary-search the address boundary where per-byte 09 49 bank writes stop
 * being acknowledged, for BOTH Bank A and Bank B of a footswitch, and print a
 * visual map.
 *
 * A write is "ACKed" if the device responds to the 09 49 config write. We probe
 * at the SLOT granularity using the real setFootswitchMidiCode operation (the
 * fuzzer's failing path), then binary-search to the exact first slot whose
 * write stops ACKing.
 *
 *   node scripts/probe-write-boundary.mjs [--sw 0] [--page 0] [--json]
 */
import { CommsService } from '../src/lib/device.ts';
import { RtMidiTransport } from '../src/lib/rtmidi.ts';
import { ADV_CUSTOM_START, MIDI_CODE_BYTES, MIDI_CODE_SLOTS } from '../src/lib/sysex.ts';
import { stderr, stdout } from 'node:process';

const argv2 = process.argv.slice(2);
const swIdx = argv2.indexOf('--sw');
const SW = Number(swIdx >= 0 ? argv2[swIdx + 1] : 0);
const pageIdx = argv2.indexOf('--page');
const PAGE = Number(pageIdx >= 0 ? argv2[pageIdx + 1] : 0);
const JSON_OUT = argv2.includes('--json');

const log = (s) => stderr.write(s + '\n');
const out = (s) => stdout.write(s + '\n');

const t = new RtMidiTransport();
const c = new CommsService(t, { scanSettleMs: 1500, ackTimeoutMs: 500 });
await c.scan();
const d = c.getDevices().find((x) => x.pair.name.toLowerCase().includes('sinco'));
if (!d) throw new Error('no SINCO device');
await c.connect(d.pair.key);
log(`connected ${d.pair.name}; probing fs${'ABCD'[SW]} page ${PAGE}`);

/** Try a full setFootswitchMidiCode write to (bank, slot); true = device ACKed. */
async function writeAcked(bank, slot, value) {
  try {
    await c.setFootswitchMidiCode(PAGE, SW, bank, slot, {
      enabled: true,
      channel: 0,
      type: 2,
      data1: value & 0x7f,
      data2: (value >> 3) & 0x7f,
    });
    return true;
  } catch {
    return false;
  }
}

/** Binary-search (lo..hi inclusive slots) for the first NACK. lo ACKs, hi NACKs. */
async function findCutoff(bank, lo, hi, ackedCache) {
  const ack = async (slot) => {
    if (ackedCache.has(slot)) return ackedCache.get(slot);
    const ok = await writeAcked(bank, slot, 40 + slot * 7);
    ackedCache.set(slot, ok);
    log(`  probe bank${bank} slot${slot} @blob ${advAddr(bank, slot)} -> ${ok ? 'ACK' : 'NACK'}`);
    return ok;
  };
  // If the whole range ACKs, there's no boundary here.
  if (await ack(hi)) return null;
  if (!(await ack(lo))) return lo;
  // lo ACKs, hi NACKs: binary search.
  let l = lo;
  let r = hi;
  while (l + 1 < r) {
    const m = Math.floor((l + r) / 2);
    if (await ack(m)) l = m;
    else r = m;
  }
  return r;
}

const advAddr = (bank, slot) =>
  ADV_CUSTOM_START + PAGE * 1668 + SW * 417 + (bank === 0 ? 1 : 81) + slot * MIDI_CODE_BYTES;

// ------------------------------------------------------------------ run
const results = {}; // bank -> { cutoffSlot | null, perSlot: {slot: ack} }
for (const bank of [0, 1]) {
  const name = bank === 0 ? 'A' : 'B';
  log(`\n== Bank ${name} (0..${MIDI_CODE_SLOTS - 1}) ==`);
  const ackedCache = new Map();
  const cutoff = await findCutoff(bank, 0, MIDI_CODE_SLOTS - 1, ackedCache);
  results[bank] = { cutoff, perSlot: Object.fromEntries(ackedCache) };
  log(
    `== Bank ${name} cutoff: ${cutoff === null ? 'none (all ACK)' : `slot ${cutoff} (first NACK)`}`
  );
}

// ------------------------------------------------------------------ map
function renderMap(results, json) {
  const banks = ['A', 'B'];
  if (json) {
    out(
      JSON.stringify(
        { results, legend: 'ACK = write acknowledged, NACK = write rejected' },
        null,
        2
      )
    );
    return;
  }
  for (const bank of [0, 1]) {
    const name = banks[bank];
    const { cutoff, perSlot } = results[bank];
    const line = [];
    for (let s = 0; s < MIDI_CODE_SLOTS; s++) {
      if (perSlot[s] !== undefined) {
        line.push(perSlot[s] ? 'ACK' : 'NACK');
      } else {
        // Not directly probed: infer from the cutoff.
        line.push(cutoff === null ? 'ACK' : s < cutoff ? 'ACK' : 'NACK');
      }
    }
    out(`Bank ${name}: ${line.join(' ')}`);
    const bytes = [];
    for (let s = 0; s < MIDI_CODE_SLOTS; s++) {
      const ok = perSlot[s] ?? (cutoff === null ? true : s < cutoff);
      const addr = advAddr(bank, s);
      bytes.push(`${ok ? 'A' : 'N'}@${addr}`);
    }
    out(`          ${bytes.join(' ')}`);
    out(
      `          cutoff: ${cutoff === null ? 'none' : `slot ${cutoff} (blob ${advAddr(bank, cutoff)})`}`
    );
  }
}

renderMap(results, JSON_OUT);
await t.close();
process.exit(0);
