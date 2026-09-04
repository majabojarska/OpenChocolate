import { readonly, ref, shallowRef, type ComputedRef, type DeepReadonly, type Ref } from 'vue';
import type { DuplexDevice } from './types.js';

const selectedDeviceId = ref<string>('');
const selectedInputId = shallowRef<string | undefined>();

export function useSelection(devices: ComputedRef<DuplexDevice[]>) {
  function selectDevice(deviceId: string): void {
    if (!deviceId) {
      selectedDeviceId.value = '';
      selectedInputId.value = undefined;
      return;
    }
    const device = devices.value.find((d) => d.id === deviceId);
    if (!device) throw new Error('No MIDI device found');
    selectedDeviceId.value = device.id;
    selectedInputId.value = device.input.id;
  }

  return {
    selectedDeviceId: readonly(selectedDeviceId) as DeepReadonly<Ref<string>>,
    selectedInputId: readonly(selectedInputId) as DeepReadonly<Ref<string | undefined>>,
    selectDevice,
  };
}
