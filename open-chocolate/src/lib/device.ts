/**
 * Communication service for the M-Vave Chocolate Plus.
 *
 * Implements discovery (across all MIDI devices), the connect/init sequence
 * (configuration read-back), configuration writes and a message monitor.
 * No Vue/UI code here - the UI subscribes to listeners and calls methods.
 */

import { MidiAccess, type MidiDevicePair, type MidiMessageEvent } from './midi';
import {
  ADDR,
  buildConfigWrite,
  buildDiscoveryRequest,
  buildReadRequest,
  CUSTOM_CC_BANKS,
  footswitchAddr,
  parseMessage,
  SYSEX_END,
  SYSEX_START,
  toHex,
  type ParsedMessage,
} from './sysex';

/** Rolling request counter observed in the official app capture, per read. */
const INIT_READ_RR = [
  7, 19, 30, 41, 52, 63, 74, 85, 96, 107, 118, 129, 140, 151, 162, 173, 184, 195, 207, 218, 229,
  240, 251, 66,
];

export const READ_PAGE_COUNT = 24;
/** Read-request addresses step by this stride (23646 / ~23.4). */
export const READ_PAGE_STRIDE = 1009;

/** How long to wait for a single read response before retrying (ms). */
const READ_TIMEOUT_MS = 2500;

/** Best-effort budget for the explicit input open() call (ms). */
const OPEN_TIMEOUT_MS = 2500;

export type DeviceStatus = 'detected' | 'connecting' | 'connected' | 'failed';

export interface MonitorEntry {
  id: number;
  dir: 'RX' | 'TX';
  /** Device name the message was sent to / received from. */
  device: string;
  /** performance.now() ms at send/receive time */
  timestamp: number;
  /** Date.now() ms for display */
  wall: number;
  bytes: Uint8Array;
}

/** Decoded device configuration (what the UI edits). */
export interface DeviceConfig {
  /** Operating mode id (0..12) or null when unknown. */
  mode: number | null;
  /** 0 = expression pedal, 1 = TRS-MIDI. */
  midiInterface: number | null;
  /** MIDI channel, 0-based (UI shows +1). */
  midiChannel: number | null;
  polarity: boolean;
  /** Maximum group count 1..8 (value written = count - 1). */
  maxGroupCount: number | null;
  /** Max banks per Program Change mode (value written = count - 1). */
  maxBanksPcA: number | null;
  maxBanksPcB: number | null;
  /** Advanced Custom variant page: 0 = mode 1, 1 = mode 2. */
  usrPage: number | null;
  /** Custom mode per-bank values: [cc, latch] per bank (5 slots). */
  customCc: ([number, number] | [null, null])[];
  /** Step behaviour of footswitches A, B, C, D (Advanced Custom). */
  footswitchModes: (number | null)[];
}

export function emptyConfig(): DeviceConfig {
  return {
    mode: null,
    midiInterface: null,
    midiChannel: null,
    polarity: false,
    maxGroupCount: null,
    maxBanksPcA: null,
    maxBanksPcB: null,
    usrPage: null,
    customCc: Array.from({ length: CUSTOM_CC_BANKS }, () => [null, null] as [null, null]),
    footswitchModes: [null, null, null, null],
  };
}

export interface ChocolateDevice {
  pair: MidiDevicePair;
  status: DeviceStatus;
  config: DeviceConfig;
}

interface PendingExpectation {
  match: (msg: ParsedMessage) => boolean;
  resolve: (msg: ParsedMessage) => void;
  reject: (err: Error) => void;
  timer: number;
}

const sleep = (ms: number) => new Promise((r) => globalThis.setTimeout(r, ms));

/** Split MIDI bytes into complete SysEx frames (F0 ... F7) using `buf`. */
export function frameStream(bytes: Uint8Array, state: number[]): number[][] {
  const frames: number[][] = [];
  for (const b of bytes) {
    if (b === SYSEX_START) {
      state.length = 0;
      state.push(b);
    } else if (state.length > 0) {
      state.push(b);
      if (b === SYSEX_END) {
        frames.push([...state]);
        state.length = 0;
      }
    }
  }
  return frames;
}

