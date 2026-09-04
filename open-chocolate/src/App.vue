<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { buildDiscoveryRequest } from './lib/sysex';
import MidiMonitor from './components/MidiMonitor.vue';

const status = ref('Ready');
const response = ref('');
const error = ref('');
const inputs = ref<MIDIInput[]>([]);
const outputs = ref<MIDIOutput[]>([]);
const selectedInputId = ref('');
const selectedOutputId = ref('');
const monitor = ref<{ direction: 'IN' | 'OUT'; timestamp: string; data: string }[]>([]);
let access: MIDIAccess | undefined;

const hex = (data: Uint8Array) => Array.from(data, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
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
    if (!('requestMIDIAccess' in navigator)) throw new Error('Web MIDI is not supported by this browser');
    access ??= await navigator.requestMIDIAccess({ sysex: true });
    refreshDevices();
    const output = outputs.value.find((port) => port.id === selectedOutputId.value);
    const input = inputs.value.find((port) => port.id === selectedInputId.value);
    if (!output || !input) throw new Error('No MIDI input/output device found');
    input.onmidimessage = (event) => {
      if (!event.data) return;
      const bytes = new Uint8Array(event.data);
      logMidi('IN', bytes);
      if (bytes[0] === 0xf0 && bytes[bytes.length - 1] === 0xf7) {
        response.value = hex(bytes);
        status.value = `Received ${bytes.length} bytes`;
      }
    };
    const request = buildDiscoveryRequest();
    logMidi('OUT', request);
    output.send(request);
    status.value = `Sent discovery request on ${output.name ?? 'MIDI output'}; waiting for response`;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
    status.value = 'Discovery failed';
  }
}

function refreshDevices() {
  if (!access) return;
  inputs.value = Array.from(access.inputs.values());
  outputs.value = Array.from(access.outputs.values());
  if (!inputs.value.some((port) => port.id === selectedInputId.value)) {
    selectedInputId.value = inputs.value[0]?.id ?? '';
  }
  if (!outputs.value.some((port) => port.id === selectedOutputId.value)) {
    selectedOutputId.value = outputs.value[0]?.id ?? '';
  }
  inputs.value.forEach((port) => {
    port.onmidimessage = (event) => {
      if (event.data) logMidi('IN', new Uint8Array(event.data));
    };
  });
}

onMounted(async () => {
  try {
    access = await navigator.requestMIDIAccess({ sysex: true });
    refreshDevices();
    access.onstatechange = refreshDevices;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
    status.value = 'MIDI access failed';
  }
});
</script>

<template>
  <main>
    <h1>M-Vave Chocolate Plus</h1>
    <label>
      MIDI input
      <select v-model="selectedInputId">
        <option disabled value="">Select an input</option>
        <option v-for="port in inputs" :key="port.id" :value="port.id">
          {{ port.name || port.id }}
        </option>
      </select>
    </label>
    <label>
      MIDI output
      <select v-model="selectedOutputId">
        <option disabled value="">Select an output</option>
        <option v-for="port in outputs" :key="port.id" :value="port.id">
          {{ port.name || port.id }}
        </option>
      </select>
    </label>
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
