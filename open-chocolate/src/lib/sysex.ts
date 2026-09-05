/**
 * Low-level SysEx codec for the M-Vave Chocolate Plus ("FC2") protocol.
 *
 * All messages are USB MIDI SysEx frames: F0 00 32 <cmd> ... F7.
 *
 * Key insight (confirmed against captures + the official desktop binary):
 * the 4 "selector" bytes in 09 49 configuration writes are the target
 * ADDRESS inside the device's 23646-byte configuration blob, encoded as
 * 7-bit little-endian: [addr & 7f, (addr>>7) & 7f, (addr>>14) & 7f, 0].
 *
 * The two checksum bytes encode (7-bit LE) X = K - sum(D) - Q - V where
 * D = all bytes after F0 through the value byte, Q = D[8] = first address
 * byte, V = value. K is constant per address family (determined from
 * captures of the official app):
 *   - addresses 0x0000-0x00xx (mode, TRS, custom CC, footswitch A): 0x28A
 *   - footswitch B (0x1FE):                                        0x38B
 *   - footswitch C (0x39F):                                        0x18B
 *   - system block (bankMax/group/polarity, 0x5C55-0x5C5A):        0x20B
 */

export const SYSEX_START = 0xf0;
export const SYSEX_END = 0xf7;
/** Manufacturer id bytes that follow F0. */
export const MANUFACTURER = [0x00, 0x32] as const;

/** Command classes (offset 3). */
export const CMD_ACK = 0x01;
export const CMD_CONFIG = 0x09;
export const CMD_READ = 0x0d;
export const CMD_DISCOVERY = 0x45;

/** Sub-commands (offset 4). */
export const SUB_CONFIG_WRITE = 0x49;
export const SUB_READ_REQ = 0x41;
export const SUB_READ_RESP = 0x49;
export const SUB_READ_RESP_FINAL = 0x79;
/** `09 41` bulk config write - the official app uses it for bank edits. */
export const SUB_CONFIG_WRITE_BULK = 0x41;

/** Fixed parameter following the sub-command (offsets 5-8). */
export const FIXED_PARAM = [0x00, 0x00, 0x00, 0x02] as const;

/** Checksum constants per address family. */
export const CK_DEFAULT = 0x28a;
export const CK_FOOTSWITCH_B = 0x38b;
export const CK_FOOTSWITCH_C = 0x18b;
export const CK_SYSTEM = 0x20b;
/**
 * Checksum constant for the midiCodeB region (Bank B) of each Advanced
 * Custom switch block (block+81..block+160). Confirmed live on a real device:
 * a Bank-B `09 49` write with the switch's own constant (0x28a) drew no device
 * response, and 0x38b also failed; 0x18b was ACKed. Bank A (midiCodeA) keeps
 * the per-switch constant.
 */
export const CK_FOOTSWITCH_BANK_B = 0x18b;

/**
 * Bulk-write checksum base for the `09 41` bank-clear message.
 *
 * The clear checksum is `K - sum(D)` (no Q/V subtraction, unlike `09 49`),
 * with K = CK_BULK_BASE - CK_BULK_BANK_STEP * bank. Reproduces both captured
 * remove-all messages bit-perfect:
 *   - footswitch D bank A (addr 1345, sum 216): 0x400 - 216 = 0x328 = `28 06`
 *   - footswitch B bank B (addr 591,  sum 224): 0x3b0 - 224 = 0x2d0 = `50 05`
 */
export const CK_BULK_BASE = 0x400;
export const CK_BULK_BANK_STEP = 0x50;

/**
 * Configuration addresses (verified against the official app's struct layout
 * and the captured writes). The full configuration blob is 23646 bytes.
 */
