/**
 * Shared fixtures for component snapshot tests. Values are fully controlled
 * so rendered output (labels, class names, option lists, hex rows) is
 * deterministic across machines.
 */
import { defaultMidiCode, emptyConfig } from '../../lib/device';
import type { MidiDevicePair } from '../../lib/midi';
import type {
  ChocolateDevice,
  DeviceConfig,
  FootswitchBank,
  MidiCode,
  MonitorEntry,
} from '../../lib/device';

/** Build a bank from the given enabled codes, padded to the full 16 slots. */
function bank(...codes: MidiCode[]): FootswitchBank {
  const slots = Array.from({ length: 16 }, () => defaultMidiCode());
  codes.forEach((c, i) => (slots[i] = c));
  return { codes: slots };
}

/** A fully populated config: all mode sub-views and device-wide settings. */
export function fullConfig(): DeviceConfig {
  const config = emptyConfig();
  config.mode = 0x03; // Advanced Custom
  config.midiInterface = 1; // TRS-MIDI
  config.midiChannel = 4; // UI shows 5
  config.polarity = true;
  config.maxGroupCount = 8;
  config.maxBanksPcA = 4;
  config.maxBanksPcB = 16;
  config.usrPage = 0;
  config.customCc = [
    [10, 0],
    [20, 1],
    [30, 0],
    [40, 1],
    [50, 0],
  ];
  config.footswitchModes = [1, 2, 0, 4];
  // Footswitch A: bank A has two enabled messages, bank B one.
  config.footswitchBanks[0] = [
    bank(
      { enabled: true, channel: 1, type: 0, data1: 5, data2: 0 },
      { enabled: true, channel: 0, type: 2, data1: 60, data2: 100 }
    ),
    bank({ enabled: true, channel: 2, type: 1, data1: 93, data2: 0 }),
  ];
  // Footswitch D: a SysEx entry (raw-buffer note should render).
  config.footswitchBanks[3] = [
    bank({ enabled: true, channel: 0, type: 4, data1: 0, data2: 0 }),
    bank(),
  ];
  return config;
}

/** A detected (unconnected) device. */
export function device(
  overrides: Partial<ChocolateDevice> & { pair: MidiDevicePair }
): ChocolateDevice {
  return {
    status: 'detected',
    config: emptyConfig(),
    ...overrides,
  };
}

export function pair(
  name: string,
  key = name,
  manufacturer: string | null = 'SinCo'
): MidiDevicePair {
  return { key, name, manufacturer, inputId: `${key}-in`, outputId: `${key}-out` };
}

/** Fixed-identity monitor entry; pass explicit wall time for stable output. */
export function monitorEntry(
  overrides: Partial<MonitorEntry> & { bytes: Uint8Array }
): MonitorEntry {
  return {
    id: 1,
    dir: 'RX',
    device: 'Chocolate Plus',
    timestamp: 0,
    wall: 1_700_000_000_000, // 2023-11-14T22:13:20Z
    ...overrides,
  };
}
