// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import App from '../../App.vue';
import { emptyConfig } from '../../lib/device';
import type { ChocolateDevice, DeviceConfig, MidiCode } from '../../lib/device';
import { fullConfig } from './fixtures';

/**
 * Controllable stand-in for CommsService. App.vue builds its own instance
 * internally (`new CommsService()`), so the fake reads/writes shared, per-test
 * state that mirrors what a real scan/connect would have produced.
 */
const state = vi.hoisted(() => ({
  devices: [] as ChocolateDevice[],
  connected: null as ChocolateDevice | null,
  scanError: null as string | null,
}));

vi.mock('../../lib/device', async (importOriginal) => {
  // Only the runtime exports the component tree actually uses; everything
  // else is type-only and erased at runtime.
  const actual = (await importOriginal()) as {
    emptyConfig: () => DeviceConfig;
    defaultMidiCode: () => MidiCode;
  };

  class FakeComms {
    readonly midi = {} as never;
    private stateListeners: (() => void)[] = [];

    onState(cb: () => void): void {
      this.stateListeners.push(cb);
    }
    onMonitor(_cb: (entry: never) => void): void {}
    getDevices(): ChocolateDevice[] {
      return state.devices;
    }
    getConnected(): ChocolateDevice | null {
      return state.connected;
    }
    async scan(): Promise<void> {
      if (state.scanError) throw new Error(state.scanError);
      for (const cb of this.stateListeners) cb();
    }
    async connect(key: string): Promise<void> {
      const d = state.devices.find((d) => d.pair.key === key);
      if (!d) throw new Error(`Unknown device: ${key}`);
      d.status = 'connecting';
      this.emit();
      await Promise.resolve();
      d.status = 'connected';
      state.connected = d;
      this.emit();
    }
    disconnect(): void {
      if (state.connected) state.connected.status = 'detected';
      state.connected = null;
      this.emit();
    }
    private emit(): void {
      for (const cb of this.stateListeners) cb();
    }
    // Methods App.vue may reach via UI events - not exercised in these
    // snapshots, but must exist to satisfy the interface.
    async reread(): Promise<void> {}
    async applyAll(): Promise<void> {}
    async setMode(_m: number): Promise<void> {}
    async setMidiInterface(_v: boolean): Promise<void> {}
    async setPolarity(_v: boolean): Promise<void> {}
    async setMaxGroupCount(_n: number): Promise<void> {}
    async setMidiChannel(_c: number): Promise<void> {}
    async setMaxBanks(_w: 0 | 1, _n: number): Promise<void> {}
    async setUsrPage(_p: 0 | 1): Promise<void> {}
    async setFootswitchMode(_p: 0 | 1, _i: number, _s: number): Promise<void> {}
    async setFootswitchMidiCode(_p: unknown): Promise<void> {}
    async clearFootswitchBanks(_p: unknown): Promise<void> {}
    async setCustomCc(_p: unknown): Promise<void> {}
    exportState(): unknown {
      return {};
    }
    importState(_s: unknown): void {}
  }

  return { ...actual, CommsService: FakeComms };
});

/** A single detected device payload. */
function detectedDevice(): ChocolateDevice {
  return {
    pair: {
      key: 'cp',
      name: 'Chocolate Plus',
      manufacturer: 'SinCo',
      inputId: 'cp-in',
      outputId: 'cp-out',
    },
    status: 'detected',
    config: emptyConfig(),
  };
}

/** A connected device carrying the fully populated configuration. */
function connectedDevice(): ChocolateDevice {
  return {
    pair: {
      key: 'cp',
      name: 'Chocolate Plus',
      manufacturer: 'SinCo',
      inputId: 'cp-in',
      outputId: 'cp-out',
    },
    status: 'connected',
    config: fullConfig(),
  };
}

beforeEach(() => {
  state.devices = [];
  state.connected = null;
  state.scanError = null;
});

describe('App snapshot', () => {
  it('renders the shell with no devices after scan', async () => {
    const wrapper = mount(App);
    await flushPromises();
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('renders a detected device (auto-selected) with a Connect button', async () => {
    state.devices = [detectedDevice()];
    const wrapper = mount(App);
    await flushPromises();
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('renders a connected device with a full configuration', async () => {
    state.devices = [connectedDevice()];
    state.connected = connectedDevice();
    const wrapper = mount(App);
    await flushPromises();
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('renders the error banner when the scan fails', async () => {
    state.scanError = 'Web MIDI API not available.';
    const wrapper = mount(App);
    await flushPromises();
    expect(wrapper.html()).toMatchSnapshot();
  });
});
