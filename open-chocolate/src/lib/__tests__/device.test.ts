import { describe, expect, it, vi } from 'vitest';
import { CommsService, READ_PAGE_COUNT, type MonitorEntry } from '../device';
import type { MidiDevicePair, MidiMessageEvent, MidiTransport } from '../midi';
import { ADDR, buildConfigWrite, decodeAddress, SYSEX_END, SYSEX_START } from '../sysex';

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
    if (cmd === 0x09 && frame[4] === 0x49) return ACK;
    return null;
  }

  private payloadFor(pageId: number): number[] {
    if (pageId === 0) return PAGE_0_PAYLOAD;
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
