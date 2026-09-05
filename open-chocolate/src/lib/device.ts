/**
 * Communication service for the M-Vave Chocolate Plus.
 *
 * Implements discovery (across all MIDI devices), the connect/init sequence
 * (configuration read-back), configuration writes and a message monitor.
 * No Vue/UI code here - the UI subscribes to listeners and calls methods.
 *
 * This service is the single owner of all device state. Public getters hand
 * out frozen snapshots, so listeners can never mutate that state by accident;
 * writes go through the async methods below. Expectations are scoped to a
 * device and aborted on disconnect, so stale responses can never resolve an
 * operation of another (or a later) session.
 */

import {
  MidiAccess,
  type MidiDevicePair,
  type MidiMessageEvent,
  type MidiTransport,
} from './midi.ts';
import {
  ADDR,
  ADV_CUSTOM_SWITCHES,
  advPackedBlockBase,
  buildBankClearWrite,
  buildConfigWrite,
  buildDiscoveryRequest,
  buildReadRequest,
  CUSTOM_CC_BANKS,
  decodePackedMidiCode,
  decodePackedFamily,
  decodePackedBankBCell,
  footswitchAddr,
  MIDI_CODE_SLOTS,
  midiCodeAddr,
  PACKED_SLOT_POS,
  packedSlotLen,
  packedSlotMark,
  parseMessage,
  SYSEX_END,
  SYSEX_START,
  toHex,
  unpackPackedMode,
  type MidiCode,
  type ParsedMessage,
} from './sysex.ts';
import {
  configFromSnapshot,
  pagesFromSnapshot,
  toSnapshot,
  type CommsSnapshot,
} from './snapshot.ts';

/** Rolling request counter observed in the official app capture, per read. */
const INIT_READ_RR = [
  7, 19, 30, 41, 52, 63, 74, 85, 96, 107, 118, 129, 140, 151, 162, 173, 184, 195, 207, 218, 229,
  240, 251, 66,
];

export const READ_PAGE_COUNT = 24;
/** Read-request addresses step by this stride (replayed verbatim, per capture). */
export const READ_PAGE_STRIDE = 1009;
/**
 * Bytes of blob content carried by each configuration read response.
 *
 * The device does not return the chunk at the requested address: it streams
 * the whole config blob in contiguous chunks of this size, starting at blob 0,
 * and echoes the request address back as a (mostly ignored) id. So response k
 * carries blob [k * READ_PAGE_CHUNK, (k+1) * READ_PAGE_CHUNK).
 *
 * Verified against open-device.pcapng: placing payloads at their request
 * addresses makes overlapping pages contradict each other in 30 places, while
 * contiguous placement has zero conflicts, a sane blob head and a consistent
 * trailing system block. The trailing `0D 79` record is NOT a continuation of
 * this stream: it re-reads the last `READ_TAIL_LEN` bytes of the blob
 * (see CONFIG_TAIL_START) and is the authoritative copy of the live system
 * block (the tail of the pages is stale).
 */
export const READ_PAGE_CHUNK = 1153;

/** Payload length of the trailing `0D 79` read response (measured: 501). */
export const READ_TAIL_LEN = 501;

/** Size of the device's configuration blob (FC2Struct DATA_SIZE). */
export const CONFIG_BLOB_SIZE = 23646;

/**
 * First blob address carried by the trailing `0D 79` record.
 *
 * The final read response streams a FRESH copy of the LAST bytes of the
 * config blob (blob `CONFIG_TAIL_START`..`CONFIG_BLOB_SIZE`), byte-aligned to
 * the blob end - so blob 23642 (polarity) lands at payload offset 497 =
 * exactly its write address. The live trailing system block (bankMax/usrpage/
 * polarity) is read from here; the same offsets inside the streamed pages
 * hold a stale copy and must not be used.
 */
export const CONFIG_TAIL_START = CONFIG_BLOB_SIZE - READ_TAIL_LEN;

/** How long to wait for a single read response before retrying (ms). */
const READ_TIMEOUT_MS = 2500;

/** Best-effort budget for the explicit input open() call (ms). */
const OPEN_TIMEOUT_MS = 2500;

export type DeviceStatus = 'detected' | 'connecting' | 'connected' | 'failed';

export interface MonitorEntry {
  id: number;
  dir: 'RX' | 'TX';
  /**
   * Device name the message was sent to / received from. Prefers the name
   * the browser reports for the port; falls back to the scan-time label and
   * finally a generic placeholder (raw port ids are never shown).
   */
  device: string;
  /** performance.now() ms at send/receive time */
  timestamp: number;
  /** Date.now() ms for display */
  wall: number;
  bytes: Uint8Array;
}

/** One Advanced Custom bank: 16 5-byte MIDI code slots. */
export interface FootswitchBank {
  codes: MidiCode[];
}