export const ADDR = {
  mode: 0x0000, // operating mode (0..12)
  midiInterface: 0x0001, // 0 = expression pedal, 1 = TRS-MIDI (writes; the device stores/reads back 2)
  midiChannel: 0x0002, // MIDI channel, 0-based (UI shows +1)
  // Custom mode per-bank pairs live at 3..12: latch = 3+2b, cc = 4+2b
  // (official app's FC2Struct: usr[b][0] = toggle, usr[b][1] = CC value).
  // Five slots exist in the blob; the manual documents four footswitches.
  customBankFirst: 0x0003,
  // System block at the very end of the blob.
  maxBanksPcA: 23637, // Program Change A: max banks - 1
  maxBanksPcB: 23638, // Program Change B: max banks - 1
  maxGroupCount: 23639, // value = group count - 1
  usrPage: 23640, // Advanced Custom page: 0 = variant 1, 1 = variant 2
  hidPage: 23641, // Custom Keyboard page
  polarity: 23642, // write 0 = off, 1 = on; read-back reports 2 = on (see CONFIG_TAIL_START)
} as const;

/**
 * Address of a footswitch step-mode byte inside the Advanced Custom region.
 * `page` = Advanced Custom variant (0/1), `index` = footswitch A..D (0..3).
 * Layout: advCustom[page][switch].mode - first byte of each 417-byte block.
 */
export function footswitchAddr(page: number, index: number): number {
  return 93 + page * 1668 + index * 417;
}

/** Number of custom-mode CC/latch banks. */
export const CUSTOM_CC_BANKS = 5;

/**
 * Advanced Custom region (device mode 3): two usr pages x four footswitches,
 * each switch a 417-byte block whose first byte is the step mode, followed by
 * midiCodeA (16 x 5), midiCodeB (16 x 5), sysExA (128) and sysExB (128)
 * bytes (FC2Struct order). Only bytes of the two usr pages are edited here.
 */
export const ADV_CUSTOM_START = 93;
export const ADV_CUSTOM_BLOCK = 417;
/** Bytes per usr page (4 switches). */
export const ADV_CUSTOM_PAGE_STRIDE = 4 * ADV_CUSTOM_BLOCK;
export const ADV_CUSTOM_SWITCHES = 4;
export const MIDI_CODE_SLOTS = 16;
/** Bytes per logical midi-code entry (enable, ch, type, data1, data2). */
export const MIDI_CODE_BYTES = 5;
/** Bytes per packed Bank B read-back cell (verified for slot 2 only). */
export const BANK_B_CELL_BYTES = 6;
/** First/Bank A midi-code region start: block+1 .. +80, Bank B +81..+160. */
export const MIDI_CODES_PER_BANK = MIDI_CODE_SLOTS * MIDI_CODE_BYTES;
/** Logical region: midiCodeA starts at block+1, midiCodeB at block+81. */
export const MIDI_CODE_A_OFFSET = 1;
export const MIDI_CODE_B_OFFSET = MIDI_CODE_A_OFFSET + MIDI_CODES_PER_BANK;

export interface MidiCode {
  /** Whether the footswitch sends this message. */
  enabled: boolean;
  /** MIDI channel, 0-based (UI shows +1). */
  channel: number;
  /** 0 = PC, 1 = CC, 2 = Note ON, 3 = Note OFF, 4 = SysEx. */
  type: number;
  data1: number;
  data2: number;
}

/** Blob address of the first byte of one Advanced Custom switch block. */
export function advCustomBlockAddr(page: number, sw: number): number {
  return ADV_CUSTOM_START + page * ADV_CUSTOM_PAGE_STRIDE + sw * ADV_CUSTOM_BLOCK;
}

/**
 * Blob address of one byte of a midi-code entry. bank 0 = A, 1 = B;
 * field 0..4 = enable/channel/type/data1/data2.
 */
export function midiCodeAddr(
  page: number,
  sw: number,
  bank: 0 | 1,
  slot: number,
  field: number
): number {
  const base =
    advCustomBlockAddr(page, sw) +
    MIDI_CODE_A_OFFSET +
    bank * MIDI_CODES_PER_BANK +
    slot * MIDI_CODE_BYTES;
  return base + field;
}

