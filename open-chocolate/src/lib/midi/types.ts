export type MidiDirection = 'IN' | 'OUT';

export type MidiEvent = {
  data: Uint8Array;
  direction: MidiDirection;
  port: MIDIInput | MIDIOutput;
};

export type MidiListener = (event: MidiEvent) => void;

export type Unsubscribe = () => void;

export interface DuplexDevice {
  id: string;
  name: string;
  input: MIDIInput;
  output: MIDIOutput;
}