export class CommsService {
  readonly midi = new MidiAccess();
  private devices = new Map<string, ChocolateDevice>();
  private connectedKey: string | null = null;
  private connectingDevice: ChocolateDevice | null = null;
  private pending: PendingExpectation[] = [];
  private monitorListeners: ((entry: MonitorEntry) => void)[] = [];
  private devicesListeners: ((devices: ChocolateDevice[]) => void)[] = [];
  private stateListeners: (() => void)[] = [];
  private monitorId = 0;
  private rxHooked = false;
  /** Per-input-port SysEx reassembly buffers. */
  private rxState = new Map<string, number[]>();
  /** While scanning: input-port keys that answered the discovery request. */
  private discoveryResponders: Set<string> | null = null;
  /** port id -> device name, for monitor labels. */
  private portLabels = new Map<string, string>();

  lastError: string | null = null;

  /** Raw payloads of the last read-back, keyed by page index. */
  readonly rawPages = new Map<number, Uint8Array>();

  onMonitor(cb: (entry: MonitorEntry) => void): void {
    this.monitorListeners.push(cb);
  }

  onDevices(cb: (devices: ChocolateDevice[]) => void): void {
    this.devicesListeners.push(cb);
    cb(this.getDevices());
  }

  /** Fired after scan/connect/disconnect/any status change. */
  onState(cb: () => void): void {
    this.stateListeners.push(cb);
  }

  getDevices(): ChocolateDevice[] {
    return [...this.devices.values()];
  }

  getConnected(): ChocolateDevice | null {
    return this.connectedKey ? (this.devices.get(this.connectedKey) ?? null) : null;
  }

  private emitState(): void {
    const devices = this.getDevices();
    for (const cb of this.devicesListeners) cb(devices);
    for (const cb of this.stateListeners) cb();
  }

  private log(dir: 'RX' | 'TX', portId: string, bytes: Uint8Array): void {
    const device = this.portLabels.get(portId) ?? portId;
    const entry: MonitorEntry = {
      id: ++this.monitorId,
      dir,
      device,
      timestamp: performance.now(),
      wall: Date.now(),
      bytes,
    };
    // Mirror everything to the devtools console, labeled by device.
    console.info(`[open-chocolate] ${dir} ${device} (${bytes.length} B): ${toHex(bytes)}`);
    for (const cb of this.monitorListeners) cb(entry);
  }

  private async tx(portId: string, bytes: readonly number[]): Promise<void> {
    this.log('TX', portId, Uint8Array.from(bytes));
    await this.midi.send(portId, bytes);
  }