/** Decode 5-byte midi-code entries starting at blob offset `off`. */
export function decodeMidiCodes(src: Uint8Array | readonly number[], off: number): MidiCode[] {
  const out: MidiCode[] = [];
  for (let s = 0; s < MIDI_CODE_SLOTS; s++) {
    out.push({
      enabled: src[off + s * 5] > 0,
      channel: src[off + s * 5 + 1],
      type: src[off + s * 5 + 2],
      data1: src[off + s * 5 + 3],
      data2: src[off + s * 5 + 4],
    });
  }
  return out;
}

/**
 * Advanced Custom read-back codec for the `0D 41` page path (validated on a
 * real device: slot 1 of the packed block decodes bit-exact, and footstuff
 * modes/values read back correctly). NOTE: the desktop app's own `flash_read`
 * protocol serves the raw logical blob, but the stride-1009 `0D` pages that
 * open-chocolate uses carry a packed view, so the decode here is required.
 *
 * Each switch's packed block (page p, switch sw) starts at
 * `ADV_PACKED_BASE + page*4*STRIDE + sw*STRIDE`; [+0] = step mode << 2,
 * [+1] = constant 0x08, then per-slot 5-byte records R0..R4 at [+2 + slot*5]:
 *
 *   R0 = (channel & 7) << 4           // channel bits 0..2
 *   R1 = (type << 5) | (channel >> 3) // type bits + channel bit 3
 *   R2 = (data1 & 1) << 6             // data1 LSB
 *   R3 = data1 >> 1                   // data1 high 6 bits
 *   R4 = data2                        // literal
 *
 * decode(channel) = (R0>>4 & 7) | ((R1&1)<<3); type = (R1>>5)&7;
 * data1 = (R3<<1) | ((R2>>6)&1); data2 = R4.
 *
 * Slot 1 is verified bit-exact against the GroupA-D captures and live reads.
 * The layout of slots 2+ is NOT yet derived (a separate compact encoding), so
 * the decoder only trusts the first slot to avoid showing wrong values.
 */

export const ADV_PACKED_BASE = 106;
export const ADV_PACKED_BLOCK_STRIDE = 480;
export const ADV_PACKED_PAGE_STRIDE = 4 * ADV_PACKED_BLOCK_STRIDE;

/** Packed blob address of one switch block on a usr page. */
export function advPackedBlockBase(page: number, sw: number): number {
  return ADV_PACKED_BASE + page * ADV_PACKED_PAGE_STRIDE + sw * ADV_PACKED_BLOCK_STRIDE;
}

/** Decode the packed step-mode byte (stored `value << 2`). */
export function unpackPackedMode(v: number): number {
  return (v >> 2) & 0x7;
}

/** Encode a step-mode value for the packed byte. */
export function packPackedMode(mode: number): number {
  return (mode & 0x7) << 2;
}

/** Decode one packed 5-byte midi-code record `R0..R4` to a logical code. */
export function decodePackedMidiCode(rec: readonly number[]): MidiCode {
  const channel = ((rec[0] >> 4) & 0x7) | ((rec[1] & 0x1) << 3);
  const type = (rec[1] >> 5) & 0x7;
  const data1 = ((rec[3] & 0x7f) << 1) | ((rec[2] >> 6) & 0x1);
  const data2 = rec[4] & 0x7f;
  return { enabled: true, channel, type, data1, data2 };
}

/** Encode a logical midi code to its packed 5-byte record `R0..R4`. */
export function encodePackedMidiCode(code: MidiCode): number[] {
  return [
    (code.channel & 0x7) << 4,
    ((code.type & 0x7) << 5) | ((code.channel >> 3) & 0x1),
    (code.data1 & 0x1) << 6,
    (code.data1 >> 1) & 0x7f,
    code.data2 & 0x7f,
  ];
}

