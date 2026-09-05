import { describe, expect, it } from 'vitest';
import {
  ADDR,
  advCustomBlockAddr,
  advPackedBlockBase,
  buildBankClearWrite,
  buildConfigWrite,
  buildDiscoveryRequest,
  buildReadRequest,
  checksum,
  checksumConstantFor,
  decode14,
  decodeAddress,
  decodeMidiCodes,
  decodePackedBankBCell,
  decodePackedFamily,
  decodePackedMidiCode,
  decodePackedMidiCode2,
  encode14,
  encodeAddress,
  encodePackedFamily,
  encodePackedMidiCode,
  encodePackedMidiCode2,
  footswitchAddr,
  midiCodeAddr,
  PACKED_SLOT_POS,
  packPackedMode,
  packedSlotLen,
  packedSlotMark,
  parseMessage,
  unpackPackedMode,
} from '../sysex';

const hex = (s: string) =>
  s
    .trim()
    .split(/\s+/)
    .map((h) => parseInt(h, 16));

describe('checksum', () => {
  it('reproduces the captured acknowledgement', () => {
    const d = [0x00, 0x32, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00];
    expect(checksum(d, 0x13a)).toEqual([0x7f, 0x01]);
  });

  it('reproduces the captured discovery request checksum byte', () => {
    const d = [0x00, 0x32, 0x45, 0x00, 0x00, 0x00, 0x40];
    expect(checksum(d, 0x136)[0]).toEqual(0x7f);
  });

  it('uses the right constant per address family', () => {
    expect(checksumConstantFor(ADDR.mode)).toBe(0x28a);
    expect(checksumConstantFor(footswitchAddr(0, 0))).toBe(0x28a);
    expect(checksumConstantFor(footswitchAddr(0, 1))).toBe(0x38b);
    expect(checksumConstantFor(footswitchAddr(0, 2))).toBe(0x18b);
    expect(checksumConstantFor(ADDR.polarity)).toBe(0x20b);
    expect(checksumConstantFor(ADDR.maxGroupCount)).toBe(0x20b);
  });

  it('uses the Bank-B constant for the midiCodeB region (device-ACKed)', () => {
    // midiCodeB region = block+81..block+160; the device ACKs 09 49 writes
    // there with 0x18b (verified live: 0x38b drew no response, 0x18b did).
    expect(checksumConstantFor(174)).toBe(0x18b); // fsA Bank B isEnable
    expect(checksumConstantFor(175)).toBe(0x18b); // fsA Bank B channel
    expect(checksumConstantFor(253)).toBe(0x18b); // fsA Bank B last code byte
    expect(checksumConstantFor(254)).toBe(0x28a); // sysExA keeps switch const
    // Bank A (midiCodeA) head keeps the switch constant.
    expect(checksumConstantFor(94)).toBe(0x28a);
    // Same region on the other switches.
    expect(checksumConstantFor(510 + 81)).toBe(0x18b); // fsB Bank B
    expect(checksumConstantFor(927 + 81)).toBe(0x18b); // fsC Bank B
  });

  it('uses 0x38b for the fsA page-0 midiCodeA tail (live write-boundary find)', () => {
    // 09 49 writes to blob 128..173 (fsA page 0, Bank A slots 6..15) are
    // rejected with the switch constant 0x28a but ACKed with 0x38b (verified
    // live: value-independent NACK with 0x28a, ACK with 0x38b/0x18b across the
    // whole 94..253 midi-code region).
    expect(checksumConstantFor(127)).toBe(0x28a); // still switch constant
    expect(checksumConstantFor(128)).toBe(0x38b); // first rejected byte
    expect(checksumConstantFor(129)).toBe(0x38b);
    expect(checksumConstantFor(150)).toBe(0x38b);
    expect(checksumConstantFor(173)).toBe(0x38b); // last rejected byte
    expect(checksumConstantFor(174)).toBe(0x18b); // Bank B unchanged
  });

  it('applies the switch constant to every byte of a switch block', () => {
    // First byte of each switch block (93, 510, 927, 1344) carries the
    // captured constant; the rest of the block is assumed to share it.
    expect(checksumConstantFor(94)).toBe(0x28a); // switch A midi-code data
    expect(checksumConstantFor(509)).toBe(0x28a);
    expect(checksumConstantFor(510 + 80)).toBe(0x38b); // switch B midiCodeA end
    expect(checksumConstantFor(927 + 300)).toBe(0x18b); // switch C sysEx region
    expect(checksumConstantFor(1344 + 416)).toBe(0x38b); // switch D block end
    // The next page repeats the pattern.
    expect(checksumConstantFor(1761)).toBe(0x28a);
    expect(checksumConstantFor(1761 + 417)).toBe(0x38b);
  });
});

