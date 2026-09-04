import { describe, expect, it } from 'vitest';
import {
  ADDR,
  buildConfigWrite,
  buildDiscoveryRequest,
  buildReadRequest,
  checksum,
  checksumConstantFor,
  decode14,
  decodeAddress,
  encode14,
  encodeAddress,
  footswitchAddr,
  isDiscoveryResponse,
  parseMessage,
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
    expect(isDiscoveryResponse(resp)).toBe(true);
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