/**
 * Bank A packed record layout.
 *
 * Each slot i of a switch block (Bank A) has a FIXED record position P[i]
 * (blob address on the packed page) and a per-slot marker byte with period
 * 7: i%7 -> {1:0x02, 2:0x40, 3:0x10, 4:0x04, 5:0x01, 6:0x20, 0:0x08}.
 * The record = [marker, content bytes] with 6-byte cells for markers
 * 0x01/0x02/0x04/0x08 and 7-byte cells for markers 0x10/0x20/0x40 (the extra
 * byte carries d2's high bits). The LAST content byte is OR'd with the NEXT
 * slot's marker when the next marker is a high family (>= 0x04; the low
 * 0x01/0x02 markers leave the previous byte as pure data).
 *
 * Positions (verified against a full 16-slot bank, 16/16 exact):
 *   P = [107, 113, 118, 124, 130, 136, 141, 147, 153, 158, 164, 170, 176,
 *        181, 187, 193]  (page 0, switch A; +480*sw per switch)
 * Slot 0 uses the standalone R-codec (decodePackedMidiCode).
 *
 * KNOWN GAP: type 4 (SysEx) has its own packing in the high families
 * (0x10/0x20/0x40) that is NOT yet derived - live probe shows ch/type bits
 * relocate when type>=4. decodePackedFamily returns null for those so the
 * UI reports them empty instead of fabricating (verified: types 0-3 decode
 * exactly in all families; type 4 works in the low 0x01/0x02/0x04/0x08).
 */
export const PACKED_SLOT_POS: readonly number[] = [
  107, 113, 118, 124, 130, 136, 141, 147, 153, 158, 164, 170, 176, 181, 187, 193,
];
export const PACKED_SLOT_MARK: readonly number[] = [0x08, 0x02, 0x40, 0x10, 0x04, 0x01, 0x20];

export function packedSlotMark(slot: number): number {
  return PACKED_SLOT_MARK[slot % 7];
}

export function packedSlotLen(slot: number): number {
  return packedSlotMark(slot) <= 0x08 ? 6 : 7;
}

/** Decode one family's content bytes (after the marker) to a logical code. */
export function decodePackedFamily(mark: number, c: readonly number[]): MidiCode | null {
  switch (mark) {
    case 0x02:
      return {
        enabled: true,
        channel: (c[0] >> 2) & 0xf,
        type: (c[1] >> 3) & 7,
        data1: ((c[3] & 0x1f) << 3) | ((c[2] >> 4) & 7),
        data2: ((c[4] & 0x1f) << 2) | ((c[3] >> 5) & 3),
      };
    case 0x04:
      return {
        enabled: true,
        channel: (c[0] >> 3) & 0xf,
        type: (c[1] >> 4) & 7,
        data1: ((c[3] & 0x3f) << 2) | ((c[2] >> 5) & 3),
        data2: ((c[4] << 1) & 0x7e) | ((c[3] >> 6) & 1),
      };
    case 0x08:
      // 0x08 family (slots 7, 14 of the cycle - NOT slot 0, which is the
      // standalone R-codec): ch = (b0&7)<<4 | (b1&1)<<3, type = (b1>>5)&3 |
      // ((b2&1)<<2) (the type bit 2 rides b2 bit 0), d1 = (b3&0x7f)<<1 |
      // (b2>>6), d2 = b4.
      return {
        enabled: true,
        channel: ((c[0] >> 4) & 7) | ((c[1] & 1) << 3),
        type: ((c[1] >> 5) & 3) | ((c[2] & 1) << 2),
        data1: ((c[3] & 0x7f) << 1) | ((c[2] >> 6) & 1),
        data2: c[4] & 0x7f,
      };
    case 0x01:
      // 5 content bytes [1..5]: b1=ch<<1, b2=type<<2, b3=(d1&0xf)<<3,
      // b4=((d2&7)<<4)|(d1>>4), and b5 is the NEXT slot's marker whose low
      // 3 bits carry d2 bits 3..5 (marker-OR).
      return {
        enabled: true,
        channel: (c[0] >> 1) & 0x7f,
        type: (c[1] >> 2) & 7,
        data1: ((c[3] & 0xf) << 4) | ((c[2] >> 3) & 0xf),
        data2: ((c[3] >> 4) & 7) | (((c[4] ?? 0) & 7) << 3),
      };
    case 0x10:
      // 6 content bytes (7B cell): [ch bits][type bits][d1][d2<<1][carry]
      if ((c[1] >> 6) & 1 && (c[2] & 3) << 1 === 4) return null; // type 4 unmapped here
      return {
        enabled: true,
        channel: (c[0] & 0x20 ? 1 : 0) | ((c[0] & 0x40 ? 1 : 0) << 1) | ((c[1] & 3) << 2),
        type: ((c[1] >> 6) & 1) | ((c[2] & 3) << 1),
        data1: c[3] & 0x7f,
        data2: ((c[5] & 1) << 6) | (c[4] >> 1),
      };
    case 0x20:
      // 6 content bytes (7B cell): type 4 unmapped here
      if (c[2] === 4) return null;
      return {
        enabled: true,
        channel: ((c[0] >> 6) & 1) | ((c[1] << 1) & 0x7e),
        type: c[2] & 7,
        data1: ((c[3] >> 1) & 0x3f) | ((c[4] & 1) << 6),
        data2: ((c[5] & 3) << 5) | (c[4] >> 2),
      };
    case 0x40:
      // 6 content bytes (7B cell): type 4 unmapped here
      if (c[2] >> 1 === 4) return null;
      return {
        enabled: true,
        channel: c[1] & 0xf,
        type: (c[2] >> 1) & 7,
        data1: ((c[3] >> 2) & 0x1f) | ((c[4] & 3) << 5),
        data2: ((c[5] & 7) << 4) | (c[4] >> 3),
      };
    default:
      return null;
  }
}

