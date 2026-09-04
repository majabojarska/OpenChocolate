<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { CommsService, emptyConfig, type ChocolateDevice, type MonitorEntry } from './lib/device';
import DevicePanel from './components/DevicePanel.vue';
import ConfigPanel from './components/ConfigPanel.vue';
import MonitorView from './components/MonitorView.vue';

const comms = new CommsService();

const devices = ref<ChocolateDevice[]>([]);
const connectedKey = ref<string | null>(null);
const scanned = ref(false);
const scanning = ref(false);
const connecting = ref(false);
const connectingKey = ref<string | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);
const selectedKey = ref<string | null>(null);

const monitorEntries = reactive<MonitorEntry[]>([]);
const monitorLimit = 500;

// Local editable copy of the connected device config.
const config = ref(emptyConfig());
const hasDevice = computed(() => connectedKey.value !== null);

// Signature guards: only replace reactive state when the underlying data
// actually changed. Replacing refs on every event (or on a poller) re-renders
// the panels constantly, which glitches native select dropdowns mid-use.
let lastDevicesSig = '';
let lastConfigSig = '';

function refreshState() {
  const list = comms.getDevices();
  const connected = comms.getConnected();

  const devicesSig = JSON.stringify([
    connected?.pair.key ?? null,
    list.map((d) => [d.pair.key, d.status]),
  ]);
  if (devicesSig !== lastDevicesSig) {
    lastDevicesSig = devicesSig;
    devices.value = list;
    connectedKey.value = connected?.pair.key ?? null;
  }

  const cfg = connected?.config ?? null;
  const cfgSig = JSON.stringify(cfg);
  if (cfgSig !== lastConfigSig) {
    lastConfigSig = cfgSig;
    config.value = cfg ? JSON.parse(JSON.stringify(cfg)) : emptyConfig();
  }
}

onMounted(() => {
  comms.onState(() => refreshState());
  comms.onMonitor((entry) => {
    monitorEntries.push(entry);
    if (monitorEntries.length > monitorLimit) {
      monitorEntries.splice(0, monitorEntries.length - monitorLimit);
    }
  });
  refreshState();
});

async function scan() {
  scanning.value = true;
  error.value = null;
  try {
    await comms.scan();
    scanned.value = true;
    refreshState();
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
  if (connecting.value) return; // one connect at a time
  const device = devices.value.find((d) => d.pair.key === key);
  if (!device) return;
  connecting.value = true;
  connectingKey.value = key;
  error.value = null;
  try {
    await comms.connect(device);
    selectedKey.value = key;
    refreshState();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    connecting.value = false;
    connectingKey.value = null;
  }
}

function disconnect() {
  comms.disconnect();
  refreshState();
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
const onUsrPageChange = (page: 0 | 1) => withBusy(() => comms.setUsrPage(page));
const onFootswitchChange = (page: 0 | 1, index: 0 | 1 | 2 | 3, step: number) =>
  withBusy(() => comms.setFootswitchMode(page, index, step));
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
      refreshState();
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
          <p>M-Vave Chocolate Plus configuration</p>
        </div>
      </div>
      <div class="topbar-actions">
        <button class="btn" :disabled="scanning" @click="scan">
          {{ scanning ? 'Scanning…' : scanned ? 'Rescan devices' : 'Scan for devices' }}
        </button>
      </div>
    </header>

    <p v-if="comms.midi.error || error" class="error-banner">
      {{ comms.midi.error ?? error }}
    </p>

    <main class="layout">
      <DevicePanel
        :devices="devices"
        :scanned="scanned"
        :selected-key="selectedKey"
        :connected-key="connectedKey"
        :connecting-key="connectingKey"
        @select="selectedKey = $event"
        @connect="connect($event)"
        @disconnect="disconnect"
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
        @usr-page="onUsrPageChange"
        @footswitch="({ page, index, step }) => onFootswitchChange(page, index, step)"
        @custom-cc="({ bank, cc, latch }) => onCustomCcChange(bank, cc, latch)"
        @reread="withBusy(() => comms.reread())"
        @export="exportConfig"
        @import="importConfig"
        @apply-all="withBusy(() => comms.applyAll())"
      />

      <MonitorView :entries="monitorEntries" @clear="monitorEntries.splice(0)" />
    </main>
  </div>
</template>
