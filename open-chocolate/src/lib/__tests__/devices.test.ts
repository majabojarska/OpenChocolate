import { describe, expect, it } from 'vitest';
import { pairDuplexDevices } from '../midi/devices';

function makeInput(id: string, name: string): MIDIInput {
  return { id, name } as unknown as MIDIInput;
}

function makeOutput(id: string, name: string): MIDIOutput {
  return { id, name } as unknown as MIDIOutput;
}

describe('pairDuplexDevices', () => {
  it('returns an empty list when there are no ports', () => {
    expect(pairDuplexDevices([], [])).toEqual([]);
  });

  it('pairs inputs and outputs by name', () => {
    const input = makeInput('in-1', 'Paired');
    const output = makeOutput('out-1', 'Paired');
    const devices = pairDuplexDevices([input], [output]);
    expect(devices).toEqual([{ id: 'Paired', name: 'Paired', input, output }]);
  });

  it('drops inputs with no matching output', () => {
    const orphan = makeInput('in-1', 'Lonely');
    expect(pairDuplexDevices([orphan], [makeOutput('out-1', 'Other')])).toEqual([]);
  });

  it('drops outputs with no matching input', () => {
    expect(pairDuplexDevices([], [makeOutput('out-1', 'Lonely')])).toEqual([]);
  });

  it('falls back to the port id when the name is empty', () => {
    // Empty names cause both ports to fall back to their respective ids,
    // which differ between input and output, so they are treated as separate
    // devices. The fallback only helps when the port ids happen to match.
    const input = makeInput('shared', '');
    const output = makeOutput('shared', '');
    const devices = pairDuplexDevices([input], [output]);
    expect(devices).toEqual([{ id: 'shared', name: 'shared', input, output }]);
  });

  it('trims whitespace in the name before pairing', () => {
    const input = makeInput('in-1', '  Device  ');
    const output = makeOutput('out-1', 'Device');
    const devices = pairDuplexDevices([input], [output]);
    expect(devices).toHaveLength(1);
  });
});
