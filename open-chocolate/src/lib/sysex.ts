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

/** Fixed parameter following the sub-command (offsets 5-8). */
export const FIXED_PARAM = [0x00, 0x00, 0x00, 0x02] as const;

/** Checksum constants per address family. */
export const CK_DEFAULT = 0x28a;
export const CK_FOOTSWITCH_B = 0x38b;
export const CK_FOOTSWITCH_C = 0x18b;
export const CK_SYSTEM = 0x20b;

/**
 * Configuration addresses (verified against the official app's struct layout
 * and the captured writes). The full configuration blob is 23646 bytes.
 */
export const ADDR = {
  mode: 0x0000, // operating mode (0..12)
  midiInterface: 0x0001, // 0 = expression pedal, 1 = TRS-MIDI
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
  polarity: 23642, // 0 = off, 1 = on
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
  // Advanced Custom per-switch mode bytes (93 + k*417, k = page*4 + switch):
  // the captured constants follow the switch position within the page.
  const rel = addr - 93;
  if (rel >= 0 && rel < 8 * 417 && rel % 417 === 0) {
    const sw = Math.floor(rel / 417) % 4;
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
