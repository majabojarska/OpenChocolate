<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import {
  CommsService,
  emptyConfig,
  type ChocolateDevice,
  type MidiCode,
  type MonitorEntry,
} from './lib/device';
import DevicePanel from './components/DevicePanel.vue';
import ConfigPanel from './components/ConfigPanel.vue';
import MonitorView from './components/MonitorView.vue';

const comms = new CommsService();

const devices = ref<ChocolateDevice[]>([]);
const connectedKey = ref<string | null>(null);
const scanned = ref(false);
const scanning = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const selectedKey = ref<string | null>(null);

// Derived from device status - no shadow copies to keep in sync.
const connectingKey = computed(
  () => devices.value.find((d) => d.status === 'connecting')?.pair.key ?? null
);

const monitorEntries = reactive<MonitorEntry[]>([]);
const monitorLimit = 500;

/** Hover hint for the Rescan button: it explains why it's disabled while connected. */
const rescanHint = computed(() =>
  connectedKey.value
    ? 'Rescan is disabled while connected to a device — disconnect first to enable it.'
    : 'Scan MIDI ports again for M-Vave Chocolate Plus devices.'
);

// The service owns all device state and hands out frozen snapshots on every
// emit, so storing them directly is always safe.
const config = ref(emptyConfig());
const hasDevice = computed(() => connectedKey.value !== null);

function refreshState() {
  devices.value = comms.getDevices();
  const connected = comms.getConnected();
  connectedKey.value = connected?.pair.key ?? null;
  config.value = connected?.config ?? emptyConfig();
}

onMounted(() => {
  // The service emits synchronously during every state change, so these
  // listeners are the only refresh path we need.
  comms.onState(() => refreshState());
  comms.onMonitor((entry) => {
    monitorEntries.push(entry);
    if (monitorEntries.length > monitorLimit) {
      monitorEntries.splice(0, monitorEntries.length - monitorLimit);
    }
  });
  refreshState();
  scan(); // scan automatically on startup
});

async function scan() {
  scanning.value = true;
  error.value = null;
  try {
    await comms.scan();
    scanned.value = true;
    // Pre-select a device whose name mentions "sinco" (case-insensitive).
    if (!selectedKey.value || !devices.value.some((d) => d.pair.key === selectedKey.value)) {
      const match = devices.value.find((d) => d.pair.name.toLowerCase().includes('sinco'));
      selectedKey.value =
        match?.pair.key ?? devices.value.find((d) => d.status === 'detected')?.pair.key ?? null;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    scanning.value = false;
  }
}

async function connect(key: string) {
  if (connectingKey.value) return; // one connect at a time
  error.value = null;
  try {
    await comms.connect(key);
    selectedKey.value = key;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

async function withBusy(fn: () => Promise<void>) {
  busy.value = true;
  error.value = null;
  try {
    await fn();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

const onModeChange = (mode: number) => withBusy(() => comms.setMode(mode));
const onInterfaceChange = (trs: boolean) => withBusy(() => comms.setMidiInterface(trs));
const onPolarityChange = (enabled: boolean) => withBusy(() => comms.setPolarity(enabled));
const onGroupCountChange = (count: number) => withBusy(() => comms.setMaxGroupCount(count));
const onMidiChannelChange = (ch0: number) => withBusy(() => comms.setMidiChannel(ch0));
const onMaxBanksChange = (which: 0 | 1, count: number) =>
  withBusy(() => comms.setMaxBanks(which, count));
const onFootswitchChange = (page: 0 | 1, index: 0 | 1 | 2 | 3, step: number) =>
  withBusy(() => comms.setFootswitchMode(page, index, step));
const onFootswitchBankChange = (payload: {
  page: 0 | 1;
  index: 0 | 1 | 2 | 3;
  bank: 0 | 1;
  slot: number | null;
  code: MidiCode | null;
}) => {
  const { page, index, bank, slot, code } = payload;
  if (code === null || slot === null) {
    withBusy(() => comms.clearFootswitchBanks(page, index, bank));
  } else {
    withBusy(() => comms.setFootswitchMidiCode(page, index, bank, slot, code));
  }
};
const onCustomCcChange = (bank: number, cc: number, latch: number) =>
  withBusy(() => comms.setCustomCc(bank, cc, latch));

function exportConfig() {
  const snapshot = comms.exportState();
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `open-chocolate-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importConfig(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const snapshot = JSON.parse(String(reader.result));
      comms.importState(snapshot);
      error.value = null;
    } catch (err) {
      error.value = `Import failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  };
  reader.readAsText(file);
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">🍫</span>
        <div>
          <h1>Open Chocolate</h1>
          <p>M-Vave Chocolate Plus configuration tool</p>
        </div>
      </div>
      <div class="topbar-actions">
        <!-- A disabled button swallows hover, so the hint lives on a wrapper span
             that stays interactive while the button itself is disabled. -->
        <span class="rescan-tip" :class="{ disabled: scanning || hasDevice }" :title="rescanHint">
          <button class="btn" :disabled="scanning || hasDevice" @click="scan">
            {{ scanning ? 'Scanning…' : 'Rescan' }}
          </button>
        </span>
      </div>
    </header>

    <p v-if="error" class="error-banner">{{ error }}</p>

    <main class="layout">
      <DevicePanel
        :devices="devices"
        :scanned="scanned"
        :scanning="scanning"
        :selected-key="selectedKey"
        :connected-key="connectedKey"
        :connecting-key="connectingKey"
        @select="selectedKey = $event"
        @connect="connect($event)"
        @disconnect="comms.disconnect()"
      />

      <ConfigPanel
        :config="config"
        :has-device="hasDevice"
        :busy="busy"
        @mode="onModeChange"
        @interface="onInterfaceChange"
        @polarity="onPolarityChange"
        @group-count="onGroupCountChange"
        @midi-channel="onMidiChannelChange"
        @max-banks="({ which, count }) => onMaxBanksChange(which, count)"
        @footswitch="({ page, index, step }) => onFootswitchChange(page, index, step)"
        @footswitch-bank="onFootswitchBankChange"
        @custom-cc="({ bank, cc, latch }) => onCustomCcChange(bank, cc, latch)"
        @reread="withBusy(() => comms.reread())"
        @export="exportConfig"
        @import="importConfig"
        @apply-all="withBusy(() => comms.applyAll())"
      />

      <MonitorView :entries="monitorEntries" @clear="monitorEntries.splice(0)" />

      <section class="card tips-card">
        <div class="card-head">
          <h2>Tips</h2>
        </div>
        <ul class="tips-list">
          <li>Enable/disable BLE: hold and press B+C.</li>
          <li>Factory reset: press and hold A+D until "000" is blinking.</li>
        </ul>
      </section>
    </main>
  </div>
</template>
