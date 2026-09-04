import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockPort = {
  id: string;
  name: string;
  send?: ReturnType<typeof vi.fn>;
  onmidimessage: ((event: { data: Uint8Array | null }) => void) | null;
};

type MockAccess = {
  inputs: Map<string, MockPort>;
  outputs: Map<string, MockPort>;
  onstatechange: (() => void) | null;
  sysex: boolean;
};

function makePort(id: string, name: string): MockPort {
  return {
    id,
    name,
    send: vi.fn(),
    onmidimessage: null,
  };
}

function makeAccess(): MockAccess {
  return {
    inputs: new Map(),
    outputs: new Map(),
    onstatechange: null,
    sysex: true,
  };
}

function installNavigatorMock(request: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('navigator', { requestMIDIAccess: request });
}

async function loadUseMidi() {
  vi.resetModules();
  const mod = await import('../midi');
  return mod.useMidi;
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useMidi', () => {
  it('starts with an empty duplex device list and no error', async () => {
    const useMidi = await loadUseMidi();
    const midi = useMidi();
    expect(midi.duplexDevices.value).toEqual([]);
    expect(midi.error.value).toBe('');
  });

  it('requests MIDI access and exposes paired duplex devices', async () => {
    const access = makeAccess();
    const input = makePort('in-1', 'M-Vave Chocolate Plus');
    const output = makePort('out-1', 'M-Vave Chocolate Plus');
    access.inputs.set(input.id, input);
    access.outputs.set(output.id, output);
    const request = vi.fn().mockResolvedValue(access);
    installNavigatorMock(request);

    const useMidi = await loadUseMidi();
    const midi = useMidi();
    const granted = await midi.requestAccess();

    expect(request).toHaveBeenCalledWith({ sysex: true });
    expect(granted).toBe(access);
    expect(midi.duplexDevices.value).toHaveLength(1);
    expect(midi.duplexDevices.value[0]).toMatchObject({
      id: 'M-Vave Chocolate Plus',
      name: 'M-Vave Chocolate Plus',
      input,
      output,
    });
  });

  it('pairs inputs and outputs by name and ignores orphans', async () => {
    const access = makeAccess();
    const pairedInput = makePort('in-1', 'Paired');
    const pairedOutput = makePort('out-1', 'Paired');
    const orphanInput = makePort('in-2', 'No Output');
    const orphanOutput = makePort('out-2', 'No Input');
    access.inputs.set(pairedInput.id, pairedInput);
    access.inputs.set(orphanInput.id, orphanInput);
    access.outputs.set(pairedOutput.id, pairedOutput);
    access.outputs.set(orphanOutput.id, orphanOutput);
    installNavigatorMock(vi.fn().mockResolvedValue(access));

    const useMidi = await loadUseMidi();
    const midi = useMidi();
    await midi.requestAccess();

    expect(midi.duplexDevices.value).toEqual([
      expect.objectContaining({ id: 'Paired', input: pairedInput, output: pairedOutput }),
    ]);
  });

  it('reuses the existing access object on subsequent calls', async () => {
    const access = makeAccess();
    const request = vi.fn().mockResolvedValue(access);
    installNavigatorMock(request);

    const useMidi = await loadUseMidi();
    const midi = useMidi();
    await midi.requestAccess();
    await midi.requestAccess();

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('surfaces the failure reason via the shared error ref', async () => {
    const request = vi.fn().mockRejectedValue(new Error('blocked by policy'));
    installNavigatorMock(request);

    const useMidi = await loadUseMidi();
    const midi = useMidi();
    await expect(midi.requestAccess()).rejects.toThrow('blocked by policy');
    expect(midi.error.value).toBe('blocked by policy');
  });

  it('reports a friendly error when Web MIDI is unavailable', async () => {
    vi.stubGlobal('navigator', {});

    const useMidi = await loadUseMidi();
    const midi = useMidi();
    await expect(midi.requestAccess()).rejects.toThrow(/Web MIDI/);
    expect(midi.error.value).toMatch(/Web MIDI/);
  });

  it('rebuilds the device list when refreshDevices is called', async () => {
    const access = makeAccess();
    const first = makePort('in-1', 'First');
    const firstOut = makePort('out-1', 'First');
    access.inputs.set(first.id, first);
    access.outputs.set(firstOut.id, firstOut);
    const request = vi.fn().mockResolvedValue(access);
    installNavigatorMock(request);

    const useMidi = await loadUseMidi();
    const midi = useMidi();
    await midi.requestAccess();
    expect(midi.duplexDevices.value).toHaveLength(1);

    const second = makePort('in-2', 'Second');
    const secondOut = makePort('out-2', 'Second');
    access.inputs.set(second.id, second);
    access.outputs.set(secondOut.id, secondOut);
    midi.refreshDevices();
    expect(midi.duplexDevices.value).toHaveLength(2);
  });

  it('sends on the chosen output and notifies subscribers', async () => {
    const access = makeAccess();
    const input = makePort('in-1', 'Device');
    const output = makePort('out-1', 'Device');
    access.inputs.set(input.id, input);
    access.outputs.set(output.id, output);
    installNavigatorMock(vi.fn().mockResolvedValue(access));

    const useMidi = await loadUseMidi();
    const midi = useMidi();
    await midi.requestAccess();

    const events: { data: Uint8Array; direction: string }[] = [];
    midi.subscribe((data, direction) => events.push({ data, direction }));

    const message = new Uint8Array([0x90, 0x40, 0x7f]);
    midi.send('out-1', message);

    expect(output.send).toHaveBeenCalledWith(message);
    expect(events).toEqual([{ data: message, direction: 'OUT' }]);
  });

  it('rejects send when the output is unknown', async () => {
    const access = makeAccess();
    const output = makePort('out-1', 'Device');
    access.outputs.set(output.id, output);
    installNavigatorMock(vi.fn().mockResolvedValue(access));

    const useMidi = await loadUseMidi();
    const midi = useMidi();
    await midi.requestAccess();

    expect(() => midi.send('missing', new Uint8Array([1]))).toThrow(/No MIDI output/);
  });

  it('routes incoming input messages to subscribers', async () => {
    const access = makeAccess();
    const input = makePort('in-1', 'Device');
    const output = makePort('out-1', 'Device');
    access.inputs.set(input.id, input);
    access.outputs.set(output.id, output);
    installNavigatorMock(vi.fn().mockResolvedValue(access));

    const useMidi = await loadUseMidi();
    const midi = useMidi();
    await midi.requestAccess();
    midi.selectDevice('Device');

    const received: { data: Uint8Array; direction: string }[] = [];
    const unsubscribe = midi.subscribe((data, direction) => received.push({ data, direction }));
    const bytes = new Uint8Array([0xf0, 0x01, 0xf7]);
    input.onmidimessage?.({ data: bytes });

    expect(received).toEqual([{ data: bytes, direction: 'IN' }]);

    unsubscribe();
    input.onmidimessage?.({ data: new Uint8Array([0x90]) });
    expect(received).toHaveLength(1);
  });

  it('ignores incoming messages until a device is selected', async () => {
    const access = makeAccess();
    const input = makePort('in-1', 'Device');
    const output = makePort('out-1', 'Device');
    access.inputs.set(input.id, input);
    access.outputs.set(output.id, output);
    installNavigatorMock(vi.fn().mockResolvedValue(access));

    const useMidi = await loadUseMidi();
    const midi = useMidi();
    await midi.requestAccess();

    const received: { data: Uint8Array; direction: string }[] = [];
    midi.subscribe((data, direction) => received.push({ data, direction }));
    input.onmidimessage?.({ data: new Uint8Array([0x90, 0x40, 0x7f]) });

    expect(received).toEqual([]);
    expect(midi.selectedDeviceId.value).toBe('');
  });

  it('ignores incoming messages from inputs that are not the selected device', async () => {
    const access = makeAccess();
    const selectedInput = makePort('in-1', 'Selected');
    const selectedOutput = makePort('out-1', 'Selected');
    const otherInput = makePort('in-2', 'Other');
    const otherOutput = makePort('out-2', 'Other');
    access.inputs.set(selectedInput.id, selectedInput);
    access.inputs.set(otherInput.id, otherInput);
    access.outputs.set(selectedOutput.id, selectedOutput);
    access.outputs.set(otherOutput.id, otherOutput);
    installNavigatorMock(vi.fn().mockResolvedValue(access));

    const useMidi = await loadUseMidi();
    const midi = useMidi();
    await midi.requestAccess();
    midi.selectDevice('Selected');

    const received: { data: Uint8Array; direction: string }[] = [];
    midi.subscribe((data, direction) => received.push({ data, direction }));

    const stray = new Uint8Array([0x90, 0x40, 0x7f]);
    otherInput.onmidimessage?.({ data: stray });
    expect(received).toEqual([]);

    const chosen = new Uint8Array([0x90, 0x41, 0x7f]);
    selectedInput.onmidimessage?.({ data: chosen });
    expect(received).toEqual([{ data: chosen, direction: 'IN' }]);
  });

  it('starts a fresh subscription for the selected input after selectDevice', async () => {
    const access = makeAccess();
    const input = makePort('in-1', 'Device');
    const output = makePort('out-1', 'Device');
    access.inputs.set(input.id, input);
    access.outputs.set(output.id, output);
    installNavigatorMock(vi.fn().mockResolvedValue(access));

    const useMidi = await loadUseMidi();
    const midi = useMidi();
    await midi.requestAccess();

    const received: { data: Uint8Array; direction: string }[] = [];
    midi.subscribe((data, direction) => received.push({ data, direction }));
    midi.selectDevice('Device');

    const bytes = new Uint8Array([0xf0, 0x01, 0xf7]);
    input.onmidimessage?.({ data: bytes });

    expect(received).toEqual([{ data: bytes, direction: 'IN' }]);
    expect(midi.selectedDeviceId.value).toBe('Device');
  });

  it('rejects selectDevice when the device is unknown', async () => {
    const access = makeAccess();
    installNavigatorMock(vi.fn().mockResolvedValue(access));

    const useMidi = await loadUseMidi();
    const midi = useMidi();
    await midi.requestAccess();

    expect(() => midi.selectDevice('missing')).toThrow(/MIDI device/);
  });

  it('returns the request and matching sysex response from discover', async () => {
    const access = makeAccess();
    const input = makePort('in-1', 'Device');
    const output = makePort('out-1', 'Device');
    access.inputs.set(input.id, input);
    access.outputs.set(output.id, output);
    installNavigatorMock(vi.fn().mockResolvedValue(access));

    const useMidi = await loadUseMidi();
    const midi = useMidi();
    await midi.requestAccess();

    const response = new Uint8Array([0xf0, 0x02, 0x32, 0xf7]);
    const pending = midi.discover('Device');

    setTimeout(() => {
      input.onmidimessage?.({ data: response });
    }, 0);

    const result = await pending;
    expect(result.request).toEqual(
      new Uint8Array([0xf0, 0, 0x32, 0x45, 0, 0, 0, 0x40, 0x7f, 0xf7])
    );
    expect(result.response).toEqual(response);
    expect(output.send).toHaveBeenCalledWith(result.request);
  });

  it('rejects discover when the selected device is unknown', async () => {
    const access = makeAccess();
    installNavigatorMock(vi.fn().mockResolvedValue(access));

    const useMidi = await loadUseMidi();
    const midi = useMidi();
    await midi.requestAccess();

    await expect(midi.discover('missing')).rejects.toThrow(/MIDI device/);
  });

  it('rejects discover when the selected device has no matching output', async () => {
    const access = makeAccess();
    const orphanInput = makePort('in-1', 'Lonely');
    access.inputs.set(orphanInput.id, orphanInput);
    installNavigatorMock(vi.fn().mockResolvedValue(access));

    const useMidi = await loadUseMidi();
    const midi = useMidi();
    await midi.requestAccess();

    await expect(midi.discover('Lonely')).rejects.toThrow(/MIDI device/);
  });
});
