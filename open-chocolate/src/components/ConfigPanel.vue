<script setup lang="ts">
import { computed, ref } from 'vue';
import { MODES, MODE_META } from '../lib/modes';
import type { DeviceConfig, MidiCode } from '../lib/device';

// Import mode-specific sub-views
import {
  PcView,
  CustomView,
  AdvancedView,
  PredefinedActionsView,
  CustomKeyboardView,
  MixKeyView,
} from './config';

const props = defineProps<{
  config: DeviceConfig;
  hasDevice: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{
  mode: [mode: number];
  'midi-channel': [ch0: number];
  interface: [trs: boolean];
  polarity: [enabled: boolean];
  'group-count': [count: number];
  'max-banks': [payload: { which: 0 | 1; count: number }];
  footswitch: [payload: { page: 0 | 1; index: 0 | 1 | 2 | 3; step: number }];
  'footswitch-bank': [
    payload: {
      page: 0 | 1;
      index: 0 | 1 | 2 | 3;
      bank: 0 | 1;
      slot: number | null;
      code: MidiCode | null;
    },
  ];
  'custom-cc': [payload: { bank: number; cc: number; latch: number }];
  reread: [];
  export: [];
  import: [file: File];
  'apply-all': [];
}>();

const meta = computed(() =>
  props.config.mode === null ? undefined : MODE_META[props.config.mode]
);
const view = computed(() => meta.value?.view ?? 'none');

const groupCounts = [1, 2, 3, 4, 5, 6, 7, 8];
const channelNumbers = Array.from({ length: 16 }, (_, i) => i + 1);

const fileInput = ref<HTMLInputElement | null>(null);

/** Numeric value of a select / number input event. */
function numericValue(ev: Event): number {
  return Number((ev.target as HTMLInputElement).value);
}

/** Checked state of a checkbox event. */
function checked(ev: Event): boolean {
  return (ev.target as HTMLInputElement).checked;
}

function onImportClick() {
  fileInput.value?.click();
}

function onImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) emit('import', file);
  input.value = '';
}
</script>

<template>
  <section class="card">
    <div class="card-head">
      <h2>Configuration</h2>
      <div class="row gap">
        <button class="btn btn-small" :disabled="!hasDevice || busy" @click="$emit('reread')">
          Re-read
        </button>
        <button class="btn btn-small" :disabled="!hasDevice" @click="$emit('export')">
          Export
        </button>
        <button class="btn btn-small" :disabled="!hasDevice" @click="onImportClick">Import</button>
        <button
          class="btn btn-small btn-primary"
          :disabled="!hasDevice || busy"
          @click="$emit('apply-all')"
        >
          Apply all to device
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          hidden
          @change="onImportFile"
        />
      </div>
    </div>

    <p v-if="!hasDevice" class="muted empty">
      Connect a device to read and change its configuration.
    </p>

    <template v-else>
      <label class="field">
        <span>Operating mode</span>
        <select
          class="control"
          :value="config.mode ?? 0"
          :disabled="busy"
          @change="$emit('mode', Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="m in MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </label>

      <!-- ---- mode-specific sub-view ---- -->
      <div v-if="meta" class="mode-view">
        <p class="mode-info">{{ meta.info }}</p>
        <p v-if="meta.groups" class="mode-info muted small">{{ meta.groups }}</p>

        <!-- Program Change A / B -->
        <PcView
          v-if="view === 'pc'"
          :config="config"
          :busy="busy"
          @max-banks="$emit('max-banks', $event)"
        />

        <!-- Custom -->
        <CustomView
          v-else-if="view === 'custom'"
          :config="config"
          :busy="busy"
          @custom-cc="$emit('custom-cc', $event)"
        />

        <!-- Advanced Custom -->
        <AdvancedView
          v-else-if="view === 'advanced'"
          :config="config"
          :busy="busy"
          @footswitch="$emit('footswitch', $event)"
          @footswitch-bank="$emit('footswitch-bank', $event)"
        />

        <!-- Predefined actions (for modes with fixed footswitch actions) -->
        <PredefinedActionsView v-else-if="meta.actions" :meta="meta" />

        <!-- Custom Keyboard -->
        <CustomKeyboardView v-else-if="view === 'customKeyboard'" />

        <!-- Mix Key -->
        <MixKeyView v-else-if="view === 'mixKey'" />
      </div>

      <!-- ---- device-wide settings ---- -->
      <h3>Device-wide settings</h3>
      <div class="grid">
        <label class="field">
          <span>MIDI channel</span>
          <select
            class="control"
            :value="(config.midiChannel ?? 0) + 1"
            :disabled="busy"
            @change="$emit('midi-channel', numericValue($event) - 1)"
          >
            <option v-for="c in channelNumbers" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>

        <label class="field">
          <span>Max groups</span>
          <select
            class="control"
            :value="config.maxGroupCount ?? 1"
            :disabled="busy"
            @change="$emit('group-count', numericValue($event))"
          >
            <option v-for="c in groupCounts" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>

        <div class="field">
          <span>TRS jack</span>
          <div class="row gap radio-row">
            <label class="row small">
              <input
                type="radio"
                name="trs-jack"
                :checked="config.midiInterface === 0"
                :disabled="busy"
                @change="$emit('interface', false)"
              />
              Expression pedal
            </label>
            <label class="row small">
              <input
                type="radio"
                name="trs-jack"
                :checked="config.midiInterface === 1"
                :disabled="busy"
                @change="$emit('interface', true)"
              />
              TRS-MIDI
            </label>
          </div>
        </div>

        <label class="field row">
          <span>Reverse polarity</span>
          <input
            type="checkbox"
            class="switch"
            :checked="config.polarity"
            :disabled="busy"
            @change="$emit('polarity', checked($event))"
          />
        </label>
      </div>
    </template>
  </section>
</template>
