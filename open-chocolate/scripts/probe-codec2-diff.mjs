#!/usr/bin/env node
/**
 * Differential: for one Bank A slot (index >= 3), write a known code, read
 * back the RAW packed bytes of that slot, and compare against our codec2
 * prediction. Vary one field to reveal the real packing.
 */
import { CommsService } from '../src/lib/device.ts';
import { RtMidiTransport } from '../src/lib/rtmidi.ts';
import { encodePackedMidiCode2, ADV_PACKED_BASE } from '../src/lib/sysex.ts';
import { stderr } from 'node:process';
const log = (s) => stderr.write(s + '\n');

const t = new RtMidiTransport();
const c = new CommsService(t, { scanSettleMs: 1500, ackTimeoutMs: 500 });
await c.scan();
const d = c.getDevices().find((x) => x.pair.name.toLowerCase().includes('sinco'));
await c.connect(d.pair.key);
log(`connected ${d.pair.name}`);

const SLOT = 4; // Bank A slot index (codec2)
// Packed offset the decoder reads for slot 4: decodePackedSlots(base=pb+2) ->
// slot s at (s===0 ? 0 : 1+s*5) relative to pb+2, so absolute = pb+3+s*5.
const packedOff = ADV_PACKED_BASE + 3 + SLOT * 5;
log(`packed slot offset: ${packedOff}..${packedOff + 4}`);

// Read raw packed bytes for the slot by intercepting the 0D read response.
const pages = new Map();
const hook = (entry) => {
  if (entry.dir !== 'RX') return;
  const b = Array.from(entry.bytes);
  if (b[3] === 0x0d && (b[4] === 0x49 || b[4] === 0x79) && b.length > 200) {
    const addr = b[9] | (b[10] << 7) | (b[11] << 14);
    const payload = b.slice(17, b.length - 3);
    pages.set(addr, payload);
  }
};
c.onMonitor(hook);

// The app maps a blob addr to chunk index floor(addr/1153) and reads it from
// the page whose request addr was chunkIdx*1009 (READ_PAGE_STRIDE). Chunk 0
// (blob 0..1153) comes from the request addr 0.
const chunk0 = () => pages.get(0);

const cases = [
  { enabled: true, channel: 0, type: 0, data1: 0, data2: 0 }, // PC 0 0
  { enabled: true, channel: 1, type: 0, data1: 0, data2: 0 }, // vary channel
  { enabled: true, channel: 2, type: 0, data1: 0, data2: 0 }, // vary channel more
  { enabled: true, channel: 0, type: 1, data1: 0, data2: 0 }, // vary type
  { enabled: true, channel: 0, type: 2, data1: 0, data2: 0 }, // vary type more
  { enabled: true, channel: 0, type: 1, data1: 5, data2: 0 }, // vary data1 (CC)
  { enabled: true, channel: 0, type: 1, data1: 0, data2: 9 }, // vary data2 (CC)
  { enabled: true, channel: 3, type: 2, data1: 67, data2: 96 }, // full populate
];

for (const code of cases) {
  await c.setFootswitchMidiCode(0, 0, 0, SLOT, code);
  pages.clear();
  await c.reread();
  const raw = chunk0();
  const got = raw ? Array.from(raw.slice(packedOff, packedOff + 5)) : null;
  const pred = encodePackedMidiCode2(code);
  const decoded = c.getConnected().config.footswitchBanks[0][0].codes[SLOT];
  log(
    `${JSON.stringify(code)} -> app [${decoded.channel},${decoded.type},${decoded.data1},${decoded.data2}] ` +
      `raw [${got ? got.map((x) => x.toString(16).padStart(2, '0')).join(' ') : '?'}] ` +
      `pred [${pred.map((x) => x.toString(16).padStart(2, '0')).join(' ')}]`
  );
}

await t.close();
process.exit(0);
