import type { DuplexDevice } from './types.js';

function deviceKey(port: { name?: string | null; id: string }): string {
  return port.name?.trim() || port.id;
}

export function pairDuplexDevices(inputs: MIDIInput[], outputs: MIDIOutput[]): DuplexDevice[] {
  const outputsByKey = new Map<string, MIDIOutput>();
  for (const output of outputs) outputsByKey.set(deviceKey(output), output);

  const seen = new Set<string>();
  const devices: DuplexDevice[] = [];
  for (const input of inputs) {
    const key = deviceKey(input);
    if (seen.has(key)) continue;
    const output = outputsByKey.get(key);
    if (!output) continue;
    seen.add(key);
    devices.push({ id: key, name: key, input, output });
  }
  return devices;
}
