import type { DuplexDevice } from './types.js';

// Device names we want to auto-pick. Order matters: earlier wins.
// Over BLE the device presents as "FootCtrlPlus", over USB as "Sinco".
// Configuration is only supported over USB, so we prefer "sinco" first.
const KNOWN_DEVICE_NAMES = ['sinco', 'footctrlplus'];

export function findAutoSelectDevice(devices: DuplexDevice[]): DuplexDevice | undefined {
  for (const ref of KNOWN_DEVICE_NAMES) {
    const found = devices.find((device) => device.name.toLowerCase().includes(ref));
    if (found) return found;
  }
  return undefined;
}
