<script setup lang="ts">
import type { ChocolateDevice } from '../lib/device';

defineProps<{
  devices: ChocolateDevice[];
  scanned: boolean;
  selectedKey: string | null;
  connectedKey: string | null;
  connectingKey: string | null;
}>();

defineEmits<{
  select: [key: string];
  connect: [key: string];
  disconnect: [];
}>();

function statusLabel(status: ChocolateDevice['status']): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting…';
    case 'detected':
      return 'Detected';
    case 'failed':
      return 'Failed';
    default:
      return 'No response';
  }
}
</script>

<template>
  <section class="card">
    <div class="card-head">
      <h2>Devices</h2>
      <span class="muted">{{ devices.length }} discovered</span>
    </div>

    <p v-if="devices.length === 0" class="muted empty">
      {{
        scanned
          ? 'No devices responded to the discovery request.'
          : 'Run a scan to look for M-Vave Chocolate Plus devices on your MIDI ports.'
      }}
    </p>

    <ul class="device-list">
      <li
        v-for="device in devices"
        :key="device.pair.key"
        :class="['device-row', { selected: device.pair.key === selectedKey }]"
        @click="$emit('select', device.pair.key)"
      >
        <span
          :class="[
            'dot',
            device.status === 'connected' && 'dot-green',
            (device.status === 'detected' || device.status === 'connecting') && 'dot-yellow',
            device.status === 'failed' && 'dot-red dot-dim',
            device.status === 'connecting' && 'dot-pulse',
          ]"
          :title="statusLabel(device.status)"
        />
        <div class="device-info">
          <span class="device-name">{{ device.pair.name }}</span>
          <span class="muted small">
            {{ device.pair.manufacturer ?? 'Unknown maker' }} · {{ statusLabel(device.status) }}
          </span>
        </div>
        <button
          v-if="device.pair.key === connectedKey"
          class="btn btn-small"
          @click.stop="$emit('disconnect')"
        >
          Disconnect
        </button>
        <button
          v-else-if="device.status === 'detected' || device.status === 'failed'"
          class="btn btn-small btn-primary"
          :disabled="device.pair.key === connectingKey"
          @click.stop="$emit('connect', device.pair.key)"
        >
          {{ device.pair.key === connectingKey ? 'Connecting…' : 'Connect' }}
        </button>
      </li>
    </ul>
  </section>
</template>
