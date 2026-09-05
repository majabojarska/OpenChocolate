/**
 * open-chocolate CLI - the M-Vave Chocolate Plus experimentation harness over
 * native RtMidi, no browser.
 *
 * Wraps CommsService (the io-less protocol core) with a transactional action
 * DSL and raw-SysEx probing, so the differential method
 * (reverse-engineering/protocol-addendum.md) runs as one command:
 *
 *   node scripts/open-chocolate-cli.mjs scan connect reread \
 *     set-footswitch-midi-code 0 0 0 0 1 0 25 0 reread --loop 2 --json
 */

import { CommsService, emptyConfig, type ChocolateDevice, type MonitorEntry } from './device.ts';
import { RtMidiTransport } from './rtmidi.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import { stdout } from 'node:process';

const DEV_TYPE_NAMES = ['PC', 'CC', 'NoteON', 'NoteOFF', 'SysEx'];
const FOOTSWITCH_NAMES = ['A', 'B', 'C', 'D'];

export const USAGE = `open-chocolate CLI - drive the M-Vave Chocolate Plus over native RtMidi

Usage:
  open-chocolate <action>... [options]

Actions (run in order; stop at the first error):
  scan                         enumerate and probe devices (needed before connect)
  connect                      connect (read back full configuration)
  set-mode <n>                operating mode id (0..12; 3 = Advanced Custom)
  set-midi-channel <n>        MIDI channel, 1-based (1..16)
  set-midi-interface <0|1>    0 = expression pedal, 1 = TRS-MIDI
  set-polarity <0|1>          polarity reversal off/on
  set-max-group-count <n>     1..8
  set-max-banks <A|B> <n>     Program Change max banks 1..32
  set-usr-page <0|1>          Advanced Custom variant page
  set-custom-cc <bank> <cc> <latch>
  set-footswitch-mode <A|B|C|D> <step>
  set-footswitch-midi-code <page> <sw> <bank> <slot> <ch> <type> <d1> <d2>
                              Advanced Custom midi code; page/sw/bank/slot 0-based
                              (slots 0..15); type PC|CC|NoteON|NoteOFF|SysEx; ch 1..16
  clear-footswitch-banks <page> <sw> <bank>
  reread                       re-read the connected device's configuration
  apply-all                    push the loaded configuration to the device
  probe <hex...>               send raw SysEx, print responses (no decode)
  raw <hex...>                 send raw bytes (no response wait)
  wait <ms>                    sleep

Global options (after actions):
  --json                       machine-readable output: one JSON object per action
  --out <file>                 append the TX/RX SysEx log lines to a file
  --loop <n>                   repeat the whole action sequence n times
  --device <key|name>          device key (or name substring) to connect to
  --scan-settle <ms>           discovery wait (default 1500)
  --timeout <ms>               per-read/ack timeout (default 2500/2000)
  --rtmidi <path>              rtmidi-bridge binary path (or RTMIDI_BRIDGE env)
  --in <file>                  read actions from a file (one action per line)
  --help                       show this help

Notes:
  - Run unsandboxed: ALSA (/dev/snd) is needed for the device.
  - Raw bytes are decimal or 0x-prefixed hex.
  - Errors exit non-zero; use --json for stable output.`;

/**
 * Parse a raw byte list like "f0 00 32" or "240 0 50" (hex or decimal).
 */
export function parseBytes(list: string[]): number[] {
  const out: number[] = [];
  for (const tok of list) {
    const t = tok.trim();
    if (!t) continue;
    let v: number;
    if (/^0x[0-9a-f]+$/i.test(t)) v = parseInt(t.slice(2), 16);
    else if (/^[0-9]+$/.test(t)) v = parseInt(t, 10);
    // Bare hex like "f0"/"7f" (no 0x prefix) - convenient for SysEx listings.
    else if (/^[0-9a-f]{1,2}$/i.test(t)) v = parseInt(t, 16);
    else throw new Error(`bad byte: ${t}`);
    if (v < 0 || v > 255) throw new Error(`byte out of range: ${t}`);
    out.push(v);
  }
  return out;
}

