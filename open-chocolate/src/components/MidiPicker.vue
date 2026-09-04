<script setup lang="ts">
import { useMidi } from '../lib';

defineProps<{
  selectedDeviceId: string;
}>();

const emit = defineEmits<{
  'update:selectedDeviceId': [value: string];
}>();

const { duplexDevices, error } = useMidi();
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