  /** Wait for the next matching message or reject after `timeoutMs`. */
  private expect(
    match: (msg: ParsedMessage) => boolean,
    timeoutMs: number
  ): Promise<ParsedMessage> {
    return new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        this.pending = this.pending.filter((p) => p.timer !== timer);
        reject(new Error('Device did not respond (timeout)'));
      }, timeoutMs);
      this.pending.push({ match, resolve, reject, timer });
    });
  }

  /**
   * Request MIDI access and probe every MIDI device with a discovery request.
   * Only devices that answer with a valid discovery response are listed.
   */
  async scan(): Promise<void> {
    await this.midi.requestAccess();
    if (!this.rxHooked) {
      this.midi.onMessage(this.handleRawMessage);
      this.rxHooked = true;
    }

    const pairs = this.midi.listDevices();
    this.portLabels.clear();
    for (const pair of pairs) {
      if (pair.inputId) this.portLabels.set(pair.inputId, pair.name);
      if (pair.outputId) this.portLabels.set(pair.outputId, pair.name);
    }

    // Fresh list - only responders will be added back.
    this.devices = new Map();
    this.emitState();

    const responders = new Set<string>();
    this.discoveryResponders = responders;
    const request = buildDiscoveryRequest();
    for (const pair of pairs) {
      if (pair.outputId) {
        await this.tx(pair.outputId, request);
      }
    }
    await sleep(1500); // give devices time to answer
    this.discoveryResponders = null;

    for (const inputKey of responders) {
      const pair = pairs.find((p) => p.inputId === inputKey);
      if (!pair) continue;
      this.devices.set(pair.key, { pair, status: 'detected', config: emptyConfig() });
    }
    // A previously connected device that no longer responds is gone.
    if (this.connectedKey && !this.devices.has(this.connectedKey)) {
      this.connectedKey = null;
    }
    this.emitState();
  }

  /**
   * Reassemble complete SysEx frames from the MIDI byte stream and dispatch.
   * SysEx can be split across several MIDI messages, so a buffer is kept
   * per input port.
   */
  private handleRawMessage = (ev: MidiMessageEvent): void => {
    let buf = this.rxState.get(ev.key);
    if (!buf) {
      buf = [];
      this.rxState.set(ev.key, buf);
    }
    const frames = frameStream(ev.bytes, buf);
    for (const frame of frames) {
      this.log('RX', ev.key, Uint8Array.from(frame));
      const msg = parseMessage(frame);
      if (msg.kind === 'discovery-response' && this.discoveryResponders) {
        this.discoveryResponders.add(ev.key);
        continue;
      }
      this.dispatch(msg);
    }
  };

  private dispatch(msg: ParsedMessage): void {
    this.pending = this.pending.filter((p) => {
      if (p.match(msg)) {
        globalThis.clearTimeout(p.timer);
        p.resolve(msg);
        return false;
      }
      return true;
    });
  }

  /** Connect: open the input port and run the full read-back sequence. */
  async connect(device: ChocolateDevice): Promise<void> {
    const current = this.getConnected();
    if (current && current !== device) current.status = 'detected';

    const outputId = device.pair.outputId;
    const inputId = device.pair.inputId;
    if (!outputId || !inputId) {
      device.status = 'failed';
      this.lastError = 'Device exposes no usable MIDI ports';
      this.emitState();
      throw new Error(this.lastError);
    }

    device.status = 'connecting';
    this.connectingDevice = device;
    this.emitState();

    try {
      // Best-effort explicit open. Delivery already starts when a handler is
      // set, and a hung open() must never block connecting.
      await Promise.race([this.midi.openInput(inputId), sleep(OPEN_TIMEOUT_MS)]);
      await this.runInitSequence(outputId);
      device.status = 'connected';
      this.connectedKey = device.pair.key;
      this.lastError = null;
    } catch (err) {
      device.status = 'failed';
      this.lastError = err instanceof Error ? err.message : String(err);
      this.connectedKey = null;
      throw err;
    } finally {
      this.connectingDevice = null;
      this.emitState();
    }
  }

  disconnect(): void {
    const device = this.getConnected();
    if (device) device.status = 'detected';
    this.connectedKey = null;
    this.emitState();
  }

  /**
   * Captured init/read-back sequence:
   * 1. discovery request (device replies with the 45 58 response)
   * 2. 23 configuration reads (0D 41 -> 0D 49, 1173-byte records)
   * 3. a 24th read with special marker -> 0D 79 record (521 bytes)
   *
   * The official app then re-writes six live settings. Those writes mirror
   * the settings of the captured session; they are intentionally not sent
   * automatically - the UI sends writes when the user changes settings.
   */
  private async runInitSequence(outputKey: string): Promise<void> {
    await this.tx(outputKey, buildDiscoveryRequest());
    // The device answers every discovery request; wait briefly and move on.
    await this.expect((m) => m.kind === 'discovery-response', 2000).catch(() => undefined);

    for (let i = 0; i < READ_PAGE_COUNT; i++) {
      const final = i === READ_PAGE_COUNT - 1;
      const pageId = i * READ_PAGE_STRIDE;
      const match = (m: ParsedMessage) =>
        m.kind === 'read-response' && m.pageId === pageId && m.final === final;

      // One retry per page: a single dropped response must not abort the
      // whole session, but a silent device must fail fast and clearly.
      let resp: ParsedMessage | null = null;
      for (let attempt = 1; attempt <= 2 && !resp; attempt++) {
        await this.tx(outputKey, buildReadRequest(pageId, INIT_READ_RR[i], final));
        try {
          resp = await this.expect(match, READ_TIMEOUT_MS);
        } catch {
          if (attempt === 2) {
            throw new Error(
              `Device stopped answering configuration reads (page ${i + 1}/${READ_PAGE_COUNT}). Disconnect and rescan.`
            );
          }
        }
      }
      if (resp && resp.kind === 'read-response') {
        this.absorbPage(i, resp.payload);
      }
    }
  }

  /** Pull known configuration values out of a page payload. */
  private absorbPage(index: number, payload: Uint8Array): void {
    const device = this.connectingDevice ?? this.getConnected();
    if (!device) return;
    if (index === 0 && payload.length > 2) {
      // Page 0 begins the config blob: [mode, trs, channel, custom-mode data...]
      device.config.mode = payload[0];
      if (payload[1] === 0 || payload[1] === 1) device.config.midiInterface = payload[1];
      if (payload[2] <= 15) device.config.midiChannel = payload[2];
      // Custom-mode banks: blob 3+2b = latch, 4+2b = CC value (per the
      // official app's FC2Struct: usr[b][0] = toggle, usr[b][1] = CC).
      for (let bank = 0; bank < CUSTOM_CC_BANKS; bank++) {
        const latch = payload[3 + bank * 2];
        const cc = payload[4 + bank * 2];
        device.config.customCc[bank] = [cc, latch];
      }
    }
    this.rawPages.set(index, Uint8Array.from(payload));
  }

  /**
   * Re-run the configuration read-back on the connected device and refresh
   * the decoded settings.
   */
  async reread(): Promise<void> {
    const device = this.getConnected();
    if (!device) throw new Error('Not connected');
    const outputId = device.pair.outputId;
    if (!outputId) throw new Error('Device has no MIDI output');
    await this.runInitSequence(outputId);
    this.emitState();
  }

  /** Send a configuration write and wait for the 01 08 acknowledgement. */
  async writeConfig(addr: number, value: number): Promise<void> {
    const device = this.getConnected();
    if (!device) throw new Error('Not connected');
    const outputId = device.pair.outputId;
    if (!outputId) throw new Error('Device has no MIDI output');
    await this.tx(outputId, buildConfigWrite(addr, value));
    await this.expect((m) => m.kind === 'ack', 2000);
  }

  async setMode(mode: number): Promise<void> {
    await this.writeConfig(ADDR.mode, mode);
    const device = this.getConnected();
    if (device) device.config.mode = mode;
    this.emitState();
  }

  async setMidiInterface(trs: boolean): Promise<void> {
    const value = trs ? 1 : 0;
    await this.writeConfig(ADDR.midiInterface, value);
    this.getConnected()!.config.midiInterface = value;
    this.emitState();
  }

  async setMidiChannel(ch0: number): Promise<void> {
    await this.writeConfig(ADDR.midiChannel, ch0);
    this.getConnected()!.config.midiChannel = ch0;
    this.emitState();
  }

  async setPolarity(enabled: boolean): Promise<void> {
    const value = enabled ? 1 : 0;
    await this.writeConfig(ADDR.polarity, value);
    this.getConnected()!.config.polarity = enabled;
    this.emitState();
  }

  async setMaxGroupCount(count: number): Promise<void> {
    await this.writeConfig(ADDR.maxGroupCount, count - 1);
    this.getConnected()!.config.maxGroupCount = count;
    this.emitState();
  }

  /** Set the maximum bank count (1-32) of Program Change mode A or B. */
  async setMaxBanks(which: 0 | 1, count: number): Promise<void> {
    const addr = which === 0 ? ADDR.maxBanksPcA : ADDR.maxBanksPcB;
    await this.writeConfig(addr, count - 1);
    const device = this.getConnected();
    if (device) {
      if (which === 0) device.config.maxBanksPcA = count;
      else device.config.maxBanksPcB = count;
    }
    this.emitState();
  }

  /** Select the Advanced Custom variant page (0 = mode 1, 1 = mode 2). */
  async setUsrPage(page: 0 | 1): Promise<void> {
    await this.writeConfig(ADDR.usrPage, page);
    this.getConnected()!.config.usrPage = page;
    this.emitState();
  }

  async setCustomCc(bank: number, cc: number, latch: number): Promise<void> {
    await this.writeConfig(ADDR.customBankFirst + bank * 2, latch);
    await this.writeConfig(ADDR.customBankFirst + bank * 2 + 1, cc);
    this.getConnected()!.config.customCc[bank] = [cc, latch];
    this.emitState();
  }

  /** Set the step behaviour of one footswitch within an Advanced Custom page. */
  async setFootswitchMode(page: 0 | 1, index: 0 | 1 | 2 | 3, step: number): Promise<void> {
    await this.writeConfig(footswitchAddr(page, index), step);
    this.getConnected()!.config.footswitchModes[index] = step;
    this.emitState();
  }

  /** Snapshot of the connected device config for import/export. */
  exportState(): CommsSnapshot {
    const device = this.getConnected();
    return {
      app: 'open-chocolate',
      version: 1,
      savedAt: new Date().toISOString(),
      device: device ? { name: device.pair.name, manufacturer: device.pair.manufacturer } : null,
      config: device ? JSON.parse(JSON.stringify(device.config)) : emptyConfig(),
      rawPages: [...this.rawPages.entries()].map(([index, payload]) => ({
        index,
        payloadHex: Array.from(payload, (b) => b.toString(16).padStart(2, '0')).join(''),
      })),
    };
  }

  /** Load a snapshot into app state (does not touch the device). */
  importState(snapshot: CommsSnapshot): void {
    const device = this.getConnected();
    if (!device) throw new Error('Connect to a device before importing a configuration');
    const cfg = snapshot.config;
    device.config = {
      mode: numOrNull(cfg.mode),
      midiInterface: numOrNull(cfg.midiInterface),
      midiChannel: numOrNull(cfg.midiChannel),
      polarity: Boolean(cfg.polarity),
      maxGroupCount: numOrNull(cfg.maxGroupCount),
      maxBanksPcA: numOrNull(cfg.maxBanksPcA),
      maxBanksPcB: numOrNull(cfg.maxBanksPcB),
      usrPage: numOrNull(cfg.usrPage),
      customCc: Array.from({ length: CUSTOM_CC_BANKS }, (_, i) => {
        const pair = Array.isArray(cfg.customCc) ? cfg.customCc[i] : null;
        if (Array.isArray(pair) && pair.length === 2) {
          const cc = numOrNull(pair[0]);
          const latch = numOrNull(pair[1]);
          if (cc !== null && latch !== null) return [cc, latch] as [number, number];
        }
        return [null, null] as [null, null];
      }),
      footswitchModes: [0, 1, 2, 3].map((i) =>
        numOrNull(Array.isArray(cfg.footswitchModes) ? cfg.footswitchModes[i] : null)
      ),
    };
    if (Array.isArray(snapshot.rawPages)) {
      for (const page of snapshot.rawPages) {
        if (typeof page.index === 'number' && typeof page.payloadHex === 'string') {
          const bytes = new Uint8Array(
            (page.payloadHex.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16))
          );
          this.rawPages.set(page.index, bytes);
        }
      }
    }
    this.emitState();
  }

  /** Push the currently loaded config to the connected device. */
  async applyAll(): Promise<void> {
    const device = this.getConnected();
    if (!device) throw new Error('Not connected');
    const cfg = device.config;
    if (cfg.mode !== null) await this.setMode(cfg.mode);
    if (cfg.midiInterface !== null) await this.setMidiInterface(cfg.midiInterface === 1);
    if (cfg.midiChannel !== null) await this.setMidiChannel(cfg.midiChannel);
    await this.setPolarity(cfg.polarity);
    if (cfg.maxGroupCount !== null) await this.setMaxGroupCount(cfg.maxGroupCount);
    if (cfg.maxBanksPcA !== null) await this.setMaxBanks(0, cfg.maxBanksPcA);
    if (cfg.maxBanksPcB !== null) await this.setMaxBanks(1, cfg.maxBanksPcB);
    if (cfg.usrPage !== null) await this.setUsrPage(cfg.usrPage as 0 | 1);
    for (let bank = 0; bank < CUSTOM_CC_BANKS; bank++) {
      const [cc, latch] = cfg.customCc[bank];
      if (cc !== null && latch !== null) await this.setCustomCc(bank, cc, latch);
    }
    const page = (cfg.usrPage ?? 0) as 0 | 1;
    for (let i = 0; i < 4; i++) {
      const step = cfg.footswitchModes[i];
      if (step !== null) await this.setFootswitchMode(page, i as 0 | 1 | 2 | 3, step);
    }
  }
}

export interface CommsSnapshot {
  app: string;
  version: number;
  savedAt: string;
  device: { name: string; manufacturer: string | null } | null;
  config: DeviceConfig;
  rawPages?: { index: number; payloadHex: string }[];
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
