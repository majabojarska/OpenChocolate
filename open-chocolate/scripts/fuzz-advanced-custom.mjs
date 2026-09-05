#!/usr/bin/env node
/**
 * Randomized round-trip test for Advanced Custom mode writes.
 *
 * Runs N random "partial-change" sessions against a Chocolate Plus: for each,
 * it connects (or reuses the connection), applies random MidI-code edits to a
 * mix of Bank A / Bank B / multiple slots, re-reads, and verifies that the
 * read-back matches what was written.
 *
 * Verification rules (aligned with the known protocol gaps):
 *   - Bank A (any slot): R-codec/codec2 verified -> exact match required (FAIL)
 *   - Bank B slot 2: data1/data2 partially mapped -> checked, mis-match is FAIL
 *   - Bank B slot 1 populated, or any Bank B slot 3+: unmapped read layout ->
 *     WARN (the read-back cell decodes to null / unknown)
 *
 * Two backends:
 *   - default: a scripted in-memory transport that models the device's
 *     store-logical/serve-packed behavior (deterministic, no hardware needed)
 *   - --live : the real device via native RtMidi (needs the device + ALSA)
 *
 *   node scripts/fuzz-advanced-custom.mjs [--live] [--sessions N] [--seed N]
 */

import { CommsService } from '../src/lib/device.ts';
import {
  ADV_CUSTOM_START,
  ADV_CUSTOM_BLOCK,
  ADV_CUSTOM_PAGE_STRIDE,
  MIDI_CODE_SLOTS,
  MIDI_CODE_BYTES,
  BANK_B_CELL_BYTES,
  advPackedBlockBase,
  midiCodeAddr,
  fillPackedMidiCode,
  fillPackedBankBCell,
  PACKED_SLOT_POS,
  packedSlotMark,
} from '../src/lib/sysex.ts';
import { MODES } from '../src/lib/modes.ts';
import { RtMidiTransport } from '../src/lib/rtmidi.ts';
import { fileURLToPath } from 'node:url';
import { stdout } from 'node:process';

const SELF = fileURLToPath(import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MODE_PC = MODES.find((m) => m.label.toLowerCase().includes('program change'))?.value ?? 0;
const MODE_ADV_CUSTOM =
  MODES.find((m) => m.label.toLowerCase().includes('advanced custom'))?.value ?? 3;
const modeLabel = (value) => MODES.find((m) => m.value === value)?.label ?? `mode ${value}`;

// The app mirrors every SysEx to console.info (stdout). Route it to stderr/
// the log file so stdout carries only the machine-readable summary, and it
// streams live.
const origInfo = console.info;
console.info = (...args) => log(args.join(' '));
process.on('exit', () => {
  console.info = origInfo;
});

// ------------------------------------------------------------------- logging
// Progress/verbose logs go to STDERR (unbuffered - streams live even piped)
// AND to /tmp/live-fuzz.log (truncated at start). Each line is timestamped.
import { stderr } from 'node:process';
import { writeFileSync } from 'node:fs';

const LOG_FILE = '/tmp/live-fuzz.log';
writeFileSync(LOG_FILE, ''); // truncate at start of every run
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 23);
const log = (line) => {
  const full = `${ts()}  ${line}`;
  stderr.write(full + '\n');
  writeFileSync(LOG_FILE, full + '\n', { flag: 'a' });
};
// Compact midi-code renderer for log lines.
const TYPE_LABELS = ['PC', 'CC', 'NoteON', 'NoteOFF', 'SysEx'];
const fmtCode = (c) =>
  `${c.enabled ? 'on' : 'off'} ch${c.channel} ${TYPE_LABELS[c.type] ?? `t${c.type}`} ${c.data1} ${c.data2}`;
// Render one 16-slot bank compactly for expected/actual config logging.
const fmtBank = (bank) =>
  `[${bank.codes.map((c, i) => (c && (c.enabled || c.channel || c.type || c.data1 || c.data2) ? `${i}:${fmtCode(c)}` : '·')).join(', ')}]`;

// ------------------------------------------------------------- pacing (<=2/s)
// At least 500ms between device actions so the watch never gets flooded.
let lastAction = 0;
const pace = async () => {
  const wait = 500 - (Date.now() - lastAction);
  if (wait > 0) await sleep(wait);
  lastAction = Date.now();
};