/** Decoded device configuration (what the UI edits). */
export interface DeviceConfig {
  /** Operating mode id (0..12) or null when unknown. */
  mode: number | null;
  /** 0 = expression pedal, 1 = TRS-MIDI. */
  midiInterface: number | null;
  /** MIDI channel, 0-based (UI shows +1). */
  midiChannel: number | null;
  reversePolarity: boolean;
  /** Maximum group count 1..8 (value written = count - 1). */
  maxGroupCount: number | null;
  /** Max banks per Program Change mode (value written = count - 1). */
  maxBanksPcA: number | null;
  maxBanksPcB: number | null;
  /** Advanced Custom variant page: 0 = mode 1, 1 = mode 2. */
  usrPage: number | null;
  /** Custom mode per-bank [cc, latch], or null while unknown (5 slots). */
  customCc: ([number, number] | null)[];
  /** Step behaviour of footswitches A, B, C, D (Advanced Custom). */
  footswitchModes: (number | null)[];
  /**
   * Advanced Custom banks [A, B] of footswitches A-D on the current usr page,
   * or null while unknown. Mirrors footswitchModes: only the active page is
   * kept.
   */
  footswitchBanks: ([FootswitchBank, FootswitchBank] | null)[];
}

export function emptyConfig(): DeviceConfig {
  return {
    mode: null,
    midiInterface: null,
    midiChannel: null,
    reversePolarity: false,
    maxGroupCount: null,
    maxBanksPcA: null,
    maxBanksPcB: null,
    usrPage: null,
    customCc: Array.from({ length: CUSTOM_CC_BANKS }, () => null),
    footswitchModes: [null, null, null, null],
    footswitchBanks: [null, null, null, null],
  };
}

/** A zeroed (empty) bank: nothing is enabled. */
export function emptyFootswitchBank(): FootswitchBank {
  return {
    codes: Array.from({ length: MIDI_CODE_SLOTS }, () => defaultMidiCode()),
  };
}

/** A disabled, zeroed midi-code entry. */
export function defaultMidiCode(): MidiCode {
  return { enabled: false, channel: 0, type: 0, data1: 0, data2: 0 };
}

export type { MidiCode } from './sysex.ts';

export interface ChocolateDevice {
  pair: MidiDevicePair;
  status: DeviceStatus;
  config: DeviceConfig;
}

