<script setup lang="ts">
import { FOOTSWITCH_NAMES } from '../../lib/modes';
import type { DeviceConfig } from '../../lib/device';

const props = defineProps<{
  config: DeviceConfig;
  busy: boolean;
}>();

const emit = defineEmits<{
  'custom-cc': [payload: { bank: number; cc: number; latch: number }];
}>();

function numericValue(ev: Event): number {
  return Number((ev.target as HTMLInputElement).value);
}

function onCcInput(bank: number, ev: Event) {
  const value = numericValue(ev) & 0x7f;
  emit('custom-cc', { bank, cc: value, latch: props.config.customCc[bank]?.[1] ?? 0 });
}

function onCcLatch(bank: number, ev: Event) {
  const latch = numericValue(ev);
  emit('custom-cc', { bank, cc: props.config.customCc[bank]?.[0] ?? 0, latch });
}
</script>

<template>
  <div class="grid grid-4">
    <label v-for="(name, i) in FOOTSWITCH_NAMES.slice(0, 4)" :key="name" class="field">
      <span>Footswitch {{ name }}</span>
      <div class="row gap">
        <input
          class="control"
          type="number"
          min="0"
          max="127"
          placeholder="CC"
          :value="config.customCc[i]?.[0] ?? ''"
          :disabled="busy"
          @change="onCcInput(i, $event)"
        />
        <select
          class="control"
          :value="config.customCc[i]?.[1] ?? 0"
          :disabled="busy"
          @change="onCcLatch(i, $event)"
        >
          <option :value="0">Momentary</option>
          <option :value="1">Latching</option>
        </select>
      </div>
    </label>
  </div>
  <p class="muted small note">
    Press sends CC(n,1), release sends CC(n,0). The device stores a fifth CC slot with no documented
    footswitch; it is left untouched.
  </p>
</template>