/**
 * Legado wrappers (kept for the scripted device model + tests):
 * - 0x02 marker = codec2 (5 content bytes, d2 in B4/B3).
 * - the 0x40/0x10/0x20/0x01/0x04/0x08 families are handled by
 *   `decodePackedFamily`/`encodePackedFamily` with the slot positions.
 */
export function encodePackedMidiCode2(code: MidiCode): number[] {
  return encodePackedFamily(0x02, code) ?? [0, 0, 0, 0, 0];
}

export function decodePackedMidiCode2(rec: readonly number[]): MidiCode {
  return (
    decodePackedFamily(0x02, rec) ?? { enabled: false, channel: 0, type: 0, data1: 0, data2: 0 }
  );
}

/**
 * Pack a logical midi code into the 5-byte record family for a given marker
 * (the inverse of `decodePackedFamily`). Used by the scripted device model.
 */
export function encodePackedFamily(mark: number, code: MidiCode): number[] | null {
  switch (mark) {
    case 0x02:
      return [
        (code.channel & 0xf) << 2,
        (code.type & 0x7) << 3,
        (code.data1 & 0x7) << 4,
        (code.data1 >> 3) | ((code.data2 & 0x3) << 5),
        (code.data2 >> 2) & 0x7f,
      ];
    case 0x04:
      return [
        (code.channel & 0xf) << 3,
        (code.type & 0x7) << 4,
        (code.data1 & 0x3) << 5,
        (code.data1 >> 2) | ((code.data2 & 1) << 6),
        (code.data2 >> 1) & 0x7f,
      ];
    case 0x08:
      return [
        (code.channel & 7) << 4,
        ((code.type & 3) << 5) | ((code.channel >> 3) & 1) | (((code.type >> 2) & 1) << 1),
        ((code.data1 & 1) << 6) | ((code.type >> 2) & 1),
        (code.data1 >> 1) & 0x7f,
        code.data2 & 0x7f,
      ];
    case 0x01:
      return [
        (code.channel & 0x7f) << 1,
        (code.type & 7) << 2,
        (code.data1 & 0xf) << 3,
        ((code.data2 & 7) << 4) | ((code.data1 >> 4) & 0xf),
        (code.data2 >> 3) & 0x7f,
      ];
    case 0x10:
      return [
        ((code.channel & 1) << 5) | (((code.channel >> 1) & 1) << 6),
        ((code.channel >> 2) & 3) | ((code.type & 1) << 6),
        (code.type >> 1) & 3,
        code.data1 & 0x7f,
        (code.data2 << 1) & 0x7f,
        (code.data2 << 1) >> 7,
      ];
    case 0x20:
      return [
        (code.channel & 1) << 6,
        (code.channel >> 1) & 0x7f,
        code.type & 7,
        (code.data1 << 1) & 0x7f,
        ((code.data2 << 2) & 0x7f) | (code.data1 >> 6),
        (code.data2 << 2) >> 7,
      ];
    case 0x40:
      return [
        0,
        code.channel & 0xf,
        (code.type & 7) << 1,
        (code.data1 << 2) & 0x7f,
        ((code.data2 << 3) & 0x7f) | (code.data1 >> 5),
        (code.data2 << 3) >> 7,
      ];
    default:
      return null;
  }
}

