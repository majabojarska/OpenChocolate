<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { findAutoSelectDevice, useMidi, type MidiEvent } from './lib';
import { createMonitorEntry, type MonitorEntry } from './lib/format';
import { toHex } from './lib/hex';
import MidiMonitor from './components/MidiMonitor.vue';
import MidiPicker from './components/MidiPicker.vue';

const status = ref('Ready');
const response = ref('');
const error = ref('');
const selectedDeviceId = ref('');
const monitor = ref<MonitorEntry[]>([]);

const midi = useMidi();
const unsubscribeMidi = midi.subscribe((event: MidiEvent) => {
  monitor.value.unshift(createMonitorEntry(event.direction, event.data));
});

onMounted(() => {
  midi.requestAccess().catch(() => {
    /* The composable surfaces the reason on its shared `error` ref. */
  });
});

// Once devices are known and the user hasn't picked one yet, auto-select the
// known hardware (Sinco over USB, FootCtrlPlus over BLE).
watch(
  [midi.duplexDevices, selectedDeviceId],
  ([devices, picked]) => {
    if (picked) return;
    const match = findAutoSelectDevice(devices);
    if (match) selectedDeviceId.value = match.id;
  },
  { immediate: true }
);

// Keep the composable's selection in sync with the user's pick. The picker is
// a dumb control; it only emits, this is the single source of truth.
watch(selectedDeviceId, (id) => {
  if (id) midi.selectDevice(id);
});

function clearMonitor() {
  monitor.value = [];
}

async function discover() {
  response.value = '';
  error.value = '';
  try {
    const { response: bytes } = await midi.discover(selectedDeviceId.value);
    response.value = toHex(bytes);
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