describe('advanced custom bank addressing', () => {
  it('places switch blocks and midi-code entries at blob offsets', () => {
    expect(advCustomBlockAddr(0, 0)).toBe(93);
    expect(advCustomBlockAddr(0, 3)).toBe(1344);
    expect(advCustomBlockAddr(1, 0)).toBe(1761);
    expect(midiCodeAddr(0, 0, 0, 0, 0)).toBe(94);
    expect(midiCodeAddr(0, 0, 0, 1, 2)).toBe(94 + 5 + 2);
    // Captured remove-all targets: switch B bank B (591) and D bank A (1345).
    expect(midiCodeAddr(0, 1, 1, 0, 0)).toBe(591);
    expect(midiCodeAddr(0, 3, 0, 0, 0)).toBe(1345);
  });

  it('decodes the 16 midi-code slots of a bank', () => {
    const block = new Uint8Array(417);
    // midiCodeA starts at block+1: slot 0 = CC(93, 0) on channel 2, enabled.
    block[1] = 1;
    block[2] = 2;
    block[3] = 1; // CC
    block[4] = 93;
    block[5] = 0;
    // slot 1 untouched (disabled).
    const bankA = decodeMidiCodes(block, 1);
    expect(bankA).toHaveLength(16);
    expect(bankA[0]).toEqual({ enabled: true, channel: 2, type: 1, data1: 93, data2: 0 });
    expect(bankA[1].enabled).toBe(false);
    // midiCodeB starts at block+81 and is empty here.
    const bankB = decodeMidiCodes(block, 1 + 80);
    expect(bankB.every((c) => !c.enabled)).toBe(true);
  });
});

describe('address encoding', () => {
  it('encodes addresses as 7-bit little-endian', () => {
    expect(encodeAddress(93)).toEqual([0x5d, 0x00, 0x00, 0x00]);
    expect(encodeAddress(510)).toEqual([0x7e, 0x03, 0x00, 0x00]);
    expect(encodeAddress(927)).toEqual([0x1f, 0x07, 0x00, 0x00]);
    expect(encodeAddress(23642)).toEqual([0x5a, 0x38, 0x01, 0x00]);
  });

  it('round-trips', () => {
    for (const addr of [0, 1, 4, 12, 93, 510, 927, 1344, 23637, 23642]) {
      expect(decodeAddress(encodeAddress(addr))).toBe(addr);
    }
  });

  it('round-trips 14-bit ids', () => {
    for (const v of [0, 93, 510, 927, 1344, 1009, 6823, 0x3fff]) {
      const [lo, hi] = encode14(v);
      expect(decode14(lo, hi)).toBe(v);
    }
  });
});

