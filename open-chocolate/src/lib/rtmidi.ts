/**
 * Native RtMidi transport (CLI-side).
 *
 * Implements `MidiTransport` over the vendored rtmidi-bridge (see
 * native/rtmidi-bridge/main.cpp): a tiny C++ program that wraps RtMidi and
 * speaks newline-delimited JSON over stdio, so Node.js gets native MIDI
 * (ALSA on Linux - the same sequencer backend Chromium's Web MIDI uses)
 * without any node-gyp / native-addon machinery.
 *
 * Port ids are `input:<index>` / `output:<index>` where the index is the
 * RtMidi port number within its direction (input and output ports are
 * numbered independently, like the browser's Web MIDI ports).
 *
 * Only used by tooling (CLI, tests) - the web app never imports this module,
 * so the browser bundle stays free of `node:` imports.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { env } from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  groupPorts,
  type MidiDevicePair,
  type MidiMessageEvent,
  type MidiPortInfo,
  type MidiTransport,
} from './midi.ts';

export interface RtMidiTransportOptions {
  /** Path to the rtmidi-bridge binary. Defaults to native/rtmidi-bridge/bin. */
  binaryPath?: string;
  /** Extra argv for the bridge process (used by tests to run a stub). */
  binaryArgs?: string[];
  /** How long to wait for a bridge reply before failing (ms). */
  ackTimeoutMs?: number;
}

interface PortInfo {
  index: number;
  name: string;
}

interface BridgeLine {
  type: string;
  [key: string]: unknown;
}

interface PendingOp {
  match: (line: BridgeLine) => boolean;
  resolve: (line: BridgeLine) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_BRIDGE_PATH = fileURLToPath(
  new URL('../../native/rtmidi-bridge/bin/rtmidi-bridge', import.meta.url)
);

export class RtMidiTransport implements MidiTransport {
  private readonly binaryPath: string;
  private readonly binaryArgs: string[];
  private readonly ackTimeoutMs: number;

  private proc: ChildProcessWithoutNullStreams | null = null;
  private inputs: PortInfo[] = [];
  private outputs: PortInfo[] = [];
  private listeners: ((ev: MidiMessageEvent) => void)[] = [];
  private openedInputs = new Set<number>();
  private openedOutputs = new Set<number>();
  private pendingOp: PendingOp | null = null;
  private lineBuf = '';
  private listed = false;
  private listing: Promise<void> | null = null;
  private processError: Error | null = null;
  /** Serializes commands: the bridge answers one request at a time. */
  private tail: Promise<void> = Promise.resolve();

  constructor(options: RtMidiTransportOptions = {}) {
    this.binaryPath = options.binaryPath ?? env.RTMIDI_BRIDGE ?? DEFAULT_BRIDGE_PATH;
    this.binaryArgs = options.binaryArgs ?? [];
    this.ackTimeoutMs = options.ackTimeoutMs ?? 10_000;
  }

  /** Spawn (once) and enumerate the bridge's ports. */
  async requestAccess(): Promise<void> {
    if (this.proc && this.listed) return;
    if (!this.listing) {
      this.listing = this.scanPorts();
    }
    await this.listing;
  }

  private async scanPorts(): Promise<void> {
    try {
      this.spawnBridge();
      const list = await this.sendAndWait('list', (l) => l.type === 'list', 'port list');
      this.inputs = (list.inputs as PortInfo[]) ?? [];
      this.outputs = (list.outputs as PortInfo[]) ?? [];
      // Open every input so SysEx flows without an explicit openInput call,
      // matching Web MIDI semantics (the discovery scan depends on it). A
      // port that fails to open (busy, stale) is skipped, not fatal.
      for (const p of this.inputs) {
        if (this.openedInputs.has(p.index)) continue;
        try {
          await this.sendAndWait(
            `open in ${p.index}`,
            (l) => l.type === 'open' && l.dir === 'in' && l.index === p.index,
            `open ack for input ${p.index}`
          );
          this.openedInputs.add(p.index);
        } catch {
          // Keep going: the port may be busy or no longer present.
        }
      }
      this.listed = true;
    } catch (err) {
      // Let a later requestAccess() retry instead of failing forever.
      this.listing = null;
      throw err;
    }
  }

  listDevices(): MidiDevicePair[] {
    const ports: MidiPortInfo[] = [];
    for (const p of this.inputs) {
      ports.push({ id: `input:${p.index}`, name: p.name, manufacturer: null, type: 'input' });
    }
    for (const p of this.outputs) {
      ports.push({ id: `output:${p.index}`, name: p.name, manufacturer: null, type: 'output' });
    }
    return groupPorts(ports);
  }

  onMessage(cb: (ev: MidiMessageEvent) => void): void {
    this.listeners.push(cb);
  }

  /** Send raw MIDI bytes out of a port (`output:<index>`). */
  async send(key: string, bytes: readonly number[]): Promise<void> {
    const index = this.parseKey(key, 'output');
    // The bridge only sends on explicitly opened outputs; open on first use
    // (Web MIDI implies the same).
    if (!this.openedOutputs.has(index)) {
      await this.sendAndWait(
        `open out ${index}`,
        (l) => l.type === 'open' && l.dir === 'out' && l.index === index,
        `open ack for output ${index}`
      );
      this.openedOutputs.add(index);
    }
    await this.sendAndWait(
      `send ${index} ${Array.from(bytes).join(' ')}`,
      (l) => l.type === 'sent' && l.index === index,
      `send ack for output ${index}`
    );
  }

