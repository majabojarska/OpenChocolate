/**
 * Per-mode UI metadata, based on the official "PD41 Software Instructions"
 * manual (reverse-engineering/../PD41-Software-Instructions.pdf).
 *
 * Virtual buttons: E = footswitches A+B pressed together, F = C+D pressed
 * together. The manual's "Mode 4/5 - Advanced Custom Mode 1/2" are the two
 * pages (usrpage 0/1) of device mode 3. The manual does not document the
 * Mix Key (0x0B) and Speaker (0x0C) modes, but the firmware accepts them.
 */

export type ModeView = 'pc' | 'custom' | 'advanced' | 'customKeyboard' | 'mixKey' | 'none';

/** Operating mode identifiers (address 0 in the config blob). */
export const MODES = [
  { value: 0x00, label: 'MIDI Program Change (PC)' },
  { value: 0x01, label: 'MIDI Control Change (CC)' },
  { value: 0x02, label: 'Custom (WIP)' },
  { value: 0x03, label: 'Advanced Custom (WIP)' },
  { value: 0x04, label: 'Manufacturer Control (WIP)' },
  { value: 0x05, label: 'Touch Screen (Android) (WIP)' },
  { value: 0x06, label: 'Video Control' },
  { value: 0x07, label: 'Keyboard A' },
  { value: 0x08, label: 'Keyboard B' },
  { value: 0x09, label: 'Music Player Control' },
  { value: 0x0a, label: 'Custom Keyboard (WIP)' },
  { value: 0x0b, label: 'Mix Key (WIP)' },
  { value: 0x0c, label: 'Speaker (WIP)' },
] as const;

/** Per-footswitch step behaviours (the five Advanced Custom sub-modes). */
export const FOOTSWITCH_STEPS = [
  { value: 0x00, label: 'Single tap (single group of information)' },
  { value: 0x01, label: 'Single tap (two groups switching)' },
  { value: 0x02, label: 'Press-release (two groups switching)' },
  { value: 0x03, label: 'Long press' },
  { value: 0x04, label: 'Short tap - long press' },
] as const;

/** Footswitch names in protocol order. */
export const FOOTSWITCH_NAMES = ['A', 'B', 'C', 'D'] as const;

export interface ModeMeta {
  /** Which configuration sub-view to render for this mode. */
  view: ModeView;
  /** What the mode does, from the official manual. */
  info: string;
  /** Fixed per-footswitch actions (A-D) predefined by the firmware. */
  actions?: [string, string, string, string];
  /** Group/bank switching behaviour. */
  groups?: string;
}

export const MODE_META: Record<number, ModeMeta> = {
  0x00: {
    view: 'pc',
    info: 'Footswitches send Program Change codes 0-127; the display shows the current PC code.',
    groups: 'Groups are switched with the virtual buttons E (A+B) and F (C+D).',
  },
  0x01: {
    view: 'pc',
    info: 'Footswitches send CC codes CC(0,0) to CC(127,0); the display shows the current CC code.',
    groups: 'Groups are switched with the virtual buttons E (A+B) and F (C+D).',
  },
  0x02: {
    view: 'custom',
    info: 'Each footswitch sends its own CC number. Toggling sends CC(n,1) on press and CC(n,0) on release.',
  },
  0x03: {
    view: 'advanced',
    info: 'Per-footswitch programmable MIDI codes (PC, CC, Note On/Off, SysEx). Variant 1 offers five sub-modes; variant 2 offers short tap + long press with up to 16 switchable groups.',
    groups:
      'Variant 2 groups are switched with the virtual buttons E (A+B) and F (C+D); variant 1 cannot switch groups.',
  },
  0x04: {
    view: 'none',
    info: 'Internal mode for controlling M-VAVE brand products such as TANK-G, LOOPER PRO and LOST TEMPO.',
  },
  0x05: {
    view: 'none',
    info: 'The footswitches control the touchscreen of a connected Android device:',
    actions: ['Swipe up', 'Swipe down', 'Swipe left', 'Swipe right'],
  },
  0x06: {
    view: 'none',
    info: 'The footswitches control video playback (e.g. YouTube):',
    actions: ['Rewind', 'Fast forward', 'Pause/Play', 'Loop'],
  },
  0x07: {
    view: 'none',
    info: 'The footswitches act as keyboard arrow keys:',
    actions: ['Up', 'Down', 'Left', 'Right'],
  },
  0x08: {
    view: 'none',
    info: 'The footswitches act as keyboard keys:',
    actions: ['Page Up', 'Page Down', 'Space', 'Enter'],
  },
  0x09: {
    view: 'none',
    info: 'The footswitches act as multimedia keys:',
    actions: ['Previous track', 'Next track', 'Volume down', 'Volume up'],
  },
  0x0a: {
    view: 'customKeyboard',
    info: 'Each footswitch sends a single key or a key combination (Ctrl/Shift/Alt/Win + key). 18 groups are switched with the virtual buttons E (A+B) and F (C+D).',
  },
  0x0b: {
    view: 'mixKey',
    info: 'Each footswitch has three selectable functions: Custom MIDI, Custom Keyboard and Tuner. E and F switch groups.',
  },
  0x0c: {
    view: 'none',
    info: 'Controls M-VAVE speaker products. Not covered by the official manual - the footswitch actions are fixed by the device.',
  },
};
