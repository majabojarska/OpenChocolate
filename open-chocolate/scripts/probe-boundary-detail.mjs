#!/usr/bin/env node
/**
 * Step 1+2 boundary detail probes (live device):
 *
 * 1. Byte-granular write boundary: for Bank A slots 5/6/7 of a footswitch,
 *    try writing each of the 5 cell bytes individually (09 49) and record
 *    ACK/NACK. Is the cutoff exactly at slot6:field0, or mid-cell?
 *
 * 2. `09 41` bulk write (bank clear) across the SAME region: send the official
 *    remove-all message for Bank A (which 09 49 cannot touch beyond slot 5) and
 *    for a Bank B control. Does the bulk path reach the whole bank? If yes, the
 *    firmware caps per-byte 09 49 but allows 09 41 (bulk) - confirming the
 *    "upper Bank A cells need bulk write" model.
 *
 *   node scripts/probe-boundary-detail.mjs [--sw 0] [--page 0]
 */
import { CommsService } from '../src/lib/device.ts';
import { RtMidiTransport } from '../src/lib/rtmidi.ts';
import { buildBankClearWrite, midiCodeAddr } from '../src/lib/sysex.ts';
import { stderr, stdout } from 'node:process';

const argv2 = process.argv.slice(2);
const swIdx = argv2.indexOf('--sw');
const SW = Number(swIdx >= 0 ? argv2[swIdx + 1] : 0);
const pageIdx = argv2.indexOf('--page');
const PAGE = Number(pageIdx >= 0 ? argv2[pageIdx + 1] : 0);

const log = (s) => stderr.write(s + '\n');
const out = (s) => stdout.write(s + '\n');
const FIELD_NAMES = ['enable', 'channel', 'type', 'data1', 'data2'];

const t = new RtMidiTransport();
// Short ack timeout so NACKs are detected fast (no long backoff in probes).
const c = new CommsService(t, { scanSettleMs: 1500, ackTimeoutMs: 500 });
await c.scan();
const d = c.getDevices().find((x) => x.pair.name.toLowerCase().includes('sinco'));
if (!d) throw new Error('no SINCO device');
await c.connect(d.pair.key);
log(`connected ${d.pair.name}; fs${'ABCD'[SW]} page ${PAGE}`);

// ------------------------------------------------------------- step 1: bytes
log('\n== Step 1: byte-granular 09 49 boundary (Bank A slots 5,6,7) ==');
const bytes = {}; // slot -> { field -> ack }
for (const slot of [5, 6, 7]) {
  bytes[slot] = {};
  for (let field = 0; field < 5; field++) {
    const addr = midiCodeAddr(PAGE, SW, 0, slot, field);
    const value = field === 0 ? 1 : 0x20 + slot; // enable=1, rest distinct
    try {
      await c.writeConfig(addr, value);
      bytes[slot][field] = true;
      log(`  slot${slot} field${field}(${FIELD_NAMES[field]}) @${addr} <- ${value}  ACK`);
    } catch {
      bytes[slot][field] = false;
      log(`  slot${slot} field${field}(${FIELD_NAMES[field]}) @${addr} <- ${value}  NACK`);
    }
  }
}
out('\nstep1-byte-map:');
out(
  Object.entries(bytes)
    .map(
      ([slot, fields]) =>
        `  slot${slot}: ${Object.values(fields)
          .map((ok) => (ok ? 'ACK' : 'NACK'))
          .join(' ')}`
    )
    .join('\n')
);

// ------------------------------------------------------------- step 2: 09 41
log('\n== Step 2: 09 41 bulk clear over the same regions ==');
async function bulkClear(bank, label) {
  const frame = buildBankClearWrite(PAGE, SW, bank);
  const addr = midiCodeAddr(PAGE, SW, bank, 0, 0);
  try {
    await c.probe(frame, { timeoutMs: 3000, gatherMs: 800 });
    log(`  09 41 clear ${label} @${addr} (${frame.length} B) -> ACK`);
    return true;
  } catch {
    log(`  09 41 clear ${label} @${addr} (${frame.length} B) -> NACK/no response`);
    return false;
  }
}

const bulkA = await bulkClear(0, 'Bank A');
const bulkB = await bulkClear(1, 'Bank B');
out('\nstep2-09-41-bulk:');
out(`  Bank A (blob ${midiCodeAddr(PAGE, SW, 0, 0, 0)}): ${bulkA ? 'ACK' : 'NACK'}`);
out(`  Bank B (blob ${midiCodeAddr(PAGE, SW, 1, 0, 0)}): ${bulkB ? 'ACK' : 'NACK'}`);

// Confirm what the reread shows for the cleared banks.
await c.reread();
const fsCfg = c.getConnected().config.footswitchBanks[SW];
out('\nstep2-reread-after-clear:');
out(`  Bank A: ${fsCfg[0].codes.map((x) => (x.enabled ? '1' : '0')).join('')}`);
out(`  Bank B: ${fsCfg[1].codes.map((x) => (x.enabled ? '1' : '0')).join('')}`);

await t.close();
process.exit(0);
