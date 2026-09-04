import { toHex } from './hex.js';
import type { MidiDirection } from './midi/types.js';

export interface MonitorEntry {
  direction: MidiDirection;
  timestamp: string;
  data: string;
}

export function createMonitorEntry(direction: MidiDirection, data: Uint8Array): MonitorEntry {
  return {
    direction,
    timestamp: new Date().toISOString(),
    data: toHex(data),
  };
}
