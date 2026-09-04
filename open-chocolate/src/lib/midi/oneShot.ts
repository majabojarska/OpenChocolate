import type { MidiEvent, MidiListener, Unsubscribe } from './types.js';

/**
 * Subscribes to a stream of MIDI events and resolves with the first one that
 * matches `predicate`. The subscription is established synchronously inside
 * the returned promise, so callers can immediately trigger a request and
 * rely on the listener being in place before the response arrives.
 *
 * After a match, the subscription is removed and the promise resolves. The
 * subscription's `unsubscribe` is called from a microtask to handle the
 * case where the underlying stream dispatches events synchronously.
 */
export function awaitOneShot(
  subscribe: (listener: MidiListener) => Unsubscribe,
  predicate: (event: MidiEvent) => boolean
): Promise<MidiEvent> {
  return new Promise<MidiEvent>((resolve) => {
    let unsubscribe: Unsubscribe = () => {};
    let done = false;
    const onEvent: MidiListener = (event) => {
      if (done) return;
      if (!predicate(event)) return;
      done = true;
      // Defer cleanup so synchronous dispatchers don't observe a still-empty
      // unsubscribe variable. The arrow reads `unsubscribe` at microtask time.
      queueMicrotask(() => unsubscribe());
      resolve(event);
    };
    unsubscribe = subscribe(onEvent);
  });
}

export function isSysEx(data: Uint8Array): boolean {
  return data.length > 0 && data[0] === 0xf0 && data[data.length - 1] === 0xf7;
}
