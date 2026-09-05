<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { FOOTSWITCH_NAMES, FOOTSWITCH_STEPS } from '../../lib/modes';
import { MIDI_CODE_TYPES } from '../../lib/sysex';
import { defaultMidiCode, type DeviceConfig, type MidiCode } from '../../lib/device';

const props = defineProps<{
  config: DeviceConfig;
  busy: boolean;
}>();

const emit = defineEmits<{
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
}>();

const selectedSwitch = ref<0 | 1 | 2 | 3>(0);
const activeBank = ref<0 | 1>(0);
/** Slot currently being edited, with a mutable draft. */
const editing = ref<{ slot: number; draft: MidiCode } | null>(null);

const channelNumbers = Array.from({ length: 16 }, (_, i) => i + 1);
const dataRange = Array.from({ length: 128 }, (_, i) => i);

const switchName = computed(() => FOOTSWITCH_NAMES[selectedSwitch.value]);
const mode = computed(() => props.config.footswitchModes[selectedSwitch.value] ?? 0);
const banks = computed(() => props.config.footswitchBanks[selectedSwitch.value] ?? null);
const bank = computed(() => (banks.value ? banks.value[activeBank.value] : null));

/** Bank B only exists for the two-bank modes, mirroring the official app. */
const showBankB = computed(() => mode.value !== 0 && mode.value !== 3);
/** Only Mode 1 (variant page 0) is offered; the variant selector was removed. */
const page = 0 as const;

// Dropping back to a single-bank mode while Bank B is open would hide the
// tab but keep showing Bank B contents, so snap back to Bank A.
watch(showBankB, (visible) => {
  if (!visible && activeBank.value === 1) activeBank.value = 0;
});

/** Slots that actually fire a message (enabled). */
const activeSlots = computed(() => {
  const out: { slot: number; code: MidiCode }[] = [];
  bank.value?.codes.forEach((code, slot) => {
    if (code.enabled) out.push({ slot, code });
  });
  return out;
});

const typeLabel = (type: number): string =>
  MIDI_CODE_TYPES.find((t) => t.value === type)?.label ?? `Type ${type}`;

function numericValue(ev: Event): number {
  return Number((ev.target as HTMLInputElement).value);
}

function selectSwitch(index: number) {
  selectedSwitch.value = index as 0 | 1 | 2 | 3;
  activeBank.value = 0;
  editing.value = null;
}

function selectBank(bank: 0 | 1) {
  activeBank.value = bank;
  editing.value = null;
}

/** Open the editor for a new slot - the first one that is not enabled. */
function addSlot() {
  const codes = bank.value?.codes;
  if (!codes) return;
  const slot = codes.findIndex((c) => !c.enabled);
  if (slot === -1) return; // all 16 slots in use
  // Adding a message implies it should fire: the starter draft is enabled.
  editing.value = { slot, draft: { ...defaultMidiCode(), enabled: true } };
}

function editSlot(slot: number) {
  const code = bank.value?.codes[slot];
  if (!code) return;
  editing.value = { slot, draft: { ...code } };
}

function saveEdit() {
  if (!editing.value) return;
  emit('footswitch-bank', {
    page: page,
    index: selectedSwitch.value,
    bank: activeBank.value,
    slot: editing.value.slot,
    code: editing.value.draft,
  });
  editing.value = null;
}

function cancelEdit() {
  editing.value = null;
}

function removeSlot(slot: number) {
  emit('footswitch-bank', {
    page: page,
    index: selectedSwitch.value,
    bank: activeBank.value,
    slot,
    code: defaultMidiCode(),
  });
}

function removeAll() {
  emit('footswitch-bank', {
    page: page,
    index: selectedSwitch.value,
    bank: activeBank.value,
    slot: null,
    code: null,
  });
}

function setDraft(ev: Event, field: 'channel' | 'type' | 'data1' | 'data2', mask: number) {
  const draft = editing.value?.draft;
  if (!draft) return;
  draft[field] = Number((ev.target as HTMLInputElement).value) & mask;
  // PC (type 0) messages have no data 2 - it is always 0. Switching to PC
  // clears a leftover value so the UI never carries one into the device.
  if (field === 'type' && draft.type === 0) draft.data2 = 0;
}
</script>

