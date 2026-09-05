import { describe, expect, it, vi } from 'vitest';
import { CommsService, CONFIG_TAIL_START, READ_PAGE_COUNT, type MonitorEntry } from '../device';
import type { MidiDevicePair, MidiMessageEvent, MidiTransport } from '../midi';
import {
  ADDR,
  buildBankClearWrite,
  buildConfigWrite,
  decodeAddress,
  midiCodeAddr,
  packPackedMode,
  SYSEX_END,
  SYSEX_START,
} from '../sysex';

// The service mirrors all traffic to the console - silence it in tests.
vi.spyOn(console, 'info').mockImplementation(() => {});

const pair: MidiDevicePair = {
  key: 'device-key',
  name: 'Chocolate Plus',
  manufacturer: 'SinCo',
  inputId: 'in-1',
  outputId: 'out-1',
};

/** Fixed 01 08 write acknowledgement frame. */
const ACK = [0xf0, 0x00, 0x32, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00, 0x7f, 0x01, 0xf7];

function discoveryResponse(): number[] {
  // Prefix is all parseMessage needs: F0 00 32 45 58 ... F7
  return [0xf0, 0x00, 0x32, 0x45, 0x58, 0x01, 0xf7];
}

function readResponse(pageId: number, payload: number[], final = false): number[] {
  return [
    SYSEX_START,
    0x00,
    0x32,
    0x0d,
    final ? 0x79 : 0x49,
    0x3f,
    0x00,
    0x00,
    0x02,
    ...decodeAddressToBytes(pageId),
    0x10,
    0x7e,
    0x00,
    0x00,
    ...payload,
    0x00,
    0x00,
    SYSEX_END,
  ];
}

function decodeAddressToBytes(addr: number): number[] {
  return [addr & 0x7f, (addr >> 7) & 0x7f, (addr >> 14) & 0x7f, 0];
}

/** Page 0 payload: [mode, TRS, channel, (latch, cc) x5, filler]. */
const PAGE_0_PAYLOAD = [3, 1, 5, 1, 10, 0, 20, 1, 30, 0, 40, 1, 50, 0xab, 0xcd];

/**
 * Scripted in-memory transport. Replies like the device would: after a short
 * macrotask delay, so responses arrive after expectations are registered -
 * matching real device latency.
 */
class FakeTransport implements MidiTransport {
  readonly sent: number[][] = [];
  /** When false, configuration read requests go unanswered (timeout path). */
  answerReads = true;
  private listeners: ((ev: MidiMessageEvent) => void)[] = [];

  async requestAccess(): Promise<void> {}

  async openInput(): Promise<void> {}

  listDevices(): MidiDevicePair[] {
    return [pair];
  }

  onMessage(cb: (ev: MidiMessageEvent) => void): void {
    this.listeners.push(cb);
  }

  async send(_key: string, bytes: readonly number[]): Promise<void> {
    const frame = [...bytes];
    this.sent.push(frame);
    const response = this.responseFor(frame);
    if (response) {
      setTimeout(() => this.deliver(response), 0);
    }
  }

  private deliver(bytes: number[]): void {
    this.deliverOn(pair.inputId ?? 'in-1', bytes, pair.name);
  }

  /** Deliver a message as if it arrived on an arbitrary port id/name. */
  deliverOn(key: string, bytes: number[], name?: string | null): void {
    const event: MidiMessageEvent = {
      key,
      name: name ?? null,
      bytes: Uint8Array.from(bytes),
      timestamp: 0,
    };
    for (const cb of this.listeners) cb(event);
  }

  private responseFor(frame: number[]): number[] | null {
    const cmd = frame[3];
    if (cmd === 0x45) return discoveryResponse();
    if (cmd === 0x0d && frame[4] === 0x41) {
      if (!this.answerReads) return null;
      const pageId = decodeAddress(frame.slice(9, 13));
      // The final read request (marker 70 36) is answered with the 0D 79 frame.
      const final = frame[13] === 0x70;
      return readResponse(pageId, this.payloadFor(pageId), final);
    }
    if (cmd === 0x09 && (frame[4] === 0x49 || frame[4] === 0x41)) return ACK;
    return null;
  }

  protected payloadFor(pageId: number): number[] {
    if (pageId === 0) return PAGE_0_PAYLOAD;
    if (pageId === 23 * 1009) return new Array<number>(501).fill(0); // final tail record
    return Array.from({ length: 16 }, (_, i) => (i + pageId) & 0x7f);
  }
}