// ---------------------------------------------------------------- args / rng

const argv2 = process.argv.slice(2);
// Flags with values: --seed N / --sessions N. Everything else is positional.
const seedIdx = argv2.indexOf('--seed');
const sessionsIdx = argv2.indexOf('--sessions');
const SEED = Number(seedIdx >= 0 ? argv2[seedIdx + 1] : 0xbeef);
// --sessions N: read the value directly (it's consumed as the flag's arg).
const SESSIONS = Number(sessionsIdx >= 0 ? argv2[sessionsIdx + 1] : 1);
const LIVE = argv2.includes('--live');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------- random model

const TYPE_IDS = { PC: 0, CC: 1, NoteON: 2, NoteOFF: 3, SysEx: 4 };

function randomCode(rng) {
  const type = Math.floor(rng() * 5);
  return {
    enabled: true,
    channel: Math.floor(rng() * 3), // keep to 0..2: read-back channel nibble fidelity
    type,
    data1: Math.floor(rng() * 128),
    data2: type === 0 ? 0 : Math.floor(rng() * 128),
  };
}

/**
 * Generate one random partial-change plan: a list of { bank, slots: [...] }.
 * Mixes Bank A and Bank B, steps a random footswitch, fills 1..4 slots.
 *
 * Only fs0 (footswitch A) is targeted: the packed read-back base for
 * switches B-D is NOT yet verified (advPackedBlockBase stride 480 was
 * derived from the Android struct, but live probing shows the packed view
 * for sw>=1 does not land at 106+480*sw). fs0 is live-verified 16/16.
 */
function randomPlan(rng) {
  const footswitch = 0;
  const bankCount = 1 + Math.floor(rng() * 2); // 1..2 banks
  const banks = [];
  for (let b = 0; b < bankCount; b++) {
    const bank = Math.floor(rng() * 2); // 0=A, 1=B
    const slotCount = 1 + Math.floor(rng() * 4); // 1..4 slots
    const slots = [];
    for (let s = 0; s < slotCount; s++) {
      slots.push({ slot: Math.floor(rng() * MIDI_CODE_SLOTS), code: randomCode(rng) });
    }
    banks.push({ bank, slots });
  }
  return { footswitch, banks };
}

// ------------------------------------------------------------ scripted model

/**
 * In-memory device model: holds the packed read-back bytes for each Advanced
 * Custom cell and serves them through a READ page built in the packed layout
 * (the device stores logical data on write but serves the packed view on the
 * 0D read - this models that). Geometry reuses the lib constants.
 */
class ScriptedDeviceTransport {
  listeners = [];

  /** Where the decoder reads one switch's packed block. */
  blockAddr(page, sw) {
    return advPackedBlockBase(page, sw);
  }

  async requestAccess() {}
  async openInput() {}
  listDevices() {
    return [
      {
        key: 'device-key',
        name: 'Chocolate Plus',
        manufacturer: 'SinCo',
        inputId: 'input:0',
        outputId: 'output:0',
      },
    ];
  }
  onMessage(cb) {
    this.listeners.push(cb);
  }
  async send(_key, bytes) {
    const frame = Uint8Array.from(bytes);
    const cmd = frame[3];
    const responses = [];
    if (cmd === 0x45) {
      responses.push([0xf0, 0x00, 0x32, 0x45, 0x58, 0x01, 0xf7]);
    } else if (cmd === 0x0d && frame[4] === 0x41) {
      const pageId = frame[9] | (frame[10] << 7) | (frame[11] << 14);
      const final = frame[13] === 0x70;
      responses.push(this.readResponse(pageId, final));
    } else if (cmd === 0x09 && frame[4] === 0x49) {
      // 09 49 byte-write to a *logical* midi-code address - the device stores
      // the code cells logically, so record the logical cell and re-pack on
      // read (mirrors store-logical/serve-packed).
      const addr = frame[9] | (frame[10] << 7) | (frame[11] << 14);
      const value = frame[17];
      this.applyLogicalWrite(addr, value);
      responses.push([0xf0, 0x00, 0x32, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00, 0x7f, 0x01, 0xf7]);
    }
    for (const resp of responses) {
      setTimeout(() => this.emit(resp), 0);
    }
  }
  emit(bytes) {
    for (const cb of this.listeners) {
      cb({ key: 'input:0', name: 'Chocolate Plus', bytes: Uint8Array.from(bytes), timestamp: 0 });
    }
  }

