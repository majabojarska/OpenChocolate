import { computed, type Ref } from 'vue';
import { buildDiscoveryRequest } from '../sysex.js';
import { pairDuplexDevices } from './devices.js';
import { isSysEx, awaitOneShot } from './oneShot.js';
import { useSelection } from './selection.js';
import { transport } from './transport.js';
import type { DuplexDevice, MidiEvent, MidiListener, Unsubscribe } from './types.js';

export interface DiscoveryResult {
  request: Uint8Array;
  response: Uint8Array;
}

export type UseMidi = {
  duplexDevices: Readonly<Ref<DuplexDevice[]>>;
  error: Readonly<Ref<string>>;
  selectedDeviceId: Readonly<Ref<string>>;
  selectedInputId: Readonly<Ref<string | undefined>>;
  requestAccess: () => Promise<MIDIAccess>;
  refreshDevices: () => Promise<void>;
  selectDevice: (id: string) => void;
  send: (outputId: string, data: Uint8Array) => void;
  subscribe: (listener: MidiListener) => Unsubscribe;
  discover: (deviceId: string) => Promise<DiscoveryResult>;
};

function filterByInput(
  subscribe: (listener: MidiListener) => Unsubscribe,
  getSelectedInputId: () => string | undefined
): (listener: MidiListener) => Unsubscribe {
  return (listener) => {
    return subscribe((event: MidiEvent) => {
      if (event.direction === 'IN' && event.port.id !== getSelectedInputId()) return;
      listener(event);
    });
  };
}

export function useMidi(): UseMidi {
  const inputsRef = transport.inputs;
  const outputsRef = transport.outputs;
  const duplexDevices = computed<DuplexDevice[]>(() =>
    pairDuplexDevices(inputsRef.value, outputsRef.value)
  );

  const selection = useSelection(duplexDevices);
  const subscribe = filterByInput(transport.subscribe, () => selection.selectedInputId.value);

  async function refreshDevices(): Promise<void> {
    const access = transport.access();
    if (!access) return;
    inputsRef.value = Array.from(access.inputs.values());
    outputsRef.value = Array.from(access.outputs.values());
  }

  async function discover(deviceId: string): Promise<DiscoveryResult> {
    await transport.requestAccess();
    selection.selectDevice(deviceId);
    const device = duplexDevices.value.find((d) => d.id === deviceId);
    if (!device) throw new Error('No MIDI device found');

    const request = buildDiscoveryRequest();
    const matched = awaitOneShot(subscribe, (event) => {
      return event.direction === 'IN' && isSysEx(event.data);
    });
    transport.send(device.output.id, request);
    const event = await matched;
    return { request, response: event.data };
  }

  return {
    duplexDevices,
    error: transport.error(),
    selectedDeviceId: selection.selectedDeviceId,
    selectedInputId: selection.selectedInputId,
    requestAccess: transport.requestAccess,
    refreshDevices,
    selectDevice: selection.selectDevice,
    send: transport.send,
    subscribe,
    discover,
  };
}