interface PendingExpectation {
  /** Only messages from this device may satisfy the expectation. */
  deviceKey: string;
  match: (msg: ParsedMessage) => boolean;
  resolve: (msg: ParsedMessage) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface CommsOptions {
  /** How long to wait for discovery responses during a scan (ms). */
  scanSettleMs?: number;
  /** Per-read response timeout before retrying (ms). */
  readTimeoutMs?: number;
  /** Per-write ack timeout before retrying (ms). Defaults to 2000. */
  ackTimeoutMs?: number;
}

const sleep = (ms: number) => new Promise((r) => globalThis.setTimeout(r, ms));

/**
 * Retry `op` with exponential backoff between attempts, capping each wait at
 * `maxWaitMs`. Used for device operations: if a response doesn't arrive, the
 * device may have dropped it, so re-issuing the identical request is safe for
 * idempotent operations (config writes, read requests).
 *
 * Session-abort errors ("Device disconnected") are NOT retried - the session
 * is being torn down, so retrying would just burn the backoff sleep.
 */
async function retryWithBackoff<T>(
  op: (attempt: number) => Promise<T>,
  _what: string,
  opts: { maxRetries?: number; maxWaitMs?: number } = {}
): Promise<T> {
  const { maxRetries = 4, maxWaitMs = 5000 } = opts;
  let wait = 250;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await op(attempt);
    } catch (err) {
      lastErr = err;
      if (isSessionAbort(err)) throw err;
      if (attempt === maxRetries) break;
      await sleep(Math.min(wait, maxWaitMs));
      wait *= 2;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Errors that mean the session is gone should abort immediately, not retry. */
function isSessionAbort(err: unknown): boolean {
  return err instanceof Error && err.message === 'Device disconnected';
}

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

/** Recursively freeze a clone so listeners cannot mutate service state. */
function snapshotDevice(device: ChocolateDevice): ChocolateDevice {
  return deepFreeze(structuredClone(device));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

export class CommsService {
  readonly midi: MidiTransport;
  private readonly scanSettleMs: number;
  private readonly readTimeoutMs: number;
  private readonly ackTimeoutMs: number;
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
  /** Bumped whenever a new session starts; stale sequences abort on it. */
  private session = 0;
  /** Raw read-back payloads of the last read-back, per device key. */
  private rawPages = new Map<string, Map<number, Uint8Array>>();

  constructor(midi: MidiTransport = new MidiAccess(), options: CommsOptions = {}) {
    this.midi = midi;
    this.scanSettleMs = options.scanSettleMs ?? 1500;
    this.readTimeoutMs = options.readTimeoutMs ?? READ_TIMEOUT_MS;
    this.ackTimeoutMs = options.ackTimeoutMs ?? 2000;
  }

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

  /** Frozen snapshots - the UI can read but never mutate them. */
  getDevices(): ChocolateDevice[] {
    return [...this.devices.values()].map(snapshotDevice);
  }

  getConnected(): ChocolateDevice | null {
    const device = this.connectedInternal;
    return device ? snapshotDevice(device) : null;
  }

  private get connectedInternal(): ChocolateDevice | null {
    return this.connectedKey ? (this.devices.get(this.connectedKey) ?? null) : null;
  }

  /** Like `connectedInternal`, but throws a friendly error when absent. */
  private requireConnected(): ChocolateDevice {
    const device = this.connectedInternal;
    if (!device) throw new Error('Not connected');
    return device;
  }

  private pagesFor(deviceKey: string): Map<number, Uint8Array> {
    let pages = this.rawPages.get(deviceKey);
    if (!pages) {
      pages = new Map();
      this.rawPages.set(deviceKey, pages);
    }
    return pages;
  }

  private emitState(): void {
    const devices = this.getDevices();
    for (const cb of this.devicesListeners) cb(devices);
    for (const cb of this.stateListeners) cb();
  }

  private log(dir: 'RX' | 'TX', portId: string, bytes: Uint8Array, name?: string | null): void {
    // Prefer the name the browser reports for the port the message arrived on:
    // some backends re-enumerate a device under several internal ids (e.g.
    // Chrome's Bluetooth MIDI), so id-keyed lookups can miss and leak raw ids.
    const device = name ?? this.portLabels.get(portId) ?? 'Unknown MIDI port';
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

  /**
   * Send raw SysEx request bytes and collect the matching responses, without
   * decoding them. Used by tooling (the CLI) for protocol experiments - the
   * web app does not need it.
   *
   * Filthy bus-sniff: rides the monitor stream, so entries from other
   * devices/sessions observed during the window are skipped. Responses are
   * matched by SysEx prefix (`F0 ...`), oldest first; messages that arrive
   * after the returned array is settled are dropped (any downstream commands
   * will receive them via later probes/generated reads).
   *
   * @param request  raw SysEx bytes to send (must start 0xf0, end 0xf7)
   * @param opts.after  only return responses received after this timestamp (probe chaining)
   * @param opts.gatherMs  how long to keep collecting responses (ms)
   * @param opts.maxResponses  stop early once this many responses arrived
   * @param opts.timeoutMs  abort if no response within this time (ms)
   * @returns the first `maxResponses` received responses (oldest first)
   */
  async probe(
    request: readonly number[],
    opts: {
      after?: number;
      gatherMs?: number;
      maxResponses?: number;
      timeoutMs?: number;
    } = {}
  ): Promise<number[][]> {
    const device = this.requireConnected();
    if (!device.pair.outputId) throw new Error('Device has no MIDI output');
    const { after = -1, gatherMs = 300, maxResponses = 1, timeoutMs = 1500 } = opts;
    const results: number[][] = [];
    const completed = (): boolean => results.length >= maxResponses;
    const sessionAtStart = this.session;
    const done = (): boolean =>
      this.connectedKey !== device.pair.key || this.session > sessionAtStart || completed();
    const collect = (entry: MonitorEntry): void => {
      if (done()) return;
      if (entry.timestamp <= after) return;
      if (entry.dir !== 'RX') return;
      const bytes = Array.from(entry.bytes);
      if (bytes[0] !== SYSEX_START) return;
      results.push(bytes);
    };
    this.onMonitor(collect);
    try {
      await this.tx(device.pair.outputId, request);
      // Keep collecting until `gatherMs` elapses or the deadline set by
      // `timeoutMs` passes with no first response (fail fast on a silent
      // device, like the read-back's per-page retry).
      const deadline = globalThis.performance.now() + gatherMs;
      const firstDeadline = globalThis.performance.now() + timeoutMs;
      while (!completed() && globalThis.performance.now() < deadline) {
        if (results.length === 0 && globalThis.performance.now() > firstDeadline) break;
        await sleep(25);
      }
    } finally {
      this.monitorListeners = this.monitorListeners.filter((l) => l !== collect);
    }
    if (results.length === 0) throw new Error('Device did not respond to probe');
    return results;
  }

  private async tx(portId: string, bytes: readonly number[]): Promise<void> {
    this.log('TX', portId, Uint8Array.from(bytes));
    await this.midi.send(portId, bytes);
  }

  /** Wait for the next matching message from `deviceKey` or reject after `timeoutMs`. */
  private expect(
    deviceKey: string,
    match: (msg: ParsedMessage) => boolean,
    timeoutMs: number
  ): Promise<ParsedMessage> {
    return new Promise((resolve, reject) => {
      const expectation: PendingExpectation = {
        deviceKey,
        match,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.pending = this.pending.filter((p) => p !== expectation);
          reject(new Error('Device did not respond (timeout)'));
        }, timeoutMs),
      };
      this.pending.push(expectation);
    });
  }

  /** Reject and drop all pending expectations (session ended or aborting). */
  private failPending(err: Error): void {
    const pending = this.pending;
    this.pending = [];
    for (const p of pending) {
      globalThis.clearTimeout(p.timer);
      p.reject(err);
    }
  }

  /** Start a new session: any in-flight operation is aborted immediately. */
  private beginSession(): number {
    this.session++;
    this.failPending(new Error('Device disconnected'));
    return this.session;
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
    const previous = this.devices;
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
    await sleep(this.scanSettleMs); // give devices time to answer
    this.discoveryResponders = null;

    for (const inputKey of responders) {
      const pair = pairs.find((p) => p.inputId === inputKey);
      if (!pair) continue;
      // Keep status/config of devices we already know (e.g. the connected one).
      const prev = previous.get(pair.key);
      this.devices.set(pair.key, {
        pair,
        status: pair.key === this.connectedKey ? 'connected' : 'detected',
        config: prev?.config ?? emptyConfig(),
      });
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
    if (frames.length === 0) return;
    const deviceKey = this.deviceKeyForInput(ev.key);
    for (const frame of frames) {
      this.log('RX', ev.key, Uint8Array.from(frame), ev.name);
      const msg = parseMessage(frame);
      if (msg.kind === 'discovery-response' && this.discoveryResponders) {
        this.discoveryResponders.add(ev.key);
        continue;
      }
      this.dispatch(deviceKey, msg);
    }
  };

  /** Device key owning an input port, if any (expectations are per device). */
  private deviceKeyForInput(inputKey: string): string | undefined {
    for (const device of this.devices.values()) {
      if (device.pair.inputId === inputKey) return device.pair.key;
    }
    return undefined;
  }

  private dispatch(deviceKey: string | undefined, msg: ParsedMessage): void {
    this.pending = this.pending.filter((p) => {
      if (p.deviceKey === deviceKey && p.match(msg)) {
        globalThis.clearTimeout(p.timer);
        p.resolve(msg);
        return false;
      }
      return true;
    });
  }

  /** Connect by device key: open the input port and run the read-back sequence. */
  async connect(key: string): Promise<void> {
    if (this.connectingDevice) throw new Error('Connection already in progress');
    const device = this.devices.get(key);
    if (!device) throw new Error('Unknown device');

    const current = this.connectedInternal;
    if (current && current !== device) current.status = 'detected';

    const outputId = device.pair.outputId;
    const inputId = device.pair.inputId;
    if (!outputId || !inputId) {
      device.status = 'failed';
      this.emitState();
      throw new Error('Device exposes no usable MIDI ports');
    }

    device.status = 'connecting';
    this.connectingDevice = device;
    const session = this.beginSession();
    this.emitState();

    try {
      // Best-effort explicit open. Delivery already starts when a handler is
      // set, and a hung open() must never block connecting.
      await Promise.race([this.midi.openInput(inputId), sleep(OPEN_TIMEOUT_MS)]);
      await this.runInitSequence(outputId, key, session);
      device.status = 'connected';
      this.connectedKey = key;
    } catch (err) {
      device.status = 'failed';
      this.connectedKey = null;
      throw err;
    } finally {
      this.connectingDevice = null;
      this.emitState();
    }
  }

  /** Disconnect: abort in-flight operations and drop the connected device. */
  disconnect(): void {
    this.beginSession();
    const device = this.connectedInternal;
    if (device) device.status = 'detected';
    this.connectedKey = null;
    this.emitState();
  }

  /**
   * Captured init/read-back sequence:
   * 1. discovery request (device replies with the 45 58 response)
   * 2. 23 configuration reads (0D 41 -> 0D 49, 1173-byte records)
   * 3. a 24th read with special marker -> 0D 79 record (521 bytes) carrying
   *    the LAST `READ_TAIL_LEN` bytes of the config blob (see
   *    CONFIG_TAIL_START); the live trailing system block is read from it
   *
   * The official app then re-writes six live settings. Those writes mirror
   * the settings of the captured session; they are intentionally not sent
   * automatically - the UI sends writes when the user changes settings.
   *
   * The reads MUST stay strictly sequential: the device answers one
   * outstanding read request at a time (pipelining requests makes it drop
   * everything beyond the first 1-2, as seen in open-device.pcapng where the
   * official app waits for each full response before sending the next read).
   */
  private async runInitSequence(
    outputKey: string,
    deviceKey: string,
    session: number
  ): Promise<void> {
    const assertActive = (): void => {
      if (session !== this.session) throw new Error('Device disconnected');
    };

    // Register the expectation BEFORE sending: the device can answer faster
    // than the tx round-trip resolves, and a response that arrives while no
    // expectation is registered is dropped (observed live: intermittent
    // "Device did not respond" on writes and dropped read pages).
    const discovery = this.expect(deviceKey, (m) => m.kind === 'discovery-response', 2000).catch(
      () => undefined
    );
    await this.tx(outputKey, buildDiscoveryRequest());
    // The device answers every discovery request; wait briefly and move on.
    await discovery;
    assertActive();

    for (let i = 0; i < READ_PAGE_COUNT; i++) {
      assertActive();
      const final = i === READ_PAGE_COUNT - 1;
      const pageId = i * READ_PAGE_STRIDE;
      const match = (m: ParsedMessage) =>
        m.kind === 'read-response' && m.pageId === pageId && m.final === final;

      // Retry each page with exponential backoff: a single dropped response
      // must not abort the whole session, but a silent device must fail fast
      // and clearly. Expectation first (see the discovery note above) so an
      // early read response can never be dropped before `expect` is
      // registered.
      try {
        const resp = await retryWithBackoff(
          async () => {
            assertActive();
            const pending = this.expect(deviceKey, match, this.readTimeoutMs);
            // A late timeout must not surface as an unhandled rejection if the
            // tx below fails first and abandons this expectation.
            pending.catch(() => undefined);
            try {
              await this.tx(outputKey, buildReadRequest(pageId, INIT_READ_RR[i], final));
              return await pending;
            } catch (err) {
              // A stale session must abort instead of retrying on a dead port.
              assertActive();
              throw err;
            }
          },
          `read page ${i + 1}/${READ_PAGE_COUNT}`,
          { maxRetries: 4, maxWaitMs: 5000 }
        );
        if (resp && resp.kind === 'read-response') {
          this.absorbPage(i, resp.payload);
        }
      } catch (err) {
        if (isSessionAbort(err)) throw err;
        throw new Error(
          `Device stopped answering configuration reads (page ${i + 1}/${READ_PAGE_COUNT}). Disconnect and rescan.`,
          { cause: err }
        );
      }
    }
  }

  /** Pull known configuration values out of a page payload. */
  private absorbPage(index: number, payload: Uint8Array): void {
    const device = this.connectingDevice ?? this.connectedInternal;
    if (!device) return;
    if (index === 0 && payload.length > 2) {
      // Page 0 begins the config blob: [mode, trs, channel, custom-mode data...]
      device.config.mode = payload[0];
      // The device stores the TRS jack function as 0 (expression pedal) or 2
      // (TRS-MIDI). Writes use 0/1 and the official app clamps the read byte
      // to 0..1 (FC2Struct: trs = AddrU8(blob[1], 0, 1)), so normalise here.
      const trs = payload[1];
      if (trs === 0) device.config.midiInterface = 0;
      else if (trs === 1 || trs === 2) device.config.midiInterface = 1;
      if (payload[2] <= 15) device.config.midiChannel = payload[2];
      // Custom-mode banks: blob 3+2b = latch, 4+2b = CC value (per the
      // official app's FC2Struct: usr[b][0] = toggle, usr[b][1] = CC).
      const lastBankByte = 3 + (CUSTOM_CC_BANKS - 1) * 2 + 1;
      if (payload.length > lastBankByte) {
        for (let bank = 0; bank < CUSTOM_CC_BANKS; bank++) {
          const latch = payload[3 + bank * 2];
          const cc = payload[4 + bank * 2];
          device.config.customCc[bank] = [cc, latch];
        }
      }
    }
    this.pagesFor(device.pair.key).set(index, Uint8Array.from(payload));
    this.decodeSystemBlock(device);
    this.decodeAdvancedCustom(device);
  }

  /**
   * Read one blob byte from the raw read-back pages, or null while the page
   * carrying it has not arrived yet. Pages are contiguous chunks of the blob
   * (see READ_PAGE_CHUNK), keyed by the order they were requested in.
   */
  private blobByte(pages: Map<number, Uint8Array>, addr: number): number | null {
    // The trailing `0D 79` record carries a fresh copy of the last bytes of
    // the config blob (see CONFIG_TAIL_START), so blob addresses in that
    // range resolve into the final page, aligned to the blob end.
    if (addr >= CONFIG_TAIL_START) {
      const page = pages.get(READ_PAGE_COUNT - 1);
      if (!page) return null;
      const offset = addr - (CONFIG_BLOB_SIZE - page.length);
      const value = page[offset];
      return value === undefined ? null : value;
    }
    const pageId = Math.floor(addr / READ_PAGE_CHUNK);
    const offset = addr - pageId * READ_PAGE_CHUNK;
    const page = pages.get(pageId);
    if (!page) return null;
    const value = page[offset];
    return value === undefined ? null : value;
  }

  /** Decode the trailing system block (blob 23637..23642) once it is read. */
  private decodeSystemBlock(device: ChocolateDevice): void {
    const pages = this.pagesFor(device.pair.key);
    const bankA = this.blobByte(pages, ADDR.maxBanksPcA);
    const bankB = this.blobByte(pages, ADDR.maxBanksPcB);
    const groups = this.blobByte(pages, ADDR.maxGroupCount);
    const page = this.blobByte(pages, ADDR.usrPage);
    const polarity = this.blobByte(pages, ADDR.polarity);
    if (bankA !== null) device.config.maxBanksPcA = bankA + 1;
    if (bankB !== null) device.config.maxBanksPcB = bankB + 1;
    if (groups !== null) device.config.maxGroupCount = groups + 1;
    if (page === 0 || page === 1) device.config.usrPage = page;
    // The device reports the enabled state as 2, like the TRS field, so any
    // nonzero byte means polarity reversal is on.
    if (polarity !== null) device.config.reversePolarity = polarity !== 0;
  }

  /**
   * Decode the Advanced Custom banks and step modes of the active usr page
   * from the raw read-back pages. Called whenever a page lands and again when
   * the page selector changes, so banks always track config.usrPage.
   *
   * The `0D 41` pages open-chocolate reads carry a packed view of each
   * switch block (see the codec in sysex.ts): slot 1 uses the R-codec at
   * packed +2..+6, and each further slot uses a second codec at +8..+12
   * (+5 per slot after the constant byte at +7). Both codecs are verified
   * bit-exact on a real device (the official app reads the same messages
   * back correctly). Writes use the plain logical addresses (midiCodeA @
   * block+1 / midiCodeB @ block+81), which the desktop app also uses.
   */
  private decodeAdvancedCustom(device: ChocolateDevice): void {
    const pages = this.pagesFor(device.pair.key);
    // Seed the page selector once from the read-back; later writes take over.
    if (device.config.usrPage === null) {
      const page = this.blobByte(pages, ADDR.usrPage);
      if (page === 0 || page === 1) device.config.usrPage = page;
    }
    const page = device.config.usrPage as 0 | 1 | null;
    if (page === null) return;
    for (let sw = 0; sw < ADV_CUSTOM_SWITCHES; sw++) {
      const base = advPackedBlockBase(page, sw);
      const modeByte = this.blobByte(pages, base);
      if (modeByte === null) continue;
      const mode = unpackPackedMode(modeByte);
      if (mode <= 4) device.config.footswitchModes[sw] = mode;
      const banks: [FootswitchBank, FootswitchBank] = [
        emptyFootswitchBank(),
        emptyFootswitchBank(),
      ];
      const codes = this.decodePackedSlots(pages, base);
      banks[0] = {
        codes: Array.from({ length: MIDI_CODE_SLOTS }, (_, i) => codes[i] ?? defaultMidiCode()),
      };
      // Bank B (midiCodeB): 6-byte cells at packed block +92 (verified for
      // slots 1-2 on a live device; unverified cells stay empty).
      const bankBCodes: (MidiCode | undefined)[] = [];
      for (let s = 0; s < MIDI_CODE_SLOTS; s++) {
        const rec = new Array<number>(6);
        let present = false;
        let missing = false;
        for (let f = 0; f < 6; f++) {
          const v = this.blobByte(pages, base + 92 + s * 6 + f);
          if (v === null) {
            missing = true;
            break;
          }
          rec[f] = v;
          present ||= v !== 0;
        }
        if (missing) break;
        if (!present) {
          bankBCodes.push(undefined);
          continue;
        }
        const code = decodePackedBankBCell(rec, s);
        bankBCodes.push(code);
      }
      banks[1] = {
        codes: Array.from(
          { length: MIDI_CODE_SLOTS },
          (_, i) => bankBCodes[i] ?? defaultMidiCode()
        ),
      };
      device.config.footswitchBanks[sw] = banks;
    }
  }

  /**
   * Decode the packed slot records of a block (Bank A).
   *
   * Each slot i has a FIXED record position (PACKED_SLOT_POS) and a per-slot
   * marker (PACKED_SLOT_MARK, period 7). Record = [marker, content bytes]
   * with 6-byte cells (markers 1/2/4/8) or 7-byte cells (10/20/40). The
   * LAST content byte is OR'd with the NEXT slot's marker, so it is masked
   * off before decoding. Slot 0 uses the R-codec (marker 0x08) at P[0].
   *
   * Live-verified: a full 16-slot bank decodes 16/16 exact (see
   * protocol-addendum.md).
   *
   * Records that are all-zero are treated as absent.
   */
  private decodePackedSlots(
    pages: Map<number, Uint8Array>,
    base: number
  ): (MidiCode | undefined)[] {
    // First pass: determine occupancy. The fixed-position model was verified
    // for a FULLY-POPULATED bank (all 16 slots) and single-slot states, but
    // live fuzzing found sparse/mixed multi-slot states re-pack (occupancy-
    // dependent), so only trust the family decodes when the bank is full or
    // has a single populated slot; otherwise report slots 2+ empty rather
    // than fabricate values.
    const populated: boolean[] = [];
    let count = 0;
    for (let s = 0; s < MIDI_CODE_SLOTS; s++) {
      const len = packedSlotLen(s);
      const pos = PACKED_SLOT_POS[s] - 106;
      let any = false;
      for (let f = 0; f < len; f++) {
        const v = this.blobByte(pages, base + pos + f);
        if (v === null) return [];
        if (v !== 0) any = true;
      }
      populated[s] = any;
      if (any) count++;
    }
    const fullBank = count >= 16;
    if (!fullBank && count > 1) {
      // Sparse/mixed occupancy: only slot 0 (standalone R-codec) is
      // trustworthy; slots 1+ re-pack with occupancy (live-verified).
      const slots: (MidiCode | undefined)[] = [];
      for (let s = 0; s < MIDI_CODE_SLOTS; s++) {
        if (s >= 1) {
          slots.push(undefined);
          continue;
        }
        const len = packedSlotLen(s);
        const pos = PACKED_SLOT_POS[s] - 106;
        const cell = new Array<number>(len);
        let present = false;
        for (let f = 0; f < len; f++) {
          const v = this.blobByte(pages, base + pos + f);
          if (v === null) return slots;
          cell[f] = v;
          present ||= v !== 0;
        }
        if (!present) {
          slots.push(undefined);
          continue;
        }
        const content = cell.slice(1);
        const code = decodePackedMidiCode(content);
        if (code && code.channel <= 15 && code.type <= 4) slots.push(code);
        else slots.push(undefined);
      }
      return slots;
    }
    const slots: (MidiCode | undefined)[] = [];
    for (let s = 0; s < MIDI_CODE_SLOTS; s++) {
      if (!populated[s]) {
        slots.push(undefined);
        continue;
      }
      const mark = packedSlotMark(s);
      const len = packedSlotLen(s);
      const pos = PACKED_SLOT_POS[s] - 106;
      const cell = new Array<number>(len);
      for (let f = 0; f < len; f++) {
        const v = this.blobByte(pages, base + pos + f);
        if (v === null) return slots;
        cell[f] = v;
      }
      const content = cell.slice(1);
      const nextMark = packedSlotMark(s + 1);
      if (nextMark >= 0x04) {
        const last = content.length - 1;
        content[last] &= ~nextMark & 0x7f;
      }
      const code = s === 0 ? decodePackedMidiCode(content) : decodePackedFamily(mark, content);
      if (code && code.channel <= 15 && code.type <= 4) {
        slots.push(code);
      } else {
        slots.push(undefined);
      }
    }
    return slots;
  }

  /**
   * Re-run the configuration read-back on the connected device and refresh
   * the decoded settings.
   */
  async reread(): Promise<void> {
    const device = this.requireConnected();
    const outputId = device.pair.outputId;
    if (!outputId) throw new Error('Device has no MIDI output');
    await this.runInitSequence(outputId, device.pair.key, this.session);
    this.emitState();
  }

  /**
   * Send a configuration write and wait for the 01 08 acknowledgement.
   *
   * Expectation is registered BEFORE the tx so a fast device ACK can never
   * be dropped (the observed intermittent timeout). Retries with exponential
   * backoff (up to ~5s total); re-sending the same addr+value is idempotent.
   */
  async writeConfig(addr: number, value: number): Promise<void> {
    const device = this.requireConnected();
    const outputId = device.pair.outputId;
    if (!outputId) throw new Error('Device has no MIDI output');
    await retryWithBackoff(async () => {
      const pending = this.expect(device.pair.key, (m) => m.kind === 'ack', this.ackTimeoutMs);
      pending.catch(() => undefined);
      try {
        await this.tx(outputId, buildConfigWrite(addr, value));
        await pending;
      } catch (err) {
        throw new Error(`Config write to ${addr} was not acknowledged`, { cause: err });
      }
    }, `config write ${addr}`);
  }

  async setMode(mode: number): Promise<void> {
    const device = this.requireConnected();
    await this.writeConfig(ADDR.mode, mode);
    device.config.mode = mode;
    this.emitState();
  }

  async setMidiInterface(trs: boolean): Promise<void> {
    const device = this.requireConnected();
    const value = trs ? 1 : 0;
    await this.writeConfig(ADDR.midiInterface, value);
    device.config.midiInterface = value;
    this.emitState();
  }

  async setMidiChannel(ch0: number): Promise<void> {
    const device = this.requireConnected();
    await this.writeConfig(ADDR.midiChannel, ch0);
    device.config.midiChannel = ch0;
    this.emitState();
  }

  async setPolarity(enabled: boolean): Promise<void> {
    const device = this.requireConnected();
    const value = enabled ? 1 : 0;
    await this.writeConfig(ADDR.polarity, value);
    device.config.reversePolarity = enabled;
    this.emitState();
  }

  async setMaxGroupCount(count: number): Promise<void> {
    const device = this.requireConnected();
    await this.writeConfig(ADDR.maxGroupCount, count - 1);
    device.config.maxGroupCount = count;
    this.emitState();
  }

  /** Set the maximum bank count (1-32) of Program Change mode A or B. */
  async setMaxBanks(which: 0 | 1, count: number): Promise<void> {
    const device = this.requireConnected();
    const addr = which === 0 ? ADDR.maxBanksPcA : ADDR.maxBanksPcB;
    await this.writeConfig(addr, count - 1);
    if (which === 0) device.config.maxBanksPcA = count;
    else device.config.maxBanksPcB = count;
    this.emitState();
  }

  /** Select the Advanced Custom variant page (0 = mode 1, 1 = mode 2). */
  async setUsrPage(page: 0 | 1): Promise<void> {
    const device = this.requireConnected();
    await this.writeConfig(ADDR.usrPage, page);
    device.config.usrPage = page;
    // Point the banks at the newly selected page (the raw pages hold both).
    this.decodeAdvancedCustom(device);
    this.emitState();
  }

  async setCustomCc(bank: number, cc: number, latch: number): Promise<void> {
    const device = this.requireConnected();
    const base = ADDR.customBankFirst + bank * 2;
    await this.writeConfig(base, latch);
    await this.writeConfig(base + 1, cc);
    device.config.customCc[bank] = [cc, latch];
    this.emitState();
  }

  /**
   * Write one midi-code slot (5 bytes) of an Advanced Custom footswitch bank.
   * Data bytes go first and the enable flag last, so a rebuilt entry never
   * fires with stale values in between.
   */
  async setFootswitchMidiCode(
    page: 0 | 1,
    index: 0 | 1 | 2 | 3,
    bank: 0 | 1,
    slot: number,
    code: MidiCode
  ): Promise<void> {
    const device = this.requireConnected();
    // PC (type 0) messages carry no velocity/value byte - data 2 is always 0.
    // Normalise here so a caller cannot persist a stray non-zero data 2.
    const data2 = code.type === 0 ? 0 : code.data2;
    const bytes = [
      code.channel & 0x7f,
      code.type & 0x7f,
      code.data1 & 0x7f,
      data2 & 0x7f,
      code.enabled ? 1 : 0,
    ];
    const base = midiCodeAddr(page, index, bank, slot, 0);
    for (let field = 1; field <= 4; field++) {
      await this.writeConfig(base + field, bytes[field - 1]);
    }
    await this.writeConfig(base, bytes[4]);
    const banks =
      device.config.footswitchBanks[index] ??
      (device.config.footswitchBanks[index] = [emptyFootswitchBank(), emptyFootswitchBank()]);
    banks[bank].codes[slot] = {
      enabled: bytes[4] === 1,
      channel: bytes[0],
      type: bytes[1],
      data1: bytes[2],
      data2: bytes[3],
    };
    this.emitState();
  }

  /**
   * Clear every midi-code slot of one Advanced Custom footswitch bank.
   *
   * Preferred path: a single `09 41` bulk write - the one-message request the
   * official app sends for "Remove all" on footswitches B/D (captured
   * bit-perfect). Live testing showed the device REJECTS the bulk clear for
   * footswitch A (no ACK), so on timeout we fall back to zeroing each of the
   * bank's 80 bytes via the per-byte `09 49` writes (the confirmed-working
   * write path, same as Bank B edits).
   */
  async clearFootswitchBanks(page: 0 | 1, index: 0 | 1 | 2 | 3, bank: 0 | 1): Promise<void> {
    const device = this.requireConnected();
    if (!device.pair.outputId) throw new Error('Device has no MIDI output');
    const pending = this.expect(device.pair.key, (m) => m.kind === 'ack', this.ackTimeoutMs);
    pending.catch(() => undefined);
    await this.tx(device.pair.outputId, buildBankClearWrite(page, index, bank));
    try {
      await pending;
    } catch {
      // Device did not ACK the bulk clear (observed for footswitch A). Zero the
      // bank byte-by-byte via the proven `09 49` write path instead.
      const base = midiCodeAddr(page, index, bank, 0, 0);
      for (let i = 0; i < MIDI_CODE_SLOTS * 5; i++) {
        await this.writeConfig(base + i, 0);
      }
    }
    const banks =
      device.config.footswitchBanks[index] ??
      (device.config.footswitchBanks[index] = [emptyFootswitchBank(), emptyFootswitchBank()]);
    banks[bank] = emptyFootswitchBank();
    this.emitState();
  }

  /** Set the step behaviour of one footswitch within an Advanced Custom page. */
  async setFootswitchMode(page: 0 | 1, index: 0 | 1 | 2 | 3, step: number): Promise<void> {
    const device = this.requireConnected();
    await this.writeConfig(footswitchAddr(page, index), step);
    device.config.footswitchModes[index] = step;
    this.emitState();
  }

  /** Snapshot of the connected device config for import/export. */
  exportState(): CommsSnapshot {
    const device = this.connectedInternal;
    return toSnapshot(
      device ? { name: device.pair.name, manufacturer: device.pair.manufacturer } : null,
      device ? device.config : emptyConfig(),
      device ? this.pagesFor(device.pair.key) : new Map()
    );
  }

  /** Load a snapshot into app state (does not touch the device). */
  importState(snapshot: CommsSnapshot): void {
    const device = this.connectedInternal;
    if (!device) throw new Error('Connect to a device before importing a configuration');
    device.config = configFromSnapshot(snapshot);
    const pages = this.pagesFor(device.pair.key);
    pages.clear();
    for (const [index, bytes] of pagesFromSnapshot(snapshot)) {
      pages.set(index, bytes);
    }
    // Re-derive the Advanced Custom banks from the imported raw pages.
    this.decodeAdvancedCustom(device);
    this.emitState();
  }

  /** Push the currently loaded config to the connected device. */
  async applyAll(): Promise<void> {
    const device = this.requireConnected();
    const cfg = device.config;
    if (cfg.mode !== null) await this.setMode(cfg.mode);
    if (cfg.midiInterface !== null) await this.setMidiInterface(cfg.midiInterface === 1);
    if (cfg.midiChannel !== null) await this.setMidiChannel(cfg.midiChannel);
    await this.setPolarity(cfg.reversePolarity);
    if (cfg.maxGroupCount !== null) await this.setMaxGroupCount(cfg.maxGroupCount);
    if (cfg.maxBanksPcA !== null) await this.setMaxBanks(0, cfg.maxBanksPcA);
    if (cfg.maxBanksPcB !== null) await this.setMaxBanks(1, cfg.maxBanksPcB);
    if (cfg.usrPage !== null) await this.setUsrPage(cfg.usrPage as 0 | 1);
    for (let bank = 0; bank < CUSTOM_CC_BANKS; bank++) {
      const pair = cfg.customCc[bank];
      if (pair) await this.setCustomCc(bank, pair[0], pair[1]);
    }
    const page = (cfg.usrPage ?? 0) as 0 | 1;
    for (let i = 0; i < 4; i++) {
      const step = cfg.footswitchModes[i];
      if (step !== null) await this.setFootswitchMode(page, i as 0 | 1 | 2 | 3, step);
    }
    // Banks: only slots that differ from a zeroed entry need a write, so a
    // freshly read config costs nothing extra here.
    for (let i = 0; i < 4; i++) {
      const banks = cfg.footswitchBanks[i];
      if (!banks) continue;
      for (let b = 0; b < 2; b++) {
        for (let slot = 0; slot < MIDI_CODE_SLOTS; slot++) {
          const code = banks[b].codes[slot];
          if (code && (code.enabled || code.channel || code.type || code.data1 || code.data2)) {
            await this.setFootswitchMidiCode(page, i as 0 | 1 | 2 | 3, b as 0 | 1, slot, code);
          }
        }
      }
    }
  }
}

export type { CommsSnapshot };
