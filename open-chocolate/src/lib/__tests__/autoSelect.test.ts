import { describe, expect, it } from 'vitest';
import { findAutoSelectDevice } from '../midi/autoSelect';
import type { DuplexDevice } from '../midi/types';

function makeDevice(name: string): DuplexDevice {
  return {
    id: name,
    name,
    input: {} as MIDIInput,
    output: {} as MIDIOutput,
  };
}

describe('findAutoSelectDevice', () => {
  it('returns undefined when there are no devices', () => {
    expect(findAutoSelectDevice([])).toBeUndefined();
  });

  it('returns undefined when no known name is present', () => {
    expect(findAutoSelectDevice([makeDevice('Stranger')])).toBeUndefined();
  });

  it('prefers the USB name (sinco) over the BLE name (footctrlplus)', () => {
    const ble = makeDevice('FootCtrlPlus BLE');
    const usb = makeDevice('Sinco USB MIDI');
    expect(findAutoSelectDevice([ble, usb])).toBe(usb);
  });

  it('falls back to FootCtrlPlus when Sinco is absent', () => {
    const ble = makeDevice('FootCtrlPlus BLE');
    expect(findAutoSelectDevice([ble])).toBe(ble);
  });

  it('matches case-insensitively', () => {
    const upper = makeDevice('SINCO MIDI');
    expect(findAutoSelectDevice([upper])).toBe(upper);
  });
});