function typeName(type: number): string {
  return DEV_TYPE_NAMES[type] ?? `type${type}`;
}

function formatCode(code: {
  enabled: boolean;
  channel: number;
  type: number;
  data1: number;
  data2: number;
}): string {
  return `${code.enabled ? 'on' : 'off'} ch${code.channel + 1} ${typeName(code.type)} ${code.data1} ${code.data2}`;
}

function formatConfig(cfg: ReturnType<typeof emptyConfig>): Record<string, unknown> {
  return {
    mode: cfg.mode,
    midiInterface:
      cfg.midiInterface === 1
        ? 'trs-midi'
        : cfg.midiInterface === 0
          ? 'expression'
          : cfg.midiInterface,
    midiChannel: cfg.midiChannel === null ? null : cfg.midiChannel + 1,
    reversePolarity: cfg.reversePolarity,
    maxGroupCount: cfg.maxGroupCount,
    maxBanksPcA: cfg.maxBanksPcA,
    maxBanksPcB: cfg.maxBanksPcB,
    usrPage: cfg.usrPage,
    customCc: cfg.customCc,
    footswitchModes: cfg.footswitchModes,
    footswitchBanks: cfg.footswitchBanks,
  };
}

function hex(bytes: ArrayLike<number>): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

/** Minimal stdout sink so tests can capture output. */
export interface CliOut {
  write(s: string): void;
}

function printStep(step: string, data: unknown, opts: CliOptions, ok = true): void {
  const out = opts.output ?? stdout;
  if (opts.json) {
    out.write(JSON.stringify({ ok, step, data: data === undefined ? null : data }) + '\n');
    return;
  }
  if (typeof data === 'string') {
    out.write(`${step}: ${data}` + '\n');
  } else if (data !== undefined && data !== null) {
    out.write(`${step}: ${JSON.stringify(data)}` + '\n');
  } else {
    out.write(`${step}: OK` + '\n');
  }
}

export interface CliOptions {
  json?: boolean;
  out?: string | null;
  loop?: number;
  scanSettle?: number;
  timeout?: number;
  device?: string;
  rtmidi?: string;
  output?: CliOut;
}

/**
 * Core runner. `transport` is injectable so tests can drive it with a stub.
 * `argv` is the CLI args (already sans node/exe). Returns an exit code.
 */
