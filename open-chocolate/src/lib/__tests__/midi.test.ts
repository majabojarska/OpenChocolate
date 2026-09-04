import { describe, expect, it } from 'vitest';
import { groupPorts, normalizePortName, type MidiPortInfo } from '../midi';

const port = (
  id: string,
  name: string,
  type: 'input' | 'output',
  manufacturer?: string
): MidiPortInfo => ({
  id,
  name,
  manufacturer: manufacturer ?? null,
  type,
});

describe('normalizePortName', () => {
  it('strips midi/usb words, direction words and trailing port numbers', () => {
    expect(normalizePortName('Chocolate Plus MIDI 1')).toBe('chocolate plus');
    expect(normalizePortName('Chocolate Plus In')).toBe('chocolate plus');
    expect(normalizePortName('USB MIDI Device Out 2')).toBe('device');
    expect(normalizePortName('Chocolate Plus')).toBe('chocolate plus');
  });
});

describe('groupPorts', () => {
  it('pairs input+output with identical names', () => {
    const pairs = groupPorts([
      port('in1', 'Chocolate Plus', 'input', 'SinCo'),
      port('out1', 'Chocolate Plus', 'output', 'SinCo'),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ name: 'Chocolate Plus', inputId: 'in1', outputId: 'out1' });
  });

  it('pairs input+output with suffixed names via normalised matching', () => {
    const pairs = groupPorts([
      port('in1', 'Chocolate Plus MIDI In', 'input', 'SinCo'),
      port('out1', 'Chocolate Plus MIDI Out', 'output', 'SinCo'),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ inputId: 'in1', outputId: 'out1' });
  });

  it('keeps different devices separate', () => {
    const pairs = groupPorts([
      port('in1', 'Chocolate Plus', 'input', 'SinCo'),
      port('out1', 'Chocolate Plus', 'output', 'SinCo'),
      port('in2', 'Keystation 88', 'input', 'M-Audio'),
      port('out2', 'Keystation 88', 'output', 'M-Audio'),
    ]);
    expect(pairs).toHaveLength(2);
  });

  it('keeps a lone input visible as its own entry', () => {
    const pairs = groupPorts([port('in1', 'Some Keyboard', 'input', 'Yamaha')]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ inputId: 'in1', outputId: null });
  });

  it('does not merge two complete different devices with same name', () => {
    const pairs = groupPorts([
      port('in1', 'Chocolate Plus', 'input', 'SinCo'),
      port('out1', 'Chocolate Plus', 'output', 'SinCo'),
      port('in2', 'Chocolate Plus MIDI In', 'input', 'SinCo'),
      port('out2', 'Chocolate Plus MIDI Out', 'output', 'SinCo'),
    ]);
    // First pair is complete (exact match), the suffixed pair is complete too
    // after normalised merge - no cross-stealing between complete pairs.
    expect(pairs).toHaveLength(2);
  });

  it('handles multiple input ports of one device', () => {
    const pairs = groupPorts([
      port('in1', 'Chocolate Plus MIDI 1', 'input', 'SinCo'),
      port('in2', 'Chocolate Plus MIDI 2', 'input', 'SinCo'),
      port('out1', 'Chocolate Plus MIDI 1', 'output', 'SinCo'),
    ]);
    // "MIDI 1" in+out pair exactly; "MIDI 2" stays an input-only orphan
    // (normalised name matches but the mate already has both sides).
    expect(pairs).toHaveLength(2);
    const paired = pairs.find((p) => p.inputId === 'in1');
    expect(paired?.outputId).toBe('out1');
  });
});
