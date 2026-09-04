<script setup lang="ts">
import { computed } from 'vue';
import type { DeviceConfig } from '../../lib/device';

const props = defineProps<{
  config: DeviceConfig;
  busy: boolean;
}>();

defineEmits<{
  'max-banks': [payload: { which: 0 | 1; count: number }];
}>();

const bankCounts = Array.from({ length: 32 }, (_, i) => i + 1);
const maxBanks = computed(() =>
  props.config.mode === 1 ? props.config.maxBanksPcB : props.config.maxBanksPcA
);

function numericValue(ev: Event): number {
  return Number((ev.target as HTMLInputElement).value);
}
</script>

<template>
  <label class="field narrow">
    <span>Max banks</span>
    <select
      class="control"
      :value="maxBanks ?? 32"
      :disabled="busy"
      @change="
        $emit('max-banks', {
          which: (config.mode === 1 ? 1 : 0) as 0 | 1,
          count: numericValue($event),
        })
      "
    >
      <option v-for="c in bankCounts" :key="c" :value="c">{{ c }}</option>
    </select>
  </label>
</template>