describe('message builders', () => {
  it('builds the exact discovery request', () => {
    expect(buildDiscoveryRequest()).toEqual([
      0xf0, 0x00, 0x32, 0x45, 0x00, 0x00, 0x00, 0x40, 0x7f, 0xf7,
    ]);
  });

  it('builds bit-perfect mode writes for every captured mode', () => {
    const cases: Array<[number, string]> = [
      [0x00, 'f0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 00 74 03 f7'],
      [0x01, 'f0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 01 72 03 f7'],
      [0x02, 'f0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 02 70 03 f7'],
      [0x03, 'f0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 03 6e 03 f7'],
      [0x04, 'f0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 04 6c 03 f7'],
      [0x05, 'f0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 05 6a 03 f7'],
      [0x06, 'f0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 06 68 03 f7'],
      [0x07, 'f0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 07 66 03 f7'],
      [0x08, 'f0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 08 64 03 f7'],
      [0x09, 'f0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 09 62 03 f7'],
      [0x0a, 'f0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 0a 60 03 f7'],
      [0x0b, 'f0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 0b 5e 03 f7'],
      [0x0c, 'f0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 0c 5c 03 f7'],
    ];
    for (const [value, expected] of cases) {
      expect(buildConfigWrite(ADDR.mode, value)).toEqual(hex(expected));
    }
  });

  it('builds bit-perfect footswitch / polarity / group / TRS / CC writes from captures', () => {
    expect(buildConfigWrite(footswitchAddr(0, 0), 0x03)).toEqual(
      hex('f0 00 32 09 49 00 00 00 02 5d 00 00 00 10 00 00 00 03 34 02 f7')
    );
    expect(buildConfigWrite(footswitchAddr(0, 0), 0x00)).toEqual(
      hex('f0 00 32 09 49 00 00 00 02 5d 00 00 00 10 00 00 00 00 3a 02 f7')
    );
    expect(buildConfigWrite(footswitchAddr(0, 0), 0x01)).toEqual(
      hex('f0 00 32 09 49 00 00 00 02 5d 00 00 00 10 00 00 00 01 38 02 f7')
    );
    expect(buildConfigWrite(footswitchAddr(0, 0), 0x02)).toEqual(
      hex('f0 00 32 09 49 00 00 00 02 5d 00 00 00 10 00 00 00 02 36 02 f7')
    );
    expect(buildConfigWrite(footswitchAddr(0, 1), 0x04)).toEqual(
      hex('f0 00 32 09 49 00 00 00 02 7e 03 00 00 10 00 00 00 04 6e 03 f7')
    );
    expect(buildConfigWrite(footswitchAddr(0, 2), 0x03)).toEqual(
      hex('f0 00 32 09 49 00 00 00 02 1f 07 00 00 10 00 00 00 03 2a 01 f7')
    );
    expect(buildConfigWrite(ADDR.polarity, 0x00)).toEqual(
      hex('f0 00 32 09 49 00 00 00 02 5a 38 01 00 10 00 00 00 00 08 01 f7')
    );
    expect(buildConfigWrite(ADDR.polarity, 0x01)).toEqual(
      hex('f0 00 32 09 49 00 00 00 02 5a 38 01 00 10 00 00 00 01 06 01 f7')
    );
    expect(buildConfigWrite(ADDR.maxGroupCount, 0x07)).toEqual(
      hex('f0 00 32 09 49 00 00 00 02 57 38 01 00 10 00 00 00 07 00 01 f7')
    );
    expect(buildConfigWrite(ADDR.midiInterface, 0x01)).toEqual(
      hex('f0 00 32 09 49 00 00 00 02 01 00 00 00 10 00 00 00 01 70 03 f7')
    );
    expect(buildConfigWrite(ADDR.customBankFirst + 1, 0x21)).toEqual(
      hex('f0 00 32 09 49 00 00 00 02 04 00 00 00 10 00 00 00 21 2a 03 f7')
    );
    expect(buildConfigWrite(ADDR.maxBanksPcB, 0x1f)).toEqual(
      hex('f0 00 32 09 49 00 00 00 02 56 38 01 00 10 00 00 00 1f 52 00 f7')
    );
  });

  it('builds the bit-perfect bank-clear writes captured from the official app', () => {
    // Footswitch D bank A removed: f0 00 32 09 41 05 00 00 02 41 0a 00 00 00 0a <93 zeros> 28 06 f7
    expect(buildBankClearWrite(0, 3, 0)).toEqual([
      0xf0,
      0x00,
      0x32,
      0x09,
      0x41,
      0x05,
      0x00,
      0x00,
      0x02,
      0x41,
      0x0a,
      0x00,
      0x00,
      0x00,
      0x0a,
      ...new Array(93).fill(0),
      0x28,
      0x06,
      0xf7,
    ]);
    // Footswitch B bank B removed: f0 00 32 09 41 05 00 00 02 4f 04 00 00 00 0a <93 zeros> 50 05 f7
    expect(buildBankClearWrite(0, 1, 1)).toEqual([
      0xf0,
      0x00,
      0x32,
      0x09,
      0x41,
      0x05,
      0x00,
      0x00,
      0x02,
      0x4f,
      0x04,
      0x00,
      0x00,
      0x00,
      0x0a,
      ...new Array(93).fill(0),
      0x50,
      0x05,
      0xf7,
    ]);
  });

  it('builds the exact captured read requests', () => {
    expect(buildReadRequest(0, 7)).toEqual(
      hex('f0 00 32 0d 41 00 00 00 02 00 00 00 00 10 7e 00 00 07 00 f7')
    );
    expect(buildReadRequest(1009, 19)).toEqual(
      hex('f0 00 32 0d 41 00 00 00 02 71 07 00 00 10 7e 00 00 13 00 f7')
    );
    expect(buildReadRequest(11 * 1009, 129)).toEqual(
      hex('f0 00 32 0d 41 00 00 00 02 5b 56 00 00 10 7e 00 00 01 01 f7')
    );
    expect(buildReadRequest(23 * 1009, 66, true)).toEqual(
      hex('f0 00 32 0d 41 00 00 00 02 27 35 01 00 70 36 00 00 42 00 f7')
    );
  });
});