export function fillPackedMidiCode(code: MidiCode, slot: number): number[] {
  return slot === 0 ? encodePackedMidiCode(code) : encodePackedMidiCode2(code);
}

/**
 * Bank B (midiCodeB) packed cells - PARTIAL, empirically verified on a live
 * device for the SECOND message only. Bank B of each switch block starts at
 * packed block +92 and holds one 6-byte cell per message (stride 6):
 *
 *   b0 = type     : 0x40 (t0) / 0x10 (t1) / 0x04 (t2) / 0x01 (t3)
 *   b1 = channel  (observed 0 for ch0; scale unverified)
 *   b2 = type-2   : 0x40 (t1) / 0x20 (t2) / 0x80-masked (t0)
 *   b3..b5 = data, slot-dependent (verified):
 *     slot 2 (second message): d1 = b4 (literal), d2 = b5 >> 1
 *     slot 1 and 3+: layout NOT derived (first message encodes channel/type/
 *     data in a different, value-dependent spread - a live read {
 *     {ch2,CC,25,0} -> `40 00 02 02 64 00` could not be verified; a strict
 *     guard accepts only the marker-only first cell so the UI never shows
 *     fabricated values.
 */
export function decodePackedBankBCell(rec: readonly number[], slot: number): MidiCode | null {
  const type = [0x40, 0x10, 0x04, 0x01].indexOf(rec[0] & 0x7f);
  if (type < 0) return null;
  let data1 = 0;
  let data2 = 0;
  if (slot === 0) {
    // Only the marker-only first cell (`40 00 00 00 00 00` = PC 0 0) is
    // trusted; a populated first message uses an unmapped layout.
    if (rec[1] !== 0 || rec[2] !== 0 || rec[3] !== 0 || rec[4] !== 0 || rec[5] !== 0) {
      return null;
    }
  } else if (slot === 1) {
    data1 = rec[4];
    data2 = rec[5] >> 1;
  } else {
    return null; // unverified layout for slots 3+
  }
  // channel is stored at b1; only ch0 was captured, so keep the raw nibble.
  const channel = rec[1] & 0xf;
  return { enabled: true, channel, type, data1, data2 };
}

/** Channel nibble as stored in a Bank B cell (b1). */
export function packBankBChannel(channel: number): number {
  return channel & 0xf;
}

/**
 * Pack a logical code into the 6-byte Bank B cell format the verified slot-2
 * layout uses (b0=type-marker, b1=channel nibble, b4=data1, b5=data2<<1).
 * The inverse of `decodePackedBankBCell` for slot 1 (index 1). Slot 0 and
 * slots 3+ have unmapped layouts, so only slot 1 is produced here.
 */
export function fillPackedBankBCell(code: MidiCode, slot: number): number[] | null {
  if (slot !== 1) return null; // unverified layout
  const typeMarker = [0x40, 0x10, 0x04, 0x01][code.type] ?? 0x40;
  return [typeMarker, packBankBChannel(code.channel), 0, 0, code.data1, code.data2 << 1];
}

/** MidI message type labels, in blob value order (see MidiCode.type). */
export const MIDI_CODE_TYPES = [
  { value: 0, label: 'PC' },
  { value: 1, label: 'CC' },
  { value: 2, label: 'Note ON' },
  { value: 3, label: 'Note OFF' },
  { value: 4, label: 'SysEx' },
] as const;

/** 14-bit id -> two 7-bit bytes (low first). */
export function encode14(value: number): [number, number] {
  const v = value & 0x3fff;
  return [v & 0x7f, (v >> 7) & 0x7f];
}

