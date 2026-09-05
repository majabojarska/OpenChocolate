import { describe, expect, it } from 'vitest';
import { run, type CliOut } from '../cli-lib.ts';
import type { MidiDevicePair, MidiMessageEvent, MidiTransport } from '../midi.ts';

/**
 * Scripted in-memory transport that speaks the protocol responses the CLI's
 * CommsService expects: discovery responses, full read-back pages, and ACKs.
 * Keeps CLI tests off the real device while exercising the real io-less core.
 */
class ScriptedTransport implements MidiTransport {
  listeners: ((ev: MidiMessageEvent) => void)[] = [];
  sent: Uint8Array[] = [];
  answerProbes = true;

  async requestAccess() {}
  async openInput() {}
  listDevices(): MidiDevicePair[] {
    return [
      {
        key: 'device-key',
        name: 'Chocolate Plus',
        manufacturer: 'SinCo',
        inputId: 'input:0',
        outputId: 'output:0',
      },
    ];
  }
  onMessage(cb: (ev: MidiMessageEvent) => void) {
    this.listeners.push(cb);
  }
  async send(_key: string, bytes: readonly number[]): Promise<void> {
    const frame = Uint8Array.from(bytes);
    this.sent.push(frame);
    // Queue responses and drain them later. Discard any response queued for a
    // PREVIOUS request that hasn't drained yet (e.g. across loop iterations) so
    // stale responses can't satisfy a newer expectation.
    this.queue = [];
    const responses = this.respondTo(frame);
    for (const [idx, resp] of responses) {
      this.queue.push({ idx, resp });
    }
    this.scheduleDrain();
  }

  private queue: { idx: number; resp: Uint8Array }[] = [];
  private drainScheduled = false;
  private scheduleDrain(): void {
    if (this.drainScheduled || this.queue.length === 0) return;
    this.drainScheduled = true;
    setTimeout(() => {
      this.drainScheduled = false;
      const batch = this.queue;
      this.queue = [];
      for (const { idx, resp } of batch) this.emit(idx, resp);
    }, 10);
  }
  emit(index: number, bytes: Uint8Array) {
    const key = `input:${index}`;
    for (const cb of this.listeners) {
      cb({ key, name: 'Chocolate Plus', bytes, timestamp: 0 });
    }
  }
  /** Build the device's responses to a request frame. */
  respondTo(bytes: Uint8Array): Array<[number, Uint8Array]> {
    const out: Array<[number, Uint8Array]> = [];
    const header = bytes.slice(0, 4).join(',');
    if (header === '240,0,50,69') {
      // Discovery: a 10-byte discovery REQUEST (f0 .. 40 7f f7) gets the 45 58
      // response; a short probe (f0 00 32 45 f7) gets one only if answerProbes.
      const isLong = bytes.length >= 10;
      if (isLong || this.answerProbes) {
        out.push([0, Uint8Array.from([0xf0, 0x00, 0x32, 0x45, 0x58, 0x01, 0xf7])]);
      }
    } else if (header === '240,0,50,13' && bytes[4] === 0x41) {
      // read requests: F0 00 32 0d 41 00 00 00 02 <sel 4b@8..11> <marker 2b@12..13> 00 00 <rr>
      // The <sel> is 4 bytes (blob addresses go up to 23645); decode all 3
      // significant bytes. The marker is 0x70 0x36 for the final page read,
      // 0x10 0x7e otherwise (the response also swaps byte 4 to 0x79).
      const pageId = bytes[9] | (bytes[10] << 7) | (bytes[11] << 14);
      const final = bytes[13] === 0x70 && bytes[14] === 0x36;
      // Response layout (matches parseMessage):
      //   F0 00 32 0D 49/79 3F 00 00 02 <addr:4@9..12> 10 7E 00 00 <payload> 00 00 F7
      // Response layout (parseMessage reads addr from data.slice(9,13)):
      //   F0 00 32 0D 49/79 <x> 00 00 02 <addr:4 at 9..12> 10 7E 00 00 <payload> 00 00 F7
      const payload = new Array(final ? 521 : 1178).fill(final ? 0xaa : 0xcc);
      out.push([
        0,
        Uint8Array.from([
          0xf0,
          0x00,
          0x32,
          0x0d,
          final ? 0x79 : 0x49,
          0x3f,
          0x00,
          0x00,
          0x02,
          pageId & 0x7f,
          (pageId >> 7) & 0x7f,
          (pageId >> 14) & 0x7f,
          0, // addr at 9..12
          0x10,
          0x7e,
          0x00,
          0x00,
          ...payload,
          0x00,
          0x00,
          0xf7,
        ]),
      ]);
    } else if (header === '240,0,50,9' && bytes[4] === 0x49) {
      // configuration write (cmd 0x09, sub 0x49) -> ack
      out.push([
        0,
        Uint8Array.from([0xf0, 0x00, 0x32, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00, 0x7f, 0x01, 0xf7]),
      ]);
    }
    return out;
  }
}