describe('parsing', () => {
  it('recognises the discovery response', () => {
    const resp = hex(
      'f0 00 32 45 58 01 00 00 23 6f 5e 51 1b 44 4e 1c 36 50 58 55 1b 77 0b 4c 18 36 00 00 00 00 00 00 00 00 00 00 00 00 00 0e f7'
    );
    expect(parseMessage(resp).kind).toBe('discovery-response');
  });

  it('parses read responses with echoed selector and payload', () => {
    const frame = hex('f0 00 32 0d 49 3f 00 00 02 00 00 00 00 10 7e 00 00 01 02 ab cd 00 00 f7');
    const parsed = parseMessage(frame);
    expect(parsed.kind).toBe('read-response');
    if (parsed.kind === 'read-response') {
      expect(parsed.final).toBe(false);
      expect(parsed.pageId).toBe(0);
      expect(Array.from(parsed.payload)).toEqual([0x01, 0x02, 0xab, 0xcd]);
    }
  });

  it('decodes echoed addresses that span three 7-bit bytes', () => {
    // Read response for blob page 18 (address 17153 = 01 06 01 00). A 14-bit
    // decode of only the first two bytes would return 769 and never match.
    const frame = hex('f0 00 32 0d 49 3f 00 00 02 01 06 01 00 10 7e 00 00 01 02 03 04 00 00 f7');
    const parsed = parseMessage(frame);
    expect(parsed.kind).toBe('read-response');
    if (parsed.kind === 'read-response') {
      expect(parsed.pageId).toBe(17153);
      expect(Array.from(parsed.payload)).toEqual([0x01, 0x02, 0x03, 0x04]);
    }
  });

  it('parses config writes back into address + value', () => {
    const parsed = parseMessage(
      hex('f0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 0c 5c 03 f7')
    );
    expect(parsed.kind).toBe('config-write');
    if (parsed.kind === 'config-write') {
      expect(parsed.addr).toBe(0);
      expect(parsed.value).toBe(0x0c);
    }
  });

  it('recognises the write acknowledgement', () => {
    expect(parseMessage(hex('f0 00 32 01 08 00 00 00 00 7f 01 f7')).kind).toBe('ack');
  });

  it('falls back to other for unknown frames', () => {
    expect(parseMessage([0xf0, 0x00, 0x32, 0x01, 0x02, 0xf7]).kind).toBe('other');
  });
});

