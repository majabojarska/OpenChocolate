<script setup lang="ts">
import { FOOTSWITCH_NAMES, FOOTSWITCH_STEPS } from '../../lib/modes';
import type { DeviceConfig } from '../../lib/device';

defineProps<{
  config: DeviceConfig;
  busy: boolean;
}>();

defineEmits<{
  'usr-page': [page: 0 | 1];
  footswitch: [payload: { page: 0 | 1; index: 0 | 1 | 2 | 3; step: number }];
}>();

function numericValue(ev: Event): number {
  return Number((ev.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="field">
    <span>Variant</span>
    <div class="row gap radio-row">
      <label class="row small">
        <input
          type="radio"
          name="usrpage"
          value="0"
          :checked="config.usrPage === 0"
          :disabled="busy"
          @change="$emit('usr-page', 0)"
        />
        Mode 1 - five sub-modes
      </label>
      <label class="row small">
        <input
          type="radio"
          name="usrpage"
          value="1"
          :checked="config.usrPage === 1"
          :disabled="busy"
          @change="$emit('usr-page', 1)"
        />
        Mode 2 - short tap + long press (up to 16 groups)
      </label>
    </div>
  </div>
  <div class="grid grid-4">
    <label v-for="(name, i) in FOOTSWITCH_NAMES" :key="name" class="field">
      <span>Footswitch {{ name }}</span>
      <select
        class="control"
        :value="config.footswitchModes[i] ?? 0"
        :disabled="busy"
        @change="
          $emit('footswitch', {
            page: (config.usrPage ?? 0) as 0 | 1,
            index: i as 0 | 1 | 2 | 3,
            step: numericValue($event),
          })
        "
      >
        <option v-for="s in FOOTSWITCH_STEPS" :key="s.value" :value="s.value">
          {{ s.label }}
        </option>
      </select>
    </label>
  </div>
  <p class="muted small note">
    Editing the per-switch MIDI codes and banks of this mode is not supported yet.
  </p>
</template>