  async openInput(inputId: string): Promise<void> {
    const index = this.parseKey(inputId, 'input');
    // Idempotent: requestAccess already opened every input.
    if (this.openedInputs.has(index)) return;
    await this.sendAndWait(
      `open in ${index}`,
      (l) => l.type === 'open' && l.dir === 'in' && l.index === index,
      `open ack for input ${index}`
    );
    this.openedInputs.add(index);
  }

  /** Stop the bridge. Not part of MidiTransport; the CLI calls it on exit. */
  async close(): Promise<void> {
    this.failPending(new Error('RtMidiTransport closed'));
    this.openedInputs.clear();
    this.openedOutputs.clear();
    const proc = this.proc;
    if (!proc) return;
    this.proc = null;
    try {
      proc.stdin.write('quit\n');
    } catch {
      // Falls through to kill below.
    }
    // Wait briefly for a clean exit, then force-kill. A stubborn child (or a
    // full stdout pipe) must never keep our process alive.
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      const timer = setTimeout(() => {
        try {
          proc.kill();
        } catch {
          // already gone
        }
        finish();
      }, 300);
      proc.once('exit', () => {
        clearTimeout(timer);
        finish();
      });
    });
    // Drop the child's handles so the event loop can exit even if the OS
    // process is still winding down.
    proc.stdin.destroy();
    proc.stdout.destroy();
    proc.stderr.destroy();
  }

  private parseKey(key: string, dir: 'input' | 'output'): number {
    const m = new RegExp(`^${dir}:(\\d+)$`).exec(key);
    if (!m) throw new Error(`RtMidiTransport: not an ${dir} key: ${key}`);
    return Number(m[1]);
  }

  private spawnBridge(): void {
    if (this.proc) return;
    this.processError = null;
    const proc = spawn(this.binaryPath, this.binaryArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = proc;
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => this.onStdout(chunk));
    proc.stderr.on('data', () => undefined); // diagnostics only
    proc.on('error', (err) => {
      const wrapped =
        (err as NodeJS.ErrnoException).code === 'ENOENT'
          ? new Error(
              `rtmidi-bridge not found at ${this.binaryPath}. ` +
                'Build it with `make -C native/rtmidi-bridge`.'
            )
          : err;
      this.processError = wrapped;
      this.failPending(wrapped);
    });
    proc.on('exit', (code) =>
      this.failPending(new Error(`rtmidi-bridge exited unexpectedly (code ${code})`))
    );
  }

  private onStdout(chunk: string): void {
    this.lineBuf += chunk;
    let nl: number;
    while ((nl = this.lineBuf.indexOf('\n')) >= 0) {
      const raw = this.lineBuf.slice(0, nl).trim();
      this.lineBuf = this.lineBuf.slice(nl + 1);
      if (raw) this.handleLine(raw);
    }
  }

  private handleLine(raw: string): void {
    let line: BridgeLine;
    try {
      line = JSON.parse(raw) as BridgeLine;
    } catch {
      return; // not ours; ignore
    }
    if (line.type === 'msg') this.dispatchMessage(line);
    const op = this.pendingOp;
    if (!op) return;
    if (line.type === 'error') {
      this.clearPending(op);
      op.reject(new Error(`rtmidi-bridge: ${String(line.message ?? 'error')}`));
      return;
    }
    if (op.match(line)) {
      this.clearPending(op);
      op.resolve(line);
    }
  }

  private dispatchMessage(line: BridgeLine): void {
    const index = Number(line.index);
    const bytes = Array.isArray(line.bytes) ? Uint8Array.from(line.bytes as number[]) : null;
    if (!bytes) return;
    const ev: MidiMessageEvent = {
      key: `input:${index}`,
      name: this.inputs.find((p) => p.index === index)?.name ?? null,
      bytes,
      timestamp: performance.now(),
    };
    for (const cb of this.listeners) cb(ev);
  }

  /** Send one command, wait for a matching reply (serialized on `tail`). */
  private sendAndWait(
    command: string,
    match: (line: BridgeLine) => boolean,
    what: string
  ): Promise<BridgeLine> {
    const run = this.tail.then(() => this.sendAndWaitNow(command, match, what));
    this.tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private sendAndWaitNow(
    command: string,
    match: (line: BridgeLine) => boolean,
    what: string
  ): Promise<BridgeLine> {
    const proc = this.proc;
    if (!proc) {
      if (this.processError) throw this.processError;
      return Promise.reject(
        new Error(
          `RtMidiTransport: rtmidi-bridge is not running (${this.binaryPath}). ` +
            'Build it with `make -C native/rtmidi-bridge`.'
        )
      );
    }
    return new Promise<BridgeLine>((resolve, reject) => {
      const op: PendingOp = {
        match,
        resolve,
        reject,
        timer: setTimeout(() => {
          if (this.pendingOp === op) this.pendingOp = null;
          reject(new Error(`RtMidiTransport: timed out waiting for ${what}`));
        }, this.ackTimeoutMs),
      };
      this.pendingOp = op;
      proc.stdin.write(command + '\n');
    });
  }

  private clearPending(op: PendingOp): void {
    if (this.pendingOp === op) this.pendingOp = null;
    clearTimeout(op.timer);
  }

  private failPending(err: Error): void {
    const op = this.pendingOp;
    if (op) {
      this.pendingOp = null;
      clearTimeout(op.timer);
      op.reject(err);
    }
    this.proc = null;
  }
}
