/**
 * Web MIDI wrapper. Detects ports, groups inputs/outputs of the same hardware
 * device, sends and receives raw MIDI byte arrays.
 *
 * UI-free: everything is exposed through callbacks and promises.
 */

export interface MidiDevicePair {
  /** Stable key used in the UI (groups input+output of one device). */
  key: string;
  name: string;
  manufacturer: string | null;
  inputId: string | null;
  outputId: string | null;
}

export interface MidiMessageEvent {
  /** Key of the port the message arrived on. */
  key: string;
  bytes: Uint8Array;
  /** Monotonic milliseconds at reception. */
  timestamp: number;
}

export interface MidiPortInfo {
  id: string;
  name: string | null;
  manufacturer: string | null;
  type: 'input' | 'output';
}

/** Strip port-number / direction suffixes for fuzzy in/out matching. */
export function normalizePortName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(midi|usb)\b/g, ' ')
    .replace(/\b(in|out|input|output)\b/g, ' ')
    .replace(/\s*\d+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pure port grouping used by `MidiAccess.listDevices`.
 *
 * The Web MIDI spec gives no link between an input port and its sibling
 * output port, so ports are grouped by name (most USB MIDI devices report
 * the same product name for both directions). When exact names do not
 * match, orphan ports are merged by a normalised name that strips common
 * suffixes like "MIDI 1", "In", "Out".
 */
export function groupPorts(ports: MidiPortInfo[]): MidiDevicePair[] {
  const groups = new Map<string, MidiDevicePair>();
  const ensure = (name: string | null, manufacturer: string | null): MidiDevicePair => {
    const displayName = name ?? 'Unknown MIDI port';
    const key = `${manufacturer ?? ''}|${displayName}`;
    let pair = groups.get(key);
    if (!pair) {
      pair = {
        key,
        name: displayName,
        manufacturer: manufacturer ?? null,
        inputId: null,
        outputId: null,
      };
      groups.set(key, pair);
    }
    return pair;
  };
  for (const port of ports) {
    const pair = ensure(port.name, port.manufacturer);
    if (port.type === 'input') {
      if (pair.inputId === null) pair.inputId = port.id;
    } else if (pair.outputId === null) {
      pair.outputId = port.id;
    }
  }

  // Merge orphan groups (missing one direction) whose normalised names
  // match, e.g. "Foo MIDI In" + "Foo MIDI Out".
  const orphans = [...groups.values()].filter((p) => p.inputId === null || p.outputId === null);
  for (const orphan of orphans) {
    if (orphan.inputId !== null && orphan.outputId !== null) continue;
    const wantsInput = orphan.inputId === null;
    const mate = orphans.find(
      (other) =>
        other !== orphan &&
        groups.has(other.key) &&
        (wantsInput
          ? other.inputId !== null && other.outputId === null
          : other.outputId !== null && other.inputId === null) &&
        normalizePortName(other.name) === normalizePortName(orphan.name)
    );
    if (!mate) continue;
    orphan.inputId = orphan.inputId ?? mate.inputId;
    orphan.outputId = orphan.outputId ?? mate.outputId;
    orphan.manufacturer = orphan.manufacturer ?? mate.manufacturer;
    groups.delete(mate.key);
  }
  return [...groups.values()];
}

export class MidiAccess {
  private access: MIDIAccess | null = null;
  private listeners: ((ev: MidiMessageEvent) => void)[] = [];
  private stateChangeCb: (() => void) | null = null;
  error: string | null = null;

  private handler = (event: MIDIMessageEvent) => {
    const port = event.target as MIDIInput;
    const bytes = new Uint8Array(event.data ?? []);
    for (const cb of this.listeners) {
      cb({ key: port.id, bytes, timestamp: event.timeStamp ?? performance.now() });
    }
  };

  /** Ask for Web MIDI access (sysex required) and attach listeners. */
  async requestAccess(): Promise<void> {
    if (!navigator.requestMIDIAccess) {
      this.error =
        'Web MIDI API not available. Use Chrome, Edge or Firefox 108+ over HTTPS or localhost.';
      throw new Error(this.error);
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: true });
      this.error = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
    this.attachListeners();
    this.access.onstatechange = () => {
      this.attachListeners();
      this.stateChangeCb?.();
    };
  }

  onStateChange(cb: () => void): void {
    this.stateChangeCb = cb;
  }

  /** Group ports into devices so input+output appear as one entry. */
  listDevices(): MidiDevicePair[] {
    if (!this.access) return [];
    const ports: MidiPortInfo[] = [];
    for (const input of this.access.inputs.values()) {
      ports.push({
        id: input.id,
        name: input.name,
        manufacturer: input.manufacturer,
        type: 'input',
      });
    }
    for (const output of this.access.outputs.values()) {
      ports.push({
        id: output.id,
        name: output.name,
        manufacturer: output.manufacturer,
        type: 'output',
      });
    }
    return groupPorts(ports);
  }

  onMessage(cb: (ev: MidiMessageEvent) => void): void {
    this.listeners.push(cb);
  }

  async send(key: string, bytes: readonly number[]): Promise<void> {
    const output = this.access?.outputs.get(key);
    if (!output) throw new Error(`Unknown MIDI output: ${key}`);
    output.send(Uint8Array.from(bytes));
  }

  /** Explicitly open an input so the browser starts delivering messages. */
  async openInput(inputId: string): Promise<void> {
    if (!this.access) throw new Error('MIDI access not requested');
    const input = this.access.inputs.get(inputId);
    if (!input) throw new Error(`Unknown MIDI input: ${inputId}`);
    await input.open();
  }

  async closeInput(inputId: string): Promise<void> {
    const input = this.access?.inputs.get(inputId);
    if (input) {
      input.onmidimessage = null;
      await input.close();
    }
  }

  private attachListeners(): void {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = this.handler;
      // Firefox only starts delivering messages after an explicit open();
      // Chrome implies it when a handler is set.
      void input.open().catch(() => undefined);
    }
  }
}