describe('packed Advanced Custom codec', () => {
  it('round-trips mode via the <<2 packed encoding', () => {
    for (const mode of [0, 1, 2, 3, 4]) {
      expect(unpackPackedMode(packPackedMode(mode))).toBe(mode);
    }
  });

  it('reproduces the captured single-message records bit-exact', () => {
    // (label, logical, packed R0..R4) from the GroupA-D captures.
    const cases: Array<[string, [number, number, number, number], number[]]> = [
      ['A2 data1=1', [0, 1, 1, 0], [0x00, 0x20, 0x40, 0x00, 0x00]],
      ['A3 data1=64', [0, 1, 64, 0], [0x00, 0x20, 0x00, 0x20, 0x00]],
      ['A4 data1=127', [0, 1, 127, 0], [0x00, 0x20, 0x40, 0x3f, 0x00]],
      ['B1 data2=1', [0, 1, 64, 1], [0x00, 0x20, 0x00, 0x20, 0x01]],
      ['B2 data2=127', [0, 1, 64, 127], [0x00, 0x20, 0x00, 0x20, 0x7f]],
      ['C1 type=NoteON', [0, 2, 64, 0], [0x00, 0x40, 0x00, 0x20, 0x00]],
      ['C2 type=NoteOFF', [0, 3, 64, 0], [0x00, 0x60, 0x00, 0x20, 0x00]],
      ['D1 ch15', [15, 1, 64, 0], [0x70, 0x21, 0x00, 0x20, 0x00]],
    ];
    for (const [label, [ch, type, d1, d2], rec] of cases) {
      const expected = { enabled: true, channel: ch, type, data1: d1, data2: d2 };
      expect(
        encodePackedMidiCode({ enabled: true, channel: ch, type, data1: d1, data2: d2 })
      ).toEqual(rec, label);
      expect(decodePackedMidiCode(rec)).toEqual(expected, label);
    }
  });

  it('places the packed switch blocks at the expected addresses', () => {
    expect(advPackedBlockBase(0, 0)).toBe(106);
    expect(advPackedBlockBase(0, 1)).toBe(106 + 480);
    expect(advPackedBlockBase(1, 0)).toBe(106 + 4 * 480);
  });

  it('round-trips and decodes the verified slot-2+ records bit-exact', () => {
    // ({ch,type,d1,d2}, packed B0..B4) from the four on-device reads.
    const cases: Array<[[number, number, number, number], number[]]> = [
      [
        [2, 2, 40, 50],
        [0x08, 0x10, 0x00, 0x45, 0x0c],
      ], // NoteON
      [
        [3, 1, 40, 50],
        [0x0c, 0x08, 0x00, 0x45, 0x0c],
      ], // CC
      [
        [2, 1, 40, 50],
        [0x08, 0x08, 0x00, 0x45, 0x0c],
      ], // CC
      [
        [2, 2, 41, 50],
        [0x08, 0x10, 0x10, 0x45, 0x0c],
      ], // NoteON d1=41
    ];
    for (const [[ch, type, d1, d2], rec] of cases) {
      const code = { enabled: true, channel: ch, type, data1: d1, data2: d2 };
      expect(encodePackedMidiCode2(code)).toEqual(rec);
      expect(decodePackedMidiCode2(rec)).toEqual(code);
    }
  });

  it('reassembles high data2 values (d2 bit 6 live find)', () => {
    // On the live device d2=71 packs B4=0x51 and d2=81 packs B4=0x54 (bit 6
    // of d2 rides B4 bit 6 on top of d2>>2). The old decode (rec[4]<<2) read
    // these back as 0x144/0x140 - garbage. Direct encode/decode checks:
    for (const d2 of [0, 1, 31, 32, 50, 71, 81, 127]) {
      const code = { enabled: true, channel: 2, type: 2, data1: 40, data2: d2 };
      expect(decodePackedMidiCode2(encodePackedMidiCode2(code))).toEqual(code);
    }
    expect(decodePackedMidiCode2([0x08, 0x10, 0x00, 0x6b, 0x51]).data2).toBe(71);
  });

  it('decodes the captured Bank-B cells for slots 1-2', () => {
    // 6-byte cells at packed block +92 (verified on a live device).
    const okCells: Array<
      [number, number[], { channel: number; type: number; data1: number; data2: number }]
    > = [
      [0, [0x40, 0x00, 0x00, 0x00, 0x00, 0x00], { channel: 0, type: 0, data1: 0, data2: 0 }], // PC 0 0
      [1, [0x10, 0x00, 0x40, 0x00, 0x19, 0x00], { channel: 0, type: 1, data1: 25, data2: 0 }], // CC 25 0
    ];
    for (const [slot, rec, expected] of okCells) {
      expect(decodePackedBankBCell(rec, slot)).toEqual({ enabled: true, ...expected });
    }
    // Slot 3+ layout is not yet derived - must not fabricate data.
    expect(decodePackedBankBCell([0x04, 0x00, 0x20, 0x60, 0x46, 0x0e], 2)).toBeNull();
    // A populated FIRST message (different, unmapped layout) must not fabricate.
    expect(decodePackedBankBCell([0x40, 0x00, 0x02, 0x02, 0x64, 0x00], 0)).toBeNull();
  });

  it('has the full Bank A marker/length/position map', () => {
    const marks = Array.from({ length: 16 }, (_, i) => packedSlotMark(i));
    expect(marks).toEqual([
      0x08, 0x02, 0x40, 0x10, 0x04, 0x01, 0x20, 0x08, 0x02, 0x40, 0x10, 0x04, 0x01, 0x20, 0x08,
      0x02,
    ]);
    const lens = Array.from({ length: 16 }, (_, i) => packedSlotLen(i));
    expect(lens.slice(0, 7)).toEqual([6, 6, 7, 7, 6, 6, 7]);
    expect(PACKED_SLOT_POS[0]).toBe(107);
    expect(PACKED_SLOT_POS[1]).toBe(113);
    expect(PACKED_SLOT_POS[15]).toBe(193);
  });

  it('round-trips every Bank A slot codec family with the marker-OR mask', () => {
    // Each slot's family codec must round-trip encode/decode; the decode
    // receives the raw content (last byte possibly OR'd with the next mark).
    for (let i = 0; i < 16; i++) {
      const mark = packedSlotMark(i);
      const type = i % 5;
      const code = {
        enabled: true,
        channel: i,
        type,
        data1: 10 + i,
        data2: type === 0 ? 0 : (30 + i) & 0x7f,
      };
      // Type 4 in the high families (0x10/0x20/0x40) has an unmapped layout.
      const highFamily = [0x10, 0x20, 0x40].includes(mark);
      if (type === 4 && highFamily) continue;
      const enc = encodePackedFamily(mark, code);
      expect(enc).not.toBeNull();
      const content = enc!.slice();
      // replicate the marker-OR: last content byte OR'd with the next mark
      // ONLY when the next slot's marker is a high family (>= 0x04).
      const next = packedSlotMark((i + 1) % 16);
      if (next >= 0x04 && i <= 14) {
        content[content.length - 1] |= next & 0x7f;
      }
      const dec = decodePackedFamily(mark, content);
      expect(dec).toEqual(code, `slot ${i} mark ${mark.toString(16)}`);
    }
  });

  it('decodes the full live-verified 16-slot Bank A read-back', () => {
    // The on-device full-bank snapshot (dump-clean.mjs): all 16 slots written
    // with {ch:i, type:i%5, d1:10+i, d2:(i%5==0?0:30+i)} and re-read. Cells at
    // PACKED_SLOT_POS with the marker-OR masking. The dump starts at blob 100.
    const full: number[] = hex(`
      00 00 00 00 00 00 10 08 00 00 00 05 00 02 04 08 30 61 47 00 02 04 30
      00 12 60 40 01 0d 42 04 20 40 40 03 11 01 0a 00 78 00 20 00 03 01 20 10
      09 70 40 40 08 25 02 20 18 20 42 49 00 09 08 4c 38 12 40 02 00 14 00 04
      58 10 20 45 14 01 18 08 30 21 25 40 06 03 2e 2c 09 60 01 01 0c 2c 02 3c
      00 10 03 40 00 01 02 2c 30 11 40 40 00 0c 2e 04 18 10 20 03 0c 01 08 04
      70 10 23 40 02 01 1e 68 08 60 20 00 08 1b
    `);
    const blob = (b: number) => full[b - 100];
    for (let i = 0; i < 16; i++) {
      const mark = packedSlotMark(i);
      // Skip the type-4 high-family gap (0x10/0x20/0x40 with type 4).
      const highFamily = [0x10, 0x20, 0x40].includes(mark);
      if (highFamily && i % 5 === 4) continue;
      const len = packedSlotLen(i);
      const cell: number[] = [];
      for (let j = 0; j < len; j++) cell.push(blob(PACKED_SLOT_POS[i] + j));
      const content = cell.slice(1);
      const next = packedSlotMark((i + 1) % 16);
      if (next >= 0x04) content[content.length - 1] &= ~next & 0x7f;
      const dec = decodePackedFamily(mark, content)!;
      const want = { channel: i, type: i % 5, data1: 10 + i, data2: i % 5 === 0 ? 0 : 30 + i };
      expect({ channel: dec.channel, type: dec.type, data1: dec.data1, data2: dec.data2 }).toEqual(
        want,
        `slot ${i}`
      );
    }
  });
});
