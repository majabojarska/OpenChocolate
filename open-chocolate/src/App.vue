<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { useMidi } from './lib';
import MidiMonitor from './components/MidiMonitor.vue';
import MidiPicker from './components/MidiPicker.vue';

const status = ref('Ready');
const response = ref('');
const error = ref('');
const selectedDeviceId = ref('');
const monitor = ref<{ direction: 'IN' | 'OUT'; timestamp: string; data: string }[]>([]);

const midi = useMidi();
const unsubscribeMidi = midi.subscribe((data, direction) => logMidi(direction, data));

watch(selectedDeviceId, (id) => {
  if (id) midi.selectDevice(id);
});

const hex = (data: Uint8Array) =>
  Array.from(data, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');

function logMidi(direction: 'IN' | 'OUT', data: Uint8Array) {
  const now = new Date();
  const isoTimestamp = now.toISOString();
  monitor.value.unshift({ direction, timestamp: isoTimestamp, data: hex(data) });
}

function clearMonitor() {
  monitor.value = [];
}

async function discover() {
  response.value = '';
  error.value = '';
  try {
    const { response: bytes } = await midi.discover(selectedDeviceId.value);
    response.value = hex(bytes);
    status.value = `Received ${bytes.length} bytes`;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
    status.value = 'Discovery failed';
  }
}

onUnmounted(() => {
  unsubscribeMidi();
});
</script>

<template>
  <main>
    <h1>M-Vave Chocolate Plus</h1>
    <MidiPicker v-model:selected-device-id="selectedDeviceId" />
    <button type="button" @click="discover">Discover device</button>
    <p>{{ status }}</p>
    <p v-if="error" class="error">{{ error }}</p>
    <section v-if="response">
      <h2>SysEx response</h2>
      <code>{{ response }}</code>
    </section>
    <MidiMonitor :monitor="monitor" @clear="clearMonitor" />
  </main>
</template>
