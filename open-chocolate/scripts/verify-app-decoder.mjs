#!/usr/bin/env node
/**
 * Verify the app's actual decoder (CommsService.readBack) against the live
 * device for a FULL 16-slot Bank A + Bank B cells, and report what the app
 * decodes vs what was written.
 */
import { CommsService } from '../src/lib/device.ts';
import { RtMidiTransport } from '../src/lib/rtmidi.ts';
import { MIDI_CODE_SLOTS } from '../src/lib/sysex.ts';
import { stderr, stdout } from 'node:process';

const out = (s) => stdout.write(s + '\n');
const log = (s) => stderr.write(s + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t = new RtMidiTransport();
const c = new CommsService(t, { scanSettleMs: 1500, ackTimeoutMs: 500 });
await c.scan();
const d = c.getDevices().find((x) => x.pair.name.toLowerCase().includes('sinco'));
if (!d) throw new Error('no SINCO device');
await c.connect(d.pair.key);
log(`connected ${d.pair.name}`);
const zero = { enabled: false, channel: 0, type: 0, data1: 0, data2: 0 };

// clear fsA bank A + B
for (let s = 0; s < MIDI_CODE_SLOTS; s++) {
  await c.setFootswitchMidiCode(0, 0, 0, s, zero);
  await sleep(40);
}
for (let s = 0; s < MIDI_CODE_SLOTS; s++) {
  await c.setFootswitchMidiCode(0, 0, 1, s, zero);
  await sleep(40);
}
// write a full 16-slot Bank A with the standard codes
for (let s = 0; s < MIDI_CODE_SLOTS; s++) {
  const type = s % 5;
  await c.setFootswitchMidiCode(0, 0, 0, s, {
    enabled: true,
    channel: s,
    type,
    data1: 10 + s,
    data2: type === 0 ? 0 : 30 + s,
  });
  await sleep(40);
}
await c.reread();
const cfg = c.getConnected().config;
const bankA = cfg.footswitchBanks[0]?.[0];
let ok = 0,
  bad = 0;
for (let s = 0; s < MIDI_CODE_SLOTS; s++) {
  const read = bankA?.codes[s];
  const type = s % 5;
  const want = { enabled: true, channel: s, type, data1: 10 + s, data2: type === 0 ? 0 : 30 + s };
  const match =
    read &&
    read.enabled === want.enabled &&
    read.channel === want.channel &&
    read.type === want.type &&
    read.data1 === want.data1 &&
    read.data2 === want.data2;
  if (match) ok++;
  else {
    bad++;
    out(`slotA${String(s).padStart(2)}: read ${JSON.stringify(read)} want ${JSON.stringify(want)}`);
  }
}
out(`Bank A via app decoder: ${ok}/16 exact, ${bad} fail`);
// Bank B: write 6 cells and decode
for (let s = 0; s < 6; s++) {
  await c.setFootswitchMidiCode(0, 0, 1, s, {
    enabled: true,
    channel: (s + 1) % 16,
    type: 1,
    data1: 11 + s,
    data2: 22 + s,
  });
  await sleep(40);
}
await c.reread();
const bankB = c.getConnected().config.footswitchBanks[0]?.[1];
let bok = 0,
  bbad = 0;
for (let s = 0; s < 6; s++) {
  const read = bankB?.codes[s];
  const want = { enabled: true, channel: (s + 1) % 16, type: 1, data1: 11 + s, data2: 22 + s };
  const match =
    read &&
    read.enabled === want.enabled &&
    read.channel === want.channel &&
    read.type === want.type &&
    read.data1 === want.data1 &&
    read.data2 === want.data2;
  if (match) bok++;
  else {
    bbad++;
    out(`slotB${String(s).padStart(2)}: read ${JSON.stringify(read)} want ${JSON.stringify(want)}`);
  }
}
out(`Bank B (6 cells) via app decoder: ${bok}/6 exact, ${bbad} fail`);
await t.close();
process.exit(0);