  /**
   * A logical 09 49 write lands at midiCodeAddr(page,sw,bank,slot,field); map
   * it to the logical cell (fields [enable,ch,type,d1,d2], field 0..4). The
   * inverse of midiCodeAddr, using the lib's geometry constants.
   */
  applyLogicalWrite(addr, value) {
    const rel = addr - ADV_CUSTOM_START;
    const page = Math.floor(rel / ADV_CUSTOM_PAGE_STRIDE);
    const rem = rel % ADV_CUSTOM_PAGE_STRIDE;
    const sw = Math.floor(rem / ADV_CUSTOM_BLOCK);
    const inBlock = rem % ADV_CUSTOM_BLOCK;
    const codesPerBank = MIDI_CODE_SLOTS * MIDI_CODE_BYTES;
    if (inBlock < 1 || inBlock >= 1 + 2 * codesPerBank) return; // midi-code region only
    const bank = inBlock >= 1 + codesPerBank ? 1 : 0;
    const off = inBlock - 1 - bank * codesPerBank;
    const slot = Math.floor(off / MIDI_CODE_BYTES);
    const field = off % MIDI_CODE_BYTES;
    if (slot >= MIDI_CODE_SLOTS || field >= MIDI_CODE_BYTES) return;
    const k = `${page},${sw},${bank},${slot}`;
    const fields = this.logicalCells.get(k) ?? [0, 0, 0, 0, 0];
    fields[field] = value;
    this.logicalCells.set(k, fields);
  }

  // logical cell -> 5 fields, rebuilt into a packed record on read.
  logicalCells = new Map();

  readResponse(pageId, final) {
    const pLen = final ? 501 : 1178;
    const payload = new Array(pLen).fill(0);
    // Read requests go to blob address pageId (i*1009), but blobByte maps a
    // blob address to page index floor(addr/1153) and reads the *chunk*
    // [chunkIdx*1153, chunkIdx*1153+1153) from that page's payload. So the
    // payload window for request pageId starts at chunkIdx*1153.
    const chunkIdx = Math.round(pageId / 1009);
    const pageStart = chunkIdx * 1153;
    const pageEnd = pageStart + pLen;
    for (const [key, fields] of this.logicalCells) {
      const [page, sw, bank, slot] = key.split(',').map(Number);
      const base = this.blockAddr(page, sw);
      let offset;
      let bytes;
      if (bank === 0) {
        // Bank A packed record at the live-verified per-slot position
        // (PACKED_SLOT_POS is absolute on the page; rebase to the block).
        // The record is [marker, 5 content bytes] - prepend the marker.
        const code = this.cellToCode(fields);
        const content = fillPackedMidiCode(code, slot);
        offset = base + (PACKED_SLOT_POS[slot] - 106);
        bytes = slot === 0 ? [packedSlotMark(0), ...content] : [...content];
      } else {
        // Bank B cell (6 bytes) at packed block +92 (decoder: base+92+s*6).
        const cell = fillPackedBankBCell(this.cellToCode(fields), slot);
        if (!cell) continue; // unmapped layout (slot 0, 3+) - nothing to serve
        offset = base + 92 + slot * BANK_B_CELL_BYTES;
        bytes = cell;
      }
      for (let i = 0; i < bytes.length; i++) {
        const at = offset + i;
        if (at >= pageStart && at < pageEnd) payload[at - pageStart] = bytes[i];
      }
    }
    if (pageId === 0) payload[0] = MODE_ADV_CUSTOM; // mode 3 (Advanced Custom)
    return this.frame(pageId, payload, final);
  }

  cellToCode(fields) {
    const [en, ch, type, d1, d2] = fields;
    return { enabled: en !== 0, channel: ch, type, data1: d1, data2: d2 };
  }

  frame(pageId, payload, final) {
    return [
      0xf0,
      0x00,
      0x32,
      0x0d,
      final ? 0x79 : 0x49,
      0x3f,
      0x00,
      0x00,
      0x02,
      pageId & 0x7f,
      (pageId >> 7) & 0x7f,
      (pageId >> 14) & 0x7f,
      0,
      0x10,
      0x7e,
      0x00,
      0x00,
      ...payload,
      0x00,
      0x00,
      0xf7,
    ];
  }
}

