#!/usr/bin/env node
/**
 * Locate the true packed slot record: write a distinctive code to Bank A slot K
 * and scan the raw packed region for the changed bytes. Report deltas vs the
 * pre-write snapshot so the record position is unambiguous.
 */
import { CommsService } from '../src/lib/device.ts';
import { RtMidiTransport } from '../src/lib/rtmidi.ts';
import { stderr, stdout } from 'node:process';
const log = (s) => stderr.write(s + '\n');
const out = (s) => stdout.write(s + '\n');

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
    const addr = b[9] | (b[10] << 7) | (b[11] << 14);
    pages.set(addr, b.slice(17, b.length - 3));
  }
};
c.onMonitor(hook);
const chunk0 = () => pages.get(0);

// Snapshot the region, write a distinctive slot-4 code, re-read, diff.
const SLOT = 4;
const distinctive = { enabled: true, channel: 3, type: 2, data1: 67, data2: 96 };

await c.reread();
const before = chunk0() ? Array.from(chunk0()) : [];
await c.setFootswitchMidiCode(0, 0, 0, SLOT, distinctive);
pages.clear();
await c.reread();
const after = chunk0() ? Array.from(chunk0()) : [];

out('deltas in packed region 90..260 (idx: before -> after):');
for (let i = 90; i < 260 && i < Math.min(before.length, after.length); i++) {
  if (before[i] !== after[i]) {
    out(
      `  ${String(i).padStart(3)}: ${before[i].toString(16).padStart(2, '0')} -> ${after[i].toString(16).padStart(2, '0')}`
    );
  }
}
// Also show the decoded app value for slot 4.
const dec = c.getConnected().config.footswitchBanks[0][0].codes[SLOT];
out(`app decodes slot ${SLOT} as: ${JSON.stringify(dec)}`);

await t.close();
process.exit(0);