function makeService(transport: FakeTransport, readTimeoutMs = 200): CommsService {
  return new CommsService(transport, { scanSettleMs: 0, readTimeoutMs });
}

describe('CommsService', () => {
  it('lists only devices that answer the discovery request', async () => {
    const comms = makeService(new FakeTransport());
    await comms.scan();

    expect(comms.getDevices()).toHaveLength(1);
    expect(comms.getDevices()[0].status).toBe('detected');
    expect(comms.getConnected()).toBeNull();
  });

  it('labels RX traffic with the port name even when the port id is unknown', async () => {
    const transport = new FakeTransport();
    const comms = makeService(transport);
    await comms.scan();

    const entries: MonitorEntry[] = [];
    comms.onMonitor((e) => entries.push(e));

    // Chrome's Bluetooth MIDI can deliver on an opaque id (base64 blob) that
    // never appeared during scan - the label must come from the port name.
    const opaqueId = 'oTOsU1uUoSgvk1iUtf6SzyhIz/ltcQEr8S1S8nWnuWE=';
    transport.deliverOn(opaqueId, discoveryResponse(), 'Chocolate Plus');

    expect(entries).toHaveLength(1);
    expect(entries[0].device).toBe('Chocolate Plus');
    expect(entries[0].dir).toBe('RX');
  });

  it('falls back to a generic label instead of leaking a raw port id', async () => {
    const transport = new FakeTransport();
    const comms = makeService(transport);
    await comms.scan();

    const entries: MonitorEntry[] = [];
    comms.onMonitor((e) => entries.push(e));
    transport.deliverOn('opaque-unknown-id', discoveryResponse(), null);

    expect(entries[0].device).toBe('Unknown MIDI port');
  });

  it('connects, decodes page 0 into the config and captures raw pages', async () => {
    const transport = new FakeTransport();
    const comms = makeService(transport);
    await comms.scan();
    await comms.connect(pair.key);

    const device = comms.getConnected();
    expect(device?.status).toBe('connected');
    expect(device?.config.mode).toBe(3);
    expect(device?.config.midiInterface).toBe(1);
    expect(device?.config.midiChannel).toBe(5);
    expect(device?.config.customCc[0]).toEqual([10, 1]);
    expect(device?.config.customCc[4]).toEqual([50, 1]);

    // One read request per page.
    expect(transport.sent.filter((f) => f[3] === 0x0d)).toHaveLength(READ_PAGE_COUNT);

    // Raw pages land in the export, hex-encoded per byte.
    const page0 = comms.exportState().rawPages?.find((p) => p.index === 0);
    expect(page0?.payloadHex).toBe('030105010a0014011e00280132abcd');
  });

  it('sends bit-perfect config writes and updates local state after the ack', async () => {
    const transport = new FakeTransport();
    const comms = makeService(transport);
    await comms.scan();
    await comms.connect(pair.key);

    await comms.setMode(5);

    expect(transport.sent.at(-1)).toEqual(buildConfigWrite(ADDR.mode, 5));
    expect(comms.getConnected()?.config.mode).toBe(5);
  });

  it('fails clearly when the device stops answering reads', async () => {
    const transport = new FakeTransport();
    transport.answerReads = false;
    const comms = makeService(transport, 5);
    await comms.scan();

    await expect(comms.connect(pair.key)).rejects.toThrow(/stopped answering/);
    expect(comms.getDevices()[0].status).toBe('failed');
    expect(comms.getConnected()).toBeNull();
  });

  it('rejects connecting to an unknown device key', async () => {
    const comms = makeService(new FakeTransport());
    await comms.scan();
    await expect(comms.connect('nope')).rejects.toThrow('Unknown device');
  });

  it('aborts an in-flight read-back on disconnect without retrying', async () => {
    const transport = new FakeTransport();
    const comms = makeService(transport, 1000);
    await comms.scan();
    await comms.connect(pair.key);
    const readsAfterConnect = transport.sent.filter((f) => f[3] === 0x0d).length;

    transport.answerReads = false; // leave the next read-back unanswered
    const reread = comms.reread().catch((err: Error) => err.message);
    await new Promise((r) => setTimeout(r, 0)); // let the read-back start
    comms.disconnect();

    expect(await reread).toBe('Device disconnected');
    // Exactly one reread read was sent - no retry on a disconnected device.
    const reads = transport.sent.filter((f) => f[3] === 0x0d);
    expect(reads).toHaveLength(readsAfterConnect + 1);
    expect(comms.getConnected()).toBeNull();
  });
});