/** Two 7-bit bytes (low first) -> 14-bit id. */
export function decode14(lo: number, hi: number): number {
  return (lo & 0x7f) | ((hi & 0x7f) << 7);
}

/** Address -> 4 selector bytes (7-bit little-endian + pad). */
export function encodeAddress(addr: number): [number, number, number, number] {
  return [addr & 0x7f, (addr >> 7) & 0x7f, (addr >> 14) & 0x7f, 0];
}

/** Selector bytes -> address (inverse of encodeAddress). */
export function decodeAddress(sel: readonly number[]): number {
  return (sel[0] & 0x7f) | ((sel[1] & 0x7f) << 7) | ((sel[2] & 0x7f) << 14);
}

/** Checksum constant for an address (empirically derived from captures). */
export function checksumConstantFor(addr: number): number {
  // Live-found exception (see the write-boundary probes): on fsA page 0 the
  // device rejects 09 49 writes to midiCodeA bytes 128..173 (slots 6..15)
  // when they use the switch constant 0x28a, but ACKs them with 0x38b (which
  // also works for the rest of the midiCode region). Keep everything else on
  // the captured per-switch map.
  if (addr >= 128 && addr <= 173) return CK_FOOTSWITCH_B;

  // Advanced Custom switch blocks (93 + k*417): the captured constants follow
  // the switch position within the page (A=0x28a, B=0x38b, C=0x18b, D=0x38b)
  // and repeat every page. Verified on each block's first byte (the step
  // mode). The midiCodeB region (Bank B, block+81..block+160) uses a separate
  // constant (verified live: 0x18b is ACKed for Bank-B writes, the switch
  // constant is not).
  const rel = addr - ADV_CUSTOM_START;
  if (rel >= 0 && rel < 8 * ADV_CUSTOM_BLOCK) {
    const sw = Math.floor(rel / ADV_CUSTOM_BLOCK) % ADV_CUSTOM_SWITCHES;
    const inBlock = rel - Math.floor(rel / ADV_CUSTOM_BLOCK) * ADV_CUSTOM_BLOCK;
    if (inBlock >= 81 && inBlock < 161) return CK_FOOTSWITCH_BANK_B;
    return [CK_DEFAULT, CK_FOOTSWITCH_B, CK_FOOTSWITCH_C, CK_FOOTSWITCH_B][sw];
  }
  if (addr >= ADDR.maxBanksPcA && addr <= ADDR.polarity) return CK_SYSTEM;
  return CK_DEFAULT;
}

/** Two-byte 7-bit checksum (low first). */
export function checksum(d: readonly number[], constant: number, extra = 0): [number, number] {
  const sum = d.reduce((a, b) => a + b, 0);
  return encode14(constant - sum - extra);
}

/** Build `F0 00 32 45 00 00 00 40 7F F7` - the discovery request. */
export function buildDiscoveryRequest(): number[] {
  // Validated against the spec capture: single checksum byte 0x7F.
  return [SYSEX_START, ...MANUFACTURER, CMD_DISCOVERY, 0x00, 0x00, 0x00, 0x40, 0x7f, SYSEX_END];
}

/**
 * Build a `09 49` configuration write:
 * `F0 00 32 09 49 00 00 00 02 <addr:4> 10 00 00 00 <value> <ck:2> F7`
 */
export function buildConfigWrite(addr: number, value: number): number[] {
  const d = [
    ...MANUFACTURER,
    CMD_CONFIG,
    SUB_CONFIG_WRITE,
    ...FIXED_PARAM,
    ...encodeAddress(addr),
    0x10,
    0x00,
    0x00,
    0x00,
    value & 0x7f,
  ];
  // Q = D[8] (first address byte), V = value - both subtracted per spec.
  const ck = checksum(d, checksumConstantFor(addr), d[8] + (value & 0x7f));
  return [SYSEX_START, ...d, ...ck, SYSEX_END];
}