<template>
  <div class="sw-tabs" role="tablist" aria-label="Footswitch">
    <button
      v-for="(name, i) in FOOTSWITCH_NAMES"
      :key="name"
      class="seg-btn sw-tab"
      :class="{ active: selectedSwitch === i }"
      :disabled="busy"
      role="tab"
      :aria-selected="selectedSwitch === i"
      @click="selectSwitch(i)"
    >
      Footswitch {{ name }}
    </button>
  </div>

  <section class="bank-editor">
    <div class="bank-head">
      <span class="bank-title">Footswitch {{ switchName }}</span>
      <select
        class="control narrow-select"
        :value="mode"
        :disabled="busy"
        @change="
          $emit('footswitch', {
            page: page,
            index: selectedSwitch,
            step: numericValue($event),
          })
        "
      >
        <option v-for="s in FOOTSWITCH_STEPS" :key="s.value" :value="s.value">
          {{ s.label }}
        </option>
      </select>
    </div>

    <div class="seg bank-tabs">
      <button
        class="seg-btn"
        :class="{ active: activeBank === 0 }"
        :disabled="busy"
        @click="selectBank(0)"
      >
        Bank A
      </button>
      <button
        v-if="showBankB"
        class="seg-btn"
        :class="{ active: activeBank === 1 }"
        :disabled="busy"
        @click="selectBank(1)"
      >
        Bank B
      </button>
    </div>

    <p v-if="!showBankB" class="muted small note">
      This mode uses a single group, so Bank B is not available. Switch to a two-group mode (single
      tap - two groups, press-release or short tap - long press) to edit Bank B.
    </p>

    <p v-if="!banks" class="muted small note">
      No bank data loaded yet - connect or re-read the device to see its MIDI messages.
    </p>

    <template v-else-if="bank">
      <ul v-if="activeSlots.length" class="bank-list">
        <li v-for="entry in activeSlots" :key="entry.slot" class="bank-row">
          <span class="mono bank-summary">
            [{{ entry.slot + 1 }}]&nbsp;&nbsp;CH {{ entry.code.channel + 1 }}&nbsp;&nbsp;{{
              typeLabel(entry.code.type)
            }}&nbsp;&nbsp;{{ entry.code.data1 }}&nbsp;&nbsp;{{ entry.code.data2 }}
          </span>
          <span class="bank-actions">
            <button class="btn btn-small" :disabled="busy" @click="editSlot(entry.slot)">
              Edit
            </button>
            <button class="btn btn-small" :disabled="busy" @click="removeSlot(entry.slot)">
              Remove
            </button>
          </span>
        </li>
      </ul>
      <p v-else class="muted small note">No MIDI messages in this bank.</p>

      <div class="row gap bank-tools">
        <button class="btn btn-small" :disabled="busy || activeSlots.length >= 16" @click="addSlot">
          Add message
        </button>
        <button
          class="btn btn-small"
          :disabled="busy || activeSlots.length === 0"
          @click="removeAll"
        >
          Remove all
        </button>
      </div>
    </template>

    <form v-if="editing" class="bank-edit" @submit.prevent="saveEdit">
      <label class="field">
        <span>Channel</span>
        <select
          class="control"
          :value="editing.draft.channel"
          :disabled="busy"
          @change="setDraft($event, 'channel', 0x0f)"
        >
          <option v-for="c in channelNumbers" :key="c" :value="c - 1">{{ c }}</option>
        </select>
      </label>
      <label class="field">
        <span>Type</span>
        <select
          class="control"
          :value="editing.draft.type"
          :disabled="busy"
          @change="setDraft($event, 'type', 0x7f)"
        >
          <option v-for="t in MIDI_CODE_TYPES" :key="t.value" :value="t.value">
            {{ t.label }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>Data 1</span>
        <select
          class="control"
          :value="editing.draft.data1"
          :disabled="busy"
          @change="setDraft($event, 'data1', 0x7f)"
        >
          <option v-for="d in dataRange" :key="d" :value="d">{{ d }}</option>
        </select>
      </label>
      <label v-if="editing.draft.type !== 0" class="field">
        <span>Data 2</span>
        <select
          class="control"
          :value="editing.draft.data2"
          :disabled="busy"
          @change="setDraft($event, 'data2', 0x7f)"
        >
          <option v-for="d in dataRange" :key="d" :value="d">{{ d }}</option>
        </select>
      </label>
      <p v-if="editing.draft.type === 4" class="muted small note bank-edit-note">
        SysEx entries send the raw bytes stored in the switch's SysEx buffer, which is not editable
        here yet.
      </p>
      <div class="row gap bank-edit-actions">
        <button class="btn btn-small btn-primary" :disabled="busy" type="submit">Save</button>
        <button class="btn btn-small" :disabled="busy" type="button" @click="cancelEdit">
          Cancel
        </button>
      </div>
    </form>
  </section>
</template>