/**
 * Transport whose read-back carries real-size pages with Advanced Custom
 * bank data and a populated trailing system block in the final `0D 79`
 * record (the device streams the last READ_TAIL_LEN bytes of the blob there,
 * aligned to the blob end - see CONFIG_TAIL_START).
 */
class AdvTransport extends FakeTransport {
  protected payloadFor(pageId: number): number[] {
    if (pageId === 0) {
      const p = new Uint8Array(1153);
      p[0] = 3; // Advanced Custom mode
      // usr page 0, switch A packed block at 106: mode 2 (press-release) and
      // one bank-A code = enabled CC(5,99) on channel 1:
      //   mode<<2 = 2<<2 = 8, then R0=(1&7)<<4=0x10 (ch1), R1=(1<<5)|0=0x20,
      //   R2=(5&1)<<6=0x40, R3=5>>1=2, R4=99.
      p[106] = packPackedMode(2);
      // slot0 (R-codec, mark 0x08) at live P[0]=107: marker then 5 content
      p[107] = 0x08;
      const rec = [0x10, 0x20, 0x40, 0x02, 0x63]; // slot1: CC(5,99) ch1 (R-codec)
      for (let i = 0; i < 5; i++) p[108 + i] = rec[i];
      // slot1 (codec2, mark 0x02) at live P[1]=113: marker then content
      p[113] = 0x02;
      const rec2 = [0x10, 0x08, 0x00, 0x45, 0x0c]; // ch4<<2=0x10, CC<<3=0x08
      for (let i = 0; i < 5; i++) p[114 + i] = rec2[i];
      return Array.from(p);
    }
    if (pageId === 1009) {
      // Response 1 = blob 1153..2305: switch D packed block at 106 + 3*480 = 1546
      // (mode 3 long press) with one bank-A code = enabled PC(7) ch0.
      const p = new Uint8Array(1153);
      const base = 1546 - 1153;
      p[base] = packPackedMode(3);
      p[base + 1] = 0x08;
      const rec = [0x00, 0x00, 0x40, 0x03, 0x00]; // PC(0) ch0 d1=7
      for (let i = 0; i < 5; i++) p[base + 2 + i] = rec[i];
      return Array.from(p);
    }
    if (pageId === 23 * 1009) {
      const p = new Uint8Array(501);
      const off = ADDR.polarity - CONFIG_TAIL_START; // 497
      p[ADDR.maxBanksPcA - CONFIG_TAIL_START] = 3; // maxBanksPcA = 3+1 = 4
      p[off - 2] = 0; // usrPage = variant 1
      p[off] = 2; // polarity = on
      return Array.from(p);
    }
    return super.payloadFor(pageId);
  }
}

