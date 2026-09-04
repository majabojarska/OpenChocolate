import { describe, expect, it, vi } from 'vitest';
import { awaitOneShot, isSysEx } from '../midi/oneShot';
import type { MidiEvent } from '../midi/types';

function makeEvent(data: Uint8Array): MidiEvent {
  return { data, direction: 'IN', port: {} as MIDIInput };
}

describe('awaitOneShot', () => {
  it('resolves with the first matching event', async () => {
    const events: MidiEvent[] = [
      makeEvent(new Uint8Array([0x90])),
      makeEvent(new Uint8Array([0xf0, 0x01, 0xf7])),
    ];
    const subscribe = (listener: (event: MidiEvent) => void) => {
      queueMicrotask(() => {
        for (const event of events) listener(event);
      });
      return () => {};
    };
    const result = await awaitOneShot(subscribe, isSysExPredicate);
    expect(Array.from(result.data)).toEqual([0xf0, 0x01, 0xf7]);
  });

  it('unsubscribes after the first match', async () => {
    const unsubscribe = vi.fn();
    const subscribe = (listener: (event: MidiEvent) => void) => {
      listener(makeEvent(new Uint8Array([0xf0, 0x01, 0xf7])));
      listener(makeEvent(new Uint8Array([0xf0, 0x02, 0xf7])));
      return unsubscribe;
    };
    await awaitOneShot(subscribe, isSysExPredicate);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

function isSysExPredicate(event: MidiEvent): boolean {
  return isSysEx(event.data);
}