/**
 * Build a `09 41` bulk write that clears one whole Advanced Custom footswitch
 * bank in a single message:
 * `F0 00 32 09 41 05 00 00 02 <addr:4> 00 0A <93 zero bytes> <ck:2> F7`
 *
 * This is the exact 111-byte message the official app sends for "Remove all"
 * (captured bit-perfect for footswitch B bank B and footswitch D bank A).
 * `addr` is the first byte of the bank's 80-byte midi-code region. The pairs
 * `00 0A` + 93 zero bytes (95 bytes of payload) are reproduced faithfully.
 */
export function buildBankClearWrite(page: number, sw: number, bank: 0 | 1): number[] {
  const addr = midiCodeAddr(page, sw, bank, 0, 0);
  const d = [
    ...MANUFACTURER,
    CMD_CONFIG,
    SUB_CONFIG_WRITE_BULK,
    0x05,
    0x00,
    0x00,
    0x02,
    ...encodeAddress(addr),
    0x00,
    0x0a,
    ...new Array<number>(93).fill(0),
  ];
  // Bulk clear checksum: K - sum(D) with no Q/V subtraction.
  const k = CK_BULK_BASE - CK_BULK_BANK_STEP * bank;
  const ck = checksum(d, k);
  return [SYSEX_START, ...d, ...ck, SYSEX_END];
}

/**
 * Build a `0D 41` configuration read request:
 * `F0 00 32 0D 41 00 00 00 02 <sel:4> 10 7E 00 <rr:2> 00 F7`
 *
 * `rr` is a rolling 14-bit counter observed in the official app capture
 * (7, 19, 30, ... +11 per request). It is reproduced faithfully.
 */
export function buildReadRequest(pageId: number, rr: number, final = false): number[] {
  const sel = encodeAddress(pageId);
  const marker = final ? [0x70, 0x36] : [0x10, 0x7e];
  const rrc = encode14(rr);
  return [
    SYSEX_START,
    ...MANUFACTURER,
    CMD_READ,
    SUB_READ_REQ,
    ...FIXED_PARAM,
    ...sel,
    ...marker,
    0x00,
    0x00,
    ...rrc,
    SYSEX_END,
  ];
}

export type ParsedMessage =
  | { kind: 'ack' }
  | { kind: 'discovery-response' }
  | { kind: 'read-response'; final: boolean; pageId: number; payload: Uint8Array }
  | { kind: 'config-write'; addr: number; value: number }
  | { kind: 'other'; data: Uint8Array };

/** Classify a complete SysEx frame (F0 ... F7). */
export function parseMessage(bytes: Uint8Array | readonly number[]): ParsedMessage {
  const data = Uint8Array.from(bytes);
  if (
    data.length >= 4 &&
    data[0] === SYSEX_START &&
    data[1] === MANUFACTURER[0] &&
    data[2] === MANUFACTURER[1]
  ) {
    const cmd = data[3];
    if (cmd === CMD_ACK && data[4] === 0x08) return { kind: 'ack' };
    if (cmd === CMD_DISCOVERY && data[4] === 0x58) return { kind: 'discovery-response' };
    if (cmd === CMD_READ && (data[4] === SUB_READ_RESP || data[4] === SUB_READ_RESP_FINAL)) {
      // F0 00 32 0D 49/79 <x> 00 00 02 <addr:4> 10 7E 00 00 <payload...> <ck2> F7
      // The echoed address can span three 7-bit bytes (blob addresses go up
      // to 23645), so all significant bytes must be decoded.
      const pageId = decodeAddress(Array.from(data.slice(9, 13)));
      const payload = data.slice(17, data.length - 3);
      return { kind: 'read-response', final: data[4] === SUB_READ_RESP_FINAL, pageId, payload };
    }
    if (cmd === CMD_CONFIG && data[4] === SUB_CONFIG_WRITE && data.length === 21) {
      return {
        kind: 'config-write',
        addr: decodeAddress(Array.from(data.slice(9, 13))),
        value: data[17],
      };
    }
  }
  return { kind: 'other', data };
}

/** Hex string helper used by the monitor and tests. */
export function toHex(bytes: Uint8Array | readonly number[]): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
}
