<script setup lang="ts">
import { computed, ref } from 'vue';
import { FOOTSWITCH_NAMES, FOOTSWITCH_STEPS, MODES } from '../lib/sysex';
import { MODE_META } from '../lib/modes';
import type { DeviceConfig } from '../lib/device';

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
  'usr-page': [page: 0 | 1];
  footswitch: [payload: { page: 0 | 1; index: 0 | 1 | 2 | 3; step: number }];
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
const maxBanks = computed(() =>
  props.config.mode === 1 ? props.config.maxBanksPcB : props.config.maxBanksPcA
);

const bankCounts = Array.from({ length: 32 }, (_, i) => i + 1);
const groupCounts = [1, 2, 3, 4, 5, 6, 7, 8];
const channelNumbers = Array.from({ length: 16 }, (_, i) => i + 1);

const fileInput = ref<HTMLInputElement | null>(null);

function onImportClick() {
  fileInput.value?.click();
}

function onImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) emit('import', file);
  input.value = '';
}

function onCcInput(bank: number, ev: Event) {
  const value = Number((ev.target as HTMLInputElement).value) & 0x7f;
  emit('custom-cc', { bank, cc: value, latch: props.config.customCc[bank]?.[1] ?? 0 });
}

function onCcLatch(bank: number, ev: Event) {
  const latch = Number((ev.target as HTMLSelectElement).value);
  emit('custom-cc', { bank, cc: props.config.customCc[bank]?.[0] ?? 0, latch });
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
        <template v-if="view === 'pc'">
          <label class="field narrow">
            <span>Max banks</span>
            <select
              class="control"
              :value="maxBanks ?? 32"
              :disabled="busy"
              @change="
                $emit('max-banks', {
                  which: (config.mode === 1 ? 1 : 0) as 0 | 1,
                  count: Number(($event.target as HTMLSelectElement).value),
                })
              "
            >
              <option v-for="c in bankCounts" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
        </template>

        <!-- Custom -->
        <template v-else-if="view === 'custom'">
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
            Press sends CC(n,1), release sends CC(n,0). The device stores a fifth CC slot with no
            documented footswitch; it is left untouched.
          </p>
        </template>

        <!-- Advanced Custom -->
        <template v-else-if="view === 'advanced'">
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
                    step: Number(($event.target as HTMLSelectElement).value),
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

        <!-- Predefined actions -->
        <template v-else-if="meta.actions">
          <div class="actions-grid">
            <div v-for="(action, i) in meta.actions" :key="i" class="action-cell">
              <span class="sw">{{ FOOTSWITCH_NAMES[i] }}</span>
              {{ action }}
            </div>
          </div>
        </template>

        <template v-else-if="view === 'customKeyboard'">
          <p class="muted small note">
            Key and combination editing is not supported yet. 18 groups are switched with E (A+B)
            and F (C+D).
          </p>
        </template>

        <template v-else-if="view === 'mixKey'">
          <p class="muted small note">Per-switch function editing is not supported yet.</p>
        </template>
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
            @change="$emit('midi-channel', Number(($event.target as HTMLSelectElement).value) - 1)"
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
            @change="$emit('group-count', Number(($event.target as HTMLSelectElement).value))"
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
          <span>Polarity reversal</span>
          <input
            type="checkbox"
            class="switch"
            :checked="config.polarity"
            :disabled="busy"
            @change="$emit('polarity', ($event.target as HTMLInputElement).checked)"
          />
        </label>
      </div>
    </template>
  </section>
</template>