function makeOut(): CliOut & { text(): string } {
  const chunks: string[] = [];
  return {
    write: (s) => chunks.push(String(s)),
    text: () => chunks.join(''),
  };
}

async function cli(
  argv: string[],
  transport: ScriptedTransport & { close?(): Promise<void> },
  out: CliOut,
  opts: Record<string, unknown> = {}
) {
  const code = await run(argv, transport, { output: out, ...opts });
  return { code, out };
}

describe('open-chocolate CLI', () => {
  it('run() against the scripted transport: scan + connect + reread + probe', async () => {
    const t = new ScriptedTransport() as ScriptedTransport & { close?(): Promise<void> };
    t.answerProbes = true;
    const out = makeOut();
    const { code } = await cli(
      ['scan', 'connect', 'reread', 'probe', '0xf0', '0x00', '0x32', '0x45', '0xf7', '--json'],
      t,
      out,
      { scanSettle: 50, timeout: 1000 }
    );
    expect(code).toBe(0);
    const lines = out
      .text()
      .trim()
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l));
    expect(lines[0].step).toBe('scan');
    expect(lines[1].step).toBe('connect');
    expect(lines[2].step).toBe('reread');
    expect(lines[3].step).toBe('probe');
    expect(lines[3].data.responses.some((r: string) => r.includes('45 58'))).toBe(true);
  });

  it('loop repeats the action sequence', async () => {
    const t = new ScriptedTransport() as ScriptedTransport & { close?(): Promise<void> };
    const out = makeOut();
    const { code } = await cli(
      ['scan', 'connect', 'set-mode', '3', '--loop', '2', '--json'],
      t,
      out,
      { scanSettle: 200, timeout: 1000 }
    );
    expect(code).toBe(0);
    const steps = out
      .text()
      .trim()
      .split('\n')
      .filter((l) => l.startsWith('{'))
      .map((l) => JSON.parse(l));
    expect(steps.filter((s) => s.step === 'set-mode')).toHaveLength(2);
  });

  it('probe returns raw responses without decoding', async () => {
    const t = new ScriptedTransport() as ScriptedTransport & { close?(): Promise<void> };
    const out = makeOut();
    const { code } = await cli(
      ['scan', 'connect', 'probe', '0xf0', '0x00', '0x32', '0x45', '0xf7', '--json'],
      t,
      out,
      { scanSettle: 50, timeout: 1000 }
    );
    expect(code).toBe(0);
    const lines = out
      .text()
      .trim()
      .split('\n')
      .filter((l) => l.startsWith('{'))
      .map((l) => JSON.parse(l));
    const probeLine = lines.find((l) => l.step === 'probe');
    expect(probeLine).toBeTruthy();
    expect(probeLine.data.responses[0]).toContain('45 58');
  });

  it('probe fails cleanly when the device goes silent (timeout)', async () => {
    const t = new ScriptedTransport() as ScriptedTransport & { close?(): Promise<void> };
    t.answerProbes = false;
    const out = makeOut();
    const { code } = await cli(
      ['scan', 'connect', 'probe', '0xf0', '0x00', '0x32', '0x45', '0xf7', '--json'],
      t,
      out,
      { scanSettle: 50, timeout: 1000 }
    );
    // The probe fails (silent device), so run() aborts with exit 1 and the
    // failure is reported in --json output.
    expect(code).toBe(1);
    expect(out.text()).toContain('"ok":false'); // ...probe step reported failure
    expect(out.text()).toContain('"error"');
  });
});