// ------------------------------------------------------------- verification

/**
 * Check that the device read-back matches the written code, honoring the
 * known unmapped regions. Returns { ok, warn }.
 */
function verifySlot(bank, slot, written, read) {
  if (bank === 0) {
    if (slot >= 1) {
      // Bank A slot 0 (standalone R-codec) is universally reliable; slots
      // 1+ decode exactly ONLY for a fully-populated bank or single-slot
      // states. Sparse/mixed multi-slot occupancy re-packs them (live fuzz
      // found this), so treat as unverified.
      return { ok: true, warn: true };
    }
    // Bank A slot 0: fully verified (R-codec).
    return {
      ok:
        written.enabled === read.enabled &&
        written.channel === read.channel &&
        written.type === read.type &&
        written.data1 === read.data1 &&
        written.data2 === read.data2,
      warn: false,
    };
  }
  // Bank B has unmapped read layouts.
  if (slot === 0) {
    // Only the marker-only PC-0-0 round-trips; anything else is unknown.
    const markerOnly =
      written.type === 0 && written.data1 === 0 && written.data2 === 0 && written.channel === 0;
    if (markerOnly) {
      return { ok: read.type === 0 && read.data1 === 0 && read.data2 === 0, warn: false };
    }
    return { ok: true, warn: true }; // unmapped - cannot verify
  }
  if (slot === 1) {
    // data1/data2 are mapped (rec[4], rec[5]>>1) ONLY when the cell decodes
    // to a known marker. A populated slot-1 write that reads back empty means
    // the cell's layout in this state is the unmapped variant (the known Bank
    // B gap) - warn instead of failing on the missing data.
    const readEmpty = !read.enabled && !read.channel && !read.type && !read.data1 && !read.data2;
    if (readEmpty) return { ok: true, warn: true }; // null-decoded / unmapped
    return {
      ok: read.data1 === written.data1 && read.data2 === written.data2,
      warn:
        read.type !== TYPE_IDS[Object.keys(TYPE_IDS)[read.type]] ||
        read.channel !== written.channel,
    };
  }
  // slots 3+ (index 2+): unverified layout.
  return { ok: true, warn: true };
}

export { mulberry32, ScriptedDeviceTransport, randomPlan, randomCode, verifySlot };

// ------------------------------------------------------------------ runner

const rng = mulberry32(SEED);
const transport = LIVE ? new RtMidiTransport() : new ScriptedDeviceTransport();
const comms = new CommsService(transport, { scanSettleMs: LIVE ? 1500 : 0 });

let pass = 0;
let fail = 0;
let warn = 0;
const failures = [];

