import { ref, shallowRef } from 'vue';
import type { MidiEvent, MidiListener, Unsubscribe } from './types.js';

const access = shallowRef<MIDIAccess | undefined>();
const inputs = shallowRef<MIDIInput[]>([]);
const outputs = shallowRef<MIDIOutput[]>([]);
const error = ref('');
const listeners = new Set<MidiListener>();
let onStateChange: (() => void) | null = null;

function dispatch(event: MidiEvent): void {
  for (const listener of listeners) listener(event);
}

function attachInputHandlers(): void {
  for (const port of inputs.value) {
    port.onmidimessage = (message) => {
      if (!message.data) return;
      dispatch({
        data: new Uint8Array(message.data),
        direction: 'IN',
        port,
      });
    };
  }
}

function refreshInputsAndOutputs(next: MIDIAccess): void {
  inputs.value = Array.from(next.inputs.values());
  outputs.value = Array.from(next.outputs.values());
  attachInputHandlers();
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
    refreshInputsAndOutputs(next);
    onStateChange = () => refreshInputsAndOutputs(next);
    next.onstatechange = onStateChange;
    return next;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
    throw cause;
  }
}

function send(outputId: string, data: Uint8Array): void {
  if (!access.value) throw new Error('MIDI access not requested');
  const output = outputs.value.find((port) => port.id === outputId);
  if (!output) throw new Error(`No MIDI output with id ${outputId}`);
  output.send(data);
  dispatch({ data: new Uint8Array(data), direction: 'OUT', port: output });
}

function subscribe(listener: MidiListener): Unsubscribe {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const transport = {
  access: () => access.value,
  inputs,
  outputs,
  error: () => error,
  requestAccess,
  send,
  subscribe,
};