export async function run(
  argv: string[],
  transport?: unknown,
  optsIn?: CliOptions
): Promise<number> {
  const opts: CliOptions = { json: false, out: null, loop: 1, ...optsIn };
  // Actions are space-separated tokens: a token that is a known action name
  // starts a new action; every other non-`--` token is an argument of the
  // current action (e.g. probe's raw byte list, set-mode's number).
  const ACTION_NAMES = [
    'scan',
    'connect',
    'reread',
    'set-mode',
    'set-midi-channel',
    'set-midi-interface',
    'set-polarity',
    'set-max-group-count',
    'set-max-banks',
    'set-usr-page',
    'set-custom-cc',
    'set-footswitch-mode',
    'set-footswitch-midi-code',
    'clear-footswitch-banks',
    'apply-all',
    'probe',
    'raw',
    'wait',
  ];
  const actions: string[] = [];
  let current: string[] | null = null;
  let i = 0;
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if (a === '--json') opts.json = true;
      else if (a === '--out') opts.out = argv[++i];
      else if (a === '--loop') opts.loop = parseInt(argv[++i], 10);
      else if (a === '--device') opts.device = argv[++i];
      else if (a === '--scan-settle') opts.scanSettle = parseInt(argv[++i], 10);
      else if (a === '--timeout') opts.timeout = parseInt(argv[++i], 10);
      else if (a === '--rtmidi') opts.rtmidi = argv[++i];
      else if (a === '--in') {
        const content = readFileSync(argv[++i], 'utf8');
        actions.push(...content.trim().split(/\r?\n/).filter(Boolean));
      } else if (a === '--help') {
        (opts.output ?? stdout).write(USAGE + '\n');
        return 0;
      } else {
        throw new Error(`unknown option: ${a}`);
      }
    } else if (ACTION_NAMES.includes(a)) {
      if (current) actions.push(current.join(' '));
      current = [a];
    } else {
      current =
        current ??
        (() => {
          throw new Error(`unexpected token before any action: ${a}`);
        })();
      current.push(a);
    }
  }
  if (current) actions.push(current.join(' '));

  const t =
    (transport as (RtMidiTransport & { close(): Promise<void> }) | undefined) ??
    new RtMidiTransport({ binaryPath: opts.rtmidi });
  const comms = new CommsService(t, {
    scanSettleMs: opts.scanSettle ?? 1500,
    readTimeoutMs: opts.timeout ?? 2500,
  });

  if (opts.out) {
    // Mirror TX/RX traffic to the --out file (the service already logs to
    // console; the monitor gives us the same lines without stdout pollution).
    const initial = [true];
    const writeLog = (entry: MonitorEntry): void => {
      if (initial[0]) {
        initial[0] = false;
        writeFileSync(opts.out as string, '');
      }
      const dir = entry.dir === 'TX' ? 'TX' : 'RX';
      writeFileSync(
        opts.out as string,
        `[open-chocolate] ${dir} ${entry.device} (${entry.bytes.length} B): ${hex(entry.bytes)}\n`,
        { flag: 'a' }
      );
    };
    comms.onMonitor(writeLog);
  }

  const doActions = async (): Promise<void> => {
    for (const raw of actions) {
      const parts = raw.split(/\s+/);
      const step = parts[0];
      const args = parts.slice(1);
      switch (step) {
        case 'scan': {
          await comms.scan();
          const devices = comms.getDevices();
          const names = devices.map((d) => d.pair.name);
          printStep('scan', names, opts);
          if (devices.length === 0) throw new Error('no devices found');
          break;
        }
        case 'connect': {
          const devices = comms.getDevices();
          const already = comms.getConnected();
          let target: ChocolateDevice | null;
          if (opts.device) {
            const keyOrName = opts.device;
            target =
              devices.find((d) => d.pair.key === keyOrName) ??
              devices.find((d) => d.pair.name.toLowerCase().includes(keyOrName.toLowerCase())) ??
              null;
            if (!target) throw new Error(`no device matching "${keyOrName}"`);
          } else {
            target = devices.find((d) => d.pair.name.toLowerCase().includes('sinco')) ?? null;
            if (!target) target = devices.find((d) => d.status === 'detected') ?? null;
            if (!target && already) target = already;
            if (!target) throw new Error('no device to connect to (run scan first)');
          }
          // Reconnecting to the same device is a no-op (status is 'connected',
          // so the `detected` filter above would miss it).
          if (already?.pair.key === target.pair.key) {
            printStep('connect', { device: target.pair.name, already: true }, opts);
            break;
          }
          await comms.connect(target.pair.key);
          printStep('connect', { device: target.pair.name }, opts);
          break;
        }
        case 'reread': {
          await comms.reread();
          printStep('reread', formatConfig(comms.getConnected()?.config ?? emptyConfig()), opts);
          break;
        }
        case 'set-mode': {
          const mode = parseInt(args[0], 10);
          await comms.setMode(mode);
          printStep('set-mode', { mode }, opts);
          break;
        }
        case 'set-midi-channel': {
          const ch1 = parseInt(args[0], 10);
          await comms.setMidiChannel(ch1 - 1);
          printStep('set-midi-channel', { channel: ch1 }, opts);
          break;
        }
        case 'set-midi-interface': {
          const v = parseInt(args[0], 10);
          await comms.setMidiInterface(v === 1);
          printStep('set-midi-interface', { trs: v === 1 }, opts);
          break;
        }
        case 'set-polarity': {
          const v = parseInt(args[0], 10);
          await comms.setPolarity(v === 1);
          printStep('set-polarity', { enabled: v === 1 }, opts);
          break;
        }
        case 'set-max-group-count': {
          const n = parseInt(args[0], 10);
          await comms.setMaxGroupCount(n);
          printStep('set-max-group-count', { count: n }, opts);
          break;
        }
        case 'set-max-banks': {
          const which = args[0].toUpperCase() === 'A' ? 0 : 1;
          const n = parseInt(args[1], 10);
          await comms.setMaxBanks(which, n);
          printStep('set-max-banks', { bank: args[0].toUpperCase(), count: n }, opts);
          break;
        }
        case 'set-usr-page': {
          const page = parseInt(args[0], 10) as 0 | 1;
          await comms.setUsrPage(page);
          printStep('set-usr-page', { page }, opts);
          break;
        }
        case 'set-custom-cc': {
          const bank = parseInt(args[0], 10);
          const cc = parseInt(args[1], 10);
          const latch = parseInt(args[2], 10);
          await comms.setCustomCc(bank, cc, latch);
          printStep('set-custom-cc', { bank, cc, latch }, opts);
          break;
        }
        case 'set-footswitch-mode': {
          const idx = FOOTSWITCH_NAMES.indexOf(args[0].toUpperCase()) as 0 | 1 | 2 | 3;
          const stepMode = parseInt(args[1], 10);
          await comms.setFootswitchMode(0, idx, stepMode);
          printStep(
            'set-footswitch-mode',
            { footswitch: args[0].toUpperCase(), step: stepMode },
            opts
          );
          break;
        }
        case 'set-footswitch-midi-code': {
          const [page, sw, bank, slot, ch1, type, d1, d2] = args.map((x) => parseInt(x, 10));
          const code = { enabled: true, channel: ch1 - 1, type, data1: d1, data2: d2 };
          await comms.setFootswitchMidiCode(
            page as 0 | 1,
            sw as 0 | 1 | 2 | 3,
            bank as 0 | 1,
            slot,
            code
          );
          printStep(
            'set-footswitch-midi-code',
            { page, sw, bank, slot, code: formatCode(code) },
            opts
          );
          break;
        }
        case 'clear-footswitch-banks': {
          const [page, sw, bank] = args.map((x) => parseInt(x, 10));
          await comms.clearFootswitchBanks(page as 0 | 1, sw as 0 | 1 | 2 | 3, bank as 0 | 1);
          printStep('clear-footswitch-banks', { page, sw, bank }, opts);
          break;
        }
        case 'apply-all': {
          await comms.applyAll();
          printStep('apply-all', null, opts);
          break;
        }
        case 'probe': {
          const request = parseBytes(args);
          if (request[0] !== 0xf0 || request[request.length - 1] !== 0xf7)
            throw new Error('probe bytes must start 0xf0 and end 0xf7');
          const result = await comms.probe(request, {});
          printStep('probe', { request: hex(request), responses: result.map((r) => hex(r)) }, opts);
          break;
        }
        case 'raw': {
          const bytes = parseBytes(args);
          const device = comms.getConnected();
          if (!device?.pair.outputId) throw new Error('not connected');
          await comms.midi.send(device.pair.outputId, bytes);
          printStep('raw', { bytes: hex(bytes) }, opts);
          break;
        }
        case 'wait':
          await new Promise((r) => setTimeout(r, parseInt(args[0], 10)));
          printStep('wait', { ms: parseInt(args[0], 10) }, opts);
          break;
        default:
          throw new Error(`unknown action: ${step}`);
      }
    }
  };

  try {
    for (let n = 0; n < (opts.loop ?? 1); n++) {
      await doActions();
    }
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      (opts.output ?? stdout).write(JSON.stringify({ ok: false, error: message }) + '\n');
    } else {
      (opts.output ?? stdout).write(`error: ${message}\n`);
    }
    return 1;
  } finally {
    await t?.close?.();
  }
}
