<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useMidi } from '../lib';

const props = defineProps<{
  selectedDeviceId: string;
}>();

const emit = defineEmits<{
  'update:selectedDeviceId': [value: string];
}>();

const { duplexDevices, error, requestAccess } = useMidi();

// Case insensitive
// We want to auto-select the device if it's present.
// Over BLE it presents as FootCtrlPlus, but over USB it presents as Sinco.
// Configuration is only supported over USB, so prioritize Sinco if both are present.
const knownDeviceNames = ['sinco', 'footctrlplus'];

onMounted(() => {
  requestAccess().catch(() => {
    /* error is surfaced via the shared `error` ref */
  });
});

watch(
  [duplexDevices, () => props.selectedDeviceId],
  ([devices, selectedId]) => {
    if (selectedId) return;
    const match = (() => {
      for (const ref of knownDeviceNames) {
        const found = devices.find((device) => device.name.toLowerCase().includes(ref));
        if (found) return found;
      }
      return undefined;
    })();
    if (match) emit('update:selectedDeviceId', match.id);
  },
  { immediate: true }
);
</script>

<template>
  <div class="midi-picker">
    <p v-if="error" class="error">{{ error }}</p>
    <label>
      MIDI device
      <select
        :value="selectedDeviceId"
        @change="emit('update:selectedDeviceId', ($event.target as HTMLSelectElement).value)"
      >
        <option disabled value="">Select a device</option>
        <option v-for="device in duplexDevices" :key="device.id" :value="device.id">
          {{ device.name || device.id }}
        </option>
      </select>
    </label>
  </div>
</template>

<style scoped>
.midi-picker {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: flex-end;
}
.midi-picker label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.midi-picker select {
  padding: 0.5rem;
  min-width: 200px;
}
.midi-picker .error {
  width: 100%;
  color: var(--error-color, #c00);
  margin: 0;
}
</style>