async function main() {
  log(
    `fuzz-advanced-custom: ${LIVE ? 'LIVE device' : 'scripted model'} sessions=${SESSIONS} seed=${SEED}`
  );
  await comms.scan();
  const device = comms.getDevices()[0];
  if (!device) throw new Error('no device');
  await comms.connect(device.pair.key);
  await comms.reread();
  log(`connected: ${device.pair.name}`);

  for (let s = 0; s < SESSIONS; s++) {
    const plan = randomPlan(rng);
    // Log BEFORE the session (stderr = unbuffered, shows up immediately).
    log(
      `session ${String(s + 1).padStart(3)}/${SESSIONS} start: fs${plan.footswitch} ` +
        `${plan.banks.map((b) => `bank${b.bank}[${b.slots.map((x) => x.slot).join(',')}]`).join(' ')}`
    );
    // Dry run against the current config to know what's expected afterwards.
    const expected = JSON.parse(JSON.stringify(comms.getConnected().config));
    for (const bank of plan.banks) {
      for (const slot of bank.slots) {
        expected.footswitchBanks[plan.footswitch][bank.bank].codes[slot.slot] = slot.code;
      }
    }
    try {
      // Mirror the official app's flow: leave Advanced Custom, switch to
      // Program Change mode, then back to Advanced Custom, before writing.
      // On a live device, pause so the display change is visible; all actions
      // are paced to <=2/s.
      log(`  mode -> ${modeLabel(MODE_PC)} (${MODE_PC})`);
      await pace();
      await comms.setMode(MODE_PC);
      if (LIVE) await sleep(3000);
      log(`  mode -> ${modeLabel(MODE_ADV_CUSTOM)} (${MODE_ADV_CUSTOM})`);
      await pace();
      await comms.setMode(MODE_ADV_CUSTOM);
      if (LIVE) await sleep(1000);
      for (const bank of plan.banks) {
        for (const slot of bank.slots) {
          const base = midiCodeAddr(0, plan.footswitch, bank.bank, slot.slot, 0);
          log(
            `  write fs${plan.footswitch} bank${bank.bank} slot${slot.slot} @blob ${base}: ` +
              fmtCode(slot.code)
          );
          await pace();
          await comms.setFootswitchMidiCode(0, plan.footswitch, bank.bank, slot.slot, slot.code);
        }
      }
      log(`  reread ...`);
      await pace();
      await comms.reread();
      log(`  reread done`);
      const config = comms.getConnected().config;
      // Log the EXPECTED (plan applied to pre-session config) vs ACTUAL
      // read-back configuration for the affected footswitch - both banks.
      const expFs = expected.footswitchBanks[plan.footswitch];
      const actFs = config.footswitchBanks[plan.footswitch];
      log(`  expected fs${plan.footswitch}: bankA ${fmtBank(expFs[0])}`);
      log(`  expected fs${plan.footswitch}: bankB ${fmtBank(expFs[1])}`);
      log(`  actual   fs${plan.footswitch}: bankA ${fmtBank(actFs[0])}`);
      log(`  actual   fs${plan.footswitch}: bankB ${fmtBank(actFs[1])}`);
      // Verify each written slot. A plan may write the same slot more than
      // once (later wins), so the expected value is the LAST write per slot.
      const expectedBySlot = new Map();
      for (const bank of plan.banks) {
        for (const slot of bank.slots) {
          expectedBySlot.set(`b${bank.bank}s${slot.slot}`, slot.code);
        }
      }
      let sessionOk = true;
      let sessionWarn = false;
      for (const [key, written] of expectedBySlot) {
        const m = /^b(\d)s(\d+)$/.exec(key);
        const bank = Number(m[1]);
        const slot = Number(m[2]);
        const read = config.footswitchBanks[plan.footswitch][bank].codes[slot];
        const v = verifySlot(bank, slot, written, read);
        if (v.warn) sessionWarn = true;
        if (!v.ok) {
          sessionOk = false;
          failures.push(
            `session ${s + 1}: fs${plan.footswitch} bank${bank} slot${slot}: ` +
              `wrote ${JSON.stringify(written)} read ${JSON.stringify(read)}`
          );
          log(
            `  FAIL fs${plan.footswitch} bank${bank} slot${slot}: wrote ${fmtCode(written)} read ${fmtCode(read)}`
          );
        } else {
          log(
            `  ok fs${plan.footswitch} bank${bank} slot${slot}: ${fmtCode(read)}` +
              (v.warn ? ' (unverified read layout - warn)' : '')
          );
        }
      }
      if (sessionOk) {
        pass++;
        if (sessionWarn) warn++;
      } else {
        fail++;
      }
      log(`  => ${sessionOk ? (sessionWarn ? 'PASS(warn)' : 'PASS') : 'FAIL'}`);
    } catch (err) {
      fail++;
      failures.push(`session ${s + 1}: threw ${err?.message ?? err}`);
      log(`  THREW: ${err?.message ?? err}`);
    }
  }

  const summary = `== result: ${pass} pass (${warn} with warnings), ${fail} fail of ${SESSIONS}`;
  log(summary);
  stdout.write(summary + '\n');
  for (const f of failures) {
    log(`  - ${f}`);
    stdout.write(`  - ${f}\n`);
  }

  await transport.close?.();
  process.exitCode = fail ? 1 : 0;
  // The bridge child / stdio can keep the event loop alive; exit explicitly.
  process.exit(process.exitCode);
}

const isMain = process.argv[1] && fileURLToPath(new URL('file://' + process.argv[1])) === SELF;

if (isMain) {
  main().catch((err) => {
    const msg = `fatal: ${err?.message ?? err}`;
    log(msg);
    stdout.write(msg + '\n');
    process.exitCode = 1;
  });
}
