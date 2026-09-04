import { computed, readonly, ref, shallowRef } from 'vue';
import { buildDiscoveryRequest } from './sysex.js';

export type MidiDirection = 'IN' | 'OUT';
export type MidiListener = (
  data: Uint8Array,
  direction: MidiDirection,
  port: MIDIInput | MIDIOutput
) => void;

export interface DuplexDevice {
  id: string;
  name: string;
  input: MIDIInput;
  output: MIDIOutput;
}

export interface DiscoveryResult {
  request: Uint8Array;
  response: Uint8Array;
}

const access = shallowRef<MIDIAccess | undefined>();
const inputs = shallowRef<MIDIInput[]>([]);
const outputs = shallowRef<MIDIOutput[]>([]);
const error = ref('');
const selectedDeviceId = ref<string>('');
const selectedInputId = shallowRef<string | undefined>();
const listeners = new Set<MidiListener>();

function dispatch(data: Uint8Array, direction: MidiDirection, port: MIDIInput | MIDIOutput) {
  for (const listener of listeners) listener(data, direction, port);
}

function attachInputHandlers(): void {
  for (const port of inputs.value) {
    port.onmidimessage = (event) => {
      if (!event.data) return;
      // Only relay messages from the selected device's input.
      if (port.id !== selectedInputId.value) return;
      dispatch(new Uint8Array(event.data), 'IN', port);
    };
  }
}

function deviceKey(port: { name?: string | null; id: string }): string {
  return port.name?.trim() || port.id;
}

async function requestAccess(): Promise<MIDIAccess> {
  const current = access.value;
  if (current) return current;
  if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) {
    const message = 'Web MIDI is not supported by this browser';
    error.value = message;
    throw new Error(message);
  }
  try {
    const next = await navigator.requestMIDIAccess({ sysex: true });
    access.value = next;
    next.onstatechange = () => refreshDevices();
    refreshDevices();
    return next;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
    throw cause;
  }
}

function refreshDevices(): void {
  const current = access.value;
  if (!current) return;
  inputs.value = Array.from(current.inputs.values());
  outputs.value = Array.from(current.outputs.values());
  attachInputHandlers();
}

function send(outputId: string, data: Uint8Array): void {
  if (!access.value) throw new Error('MIDI access not requested');
  const output = outputs.value.find((port) => port.id === outputId);
  if (!output) throw new Error(`No MIDI output with id ${outputId}`);
  output.send(data);
  dispatch(new Uint8Array(data), 'OUT', output);
}

function selectDevice(deviceId: string): void {
  if (!deviceId) {
    selectedDeviceId.value = '';
    selectedInputId.value = undefined;
    return;
  }
  const device = duplexDevices.value.find((d) => d.id === deviceId);
  if (!device) throw new Error('No MIDI device found');
  selectedDeviceId.value = device.id;
  selectedInputId.value = device.input.id;
}

function subscribe(listener: MidiListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isSysEx(data: Uint8Array): boolean {
  return data.length > 0 && data[0] === 0xf0 && data[data.length - 1] === 0xf7;
}

async function discover(deviceId: string): Promise<DiscoveryResult> {
  await requestAccess();
  selectDevice(deviceId);
  const output = duplexDevices.value.find((d) => d.id === deviceId)!.output;
  const request = buildDiscoveryRequest();
  return new Promise((resolve, reject) => {
    const unsubscribe = subscribe((data, direction) => {
      if (direction !== 'IN') return;
      if (!isSysEx(data)) return;
      unsubscribe();
      resolve({ request, response: data });
    });
    try {
      send(output.id, request);
    } catch (cause) {
      unsubscribe();
      reject(cause);
    }
  });
}

const duplexDevices = computed<DuplexDevice[]>(() => {
  const outputsByKey = new Map<string, MIDIOutput>();
  for (const output of outputs.value) outputsByKey.set(deviceKey(output), output);
  const seen = new Set<string>();
  const devices: DuplexDevice[] = [];
  for (const input of inputs.value) {
    const key = deviceKey(input);
    if (seen.has(key)) continue;
    const output = outputsByKey.get(key);
    if (!output) continue;
    seen.add(key);
    devices.push({ id: key, name: key, input, output });
  }
  return devices;
});

export function useMidi() {
  return {
    duplexDevices: readonly(duplexDevices),
    error: readonly(error),
    selectedDeviceId: readonly(selectedDeviceId),
    requestAccess,
    refreshDevices,
    selectDevice,
    send,
    subscribe,
    discover,
  };
}