describe('Advanced Custom banks', () => {
  it('decodes the active usr page banks from the read-back', async () => {
    const comms = makeService(new AdvTransport());
    await comms.scan();
    await comms.connect(pair.key);

    const cfg = comms.getConnected()?.config;
    expect(cfg?.usrPage).toBe(0);
    expect(cfg?.footswitchModes[0]).toBe(2);
    expect(cfg?.footswitchModes[3]).toBe(3);
    expect(cfg?.footswitchBanks[0]?.[0].codes[0]).toEqual({
      enabled: true,
      channel: 1,
      type: 1,
      data1: 5,
      data2: 99,
    });
    // Slot 1 in a 2-slot bank is an unverified sparse-occupancy state: the
    // decoder must NOT fabricate it (the fixed-position model only holds for
    // the fully-populated bank or single-slot states).
    expect(cfg?.footswitchBanks[0]?.[0].codes[1]).toEqual({
      enabled: false,
      channel: 0,
      type: 0,
      data1: 0,
      data2: 0,
    });
    // 8+ slots populated (with the mode byte) makes the bank "full"-ish, so
    // slots 2+ of the page-0 bank should still decode; fs3 (switch D, single
    // populated slot) is a single-slot state and decodes its slot 0 exactly.
    expect(cfg?.footswitchBanks[3]?.[0].codes[0]).toEqual({
      enabled: true,
      channel: 0,
      type: 0,
      data1: 7,
      data2: 0,
    });
    expect(cfg?.maxBanksPcA).toBe(4);
    expect(cfg?.reversePolarity).toBe(true);
  });

  it('writes a bank midi-code entry byte-by-byte, then the enable flag', async () => {
    const transport = new FakeTransport();
    const comms = makeService(transport);
    await comms.scan();
    await comms.connect(pair.key);

    await comms.setFootswitchMidiCode(0, 0, 0, 0, {
      enabled: true,
      channel: 2,
      type: 1,
      data1: 93,
      data2: 0,
    });

    const base = midiCodeAddr(0, 0, 0, 0, 0);
    expect(transport.sent.at(-5)).toEqual(buildConfigWrite(base + 1, 2)); // channel
    expect(transport.sent.at(-4)).toEqual(buildConfigWrite(base + 2, 1)); // type
    expect(transport.sent.at(-3)).toEqual(buildConfigWrite(base + 3, 93)); // data1
    expect(transport.sent.at(-2)).toEqual(buildConfigWrite(base + 4, 0)); // data2
    expect(transport.sent.at(-1)).toEqual(buildConfigWrite(base, 1)); // enable last

    expect(comms.getConnected()?.config.footswitchBanks[0]?.[0].codes[0]).toEqual({
      enabled: true,
      channel: 2,
      type: 1,
      data1: 93,
      data2: 0,
    });
  });

  it('forces data 2 to zero for PC messages on write', async () => {
    const transport = new FakeTransport();
    const comms = makeService(transport);
    await comms.scan();
    await comms.connect(pair.key);

    // A PC message (type 0) with a spurious data 2 must be zeroed when stored.
    await comms.setFootswitchMidiCode(0, 0, 0, 3, {
      enabled: true,
      channel: 4,
      type: 0,
      data1: 7,
      data2: 99,
    });

    const base = midiCodeAddr(0, 0, 0, 3, 0);
    expect(transport.sent.at(-2)).toEqual(buildConfigWrite(base + 4, 0)); // data2 forced to 0
    expect(comms.getConnected()?.config.footswitchBanks[0]?.[0].codes[3]).toEqual({
      enabled: true,
      channel: 4,
      type: 0,
      data1: 7,
      data2: 0,
    });
  });

  it('clears a whole bank with one bulk write, matching the official app', async () => {
    const transport = new FakeTransport();
    const comms = makeService(transport);
    await comms.scan();
    await comms.connect(pair.key);

    await comms.setFootswitchMidiCode(0, 0, 1, 3, {
      enabled: true,
      channel: 0,
      type: 0,
      data1: 7,
      data2: 0,
    });
    const before = transport.sent.length;
    await comms.clearFootswitchBanks(0, 0, 1);

    // One 111-byte `09 41` bulk write instead of 80 single-byte writes.
    const writes = transport.sent.slice(before);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual(buildBankClearWrite(0, 0, 1));
    expect(comms.getConnected()?.config.footswitchBanks[0]?.[1].codes[3].enabled).toBe(false);
  });
});

/**
 * Transport that reproduces the captured read-back encoding exactly: the TRS
 * field (blob 1) and the polarity field (blob 23642) both report their ON
 * state as 2, and the polarity lives in the final `0D 79` tail record.
 */
class EncodingTransport extends FakeTransport {
  constructor(
    private trs: number,
    private polarity: number
  ) {
    super();
  }

  protected payloadFor(pageId: number): number[] {
    if (pageId === 0) {
      const p = PAGE_0_PAYLOAD.slice(); // [3, 1, 5, ...]
      p[1] = this.trs;
      return p;
    }
    if (pageId === 23 * 1009) {
      const p = new Uint8Array(501);
      p[ADDR.polarity - CONFIG_TAIL_START] = this.polarity; // blob 23642
      return Array.from(p);
    }
    return super.payloadFor(pageId);
  }
}

describe('TRS jack and polarity read-back', () => {
  it('decodes the device 0/2 encoding like the official app (4 captures)', async () => {
    // The four open-device captures: trs_midi enabled/disabled x polarity
    // reversal enabled/disabled. In each, the ON state reads back as 2.
    const cases = [
      { trs: 0, polarity: 0, midiInterface: 0, reversePolarity: false },
      { trs: 0, polarity: 2, midiInterface: 0, reversePolarity: true },
      { trs: 2, polarity: 0, midiInterface: 1, reversePolarity: false },
      { trs: 2, polarity: 2, midiInterface: 1, reversePolarity: true },
    ];
    for (const c of cases) {
      const comms = makeService(new EncodingTransport(c.trs, c.polarity));
      await comms.scan();
      await comms.connect(pair.key);
      const cfg = comms.getConnected()?.config;
      expect(cfg?.midiInterface).toBe(c.midiInterface);
      expect(cfg?.reversePolarity).toBe(c.reversePolarity);
    }
  });
});
