# open-chocolate

FOSS, web-based, cross-platform configuration tool for the
[M-Vave Chocolate Plus](https://www.sincoth.com/) MIDI footswitch
(aka FC2 / FootCtrl Plus).

Talks to the device over the Web MIDI API using the reverse-engineered
SysEx protocol - no drivers, no install. See
[`../reverse-engineering/MIDI-protocol-spec.md`](../reverse-engineering/MIDI-protocol-spec.md)
and [`../reverse-engineering/protocol-addendum.md`](../reverse-engineering/protocol-addendum.md)
for protocol details.

## Features

- **Device discovery** - scans all MIDI ports with a SysEx discovery request
  and lists only devices that answer correctly; devices with `sinco` in
  their name are pre-selected. Dots: yellow = detected (answered discovery,
  pulsing while connecting), green = connected, red = failed.
- **Configuration read-back** - on connect, replays the official app's
  init sequence (discovery + 24 configuration reads) and decodes the
  current settings. A _Re-read_ button refreshes at any time.
- **Mode-specific configuration views** (per the official manual):
  - Program Change A/B: max banks (1-32)
  - Custom: per-footswitch CC number + momentary/latching
  - Advanced Custom: variant (Mode 1 / Mode 2) and per-footswitch step mode
    (single tap, press-release, long press, ...)
  - Touch Screen / Video / Keyboard A+B / Multimedia: shows the fixed
    per-footswitch actions predefined by the firmware
  - device-wide: MIDI channel, TRS jack function (radio: expression pedal /
    TRS-MIDI), polarity reversal, max groups
- **MIDI monitor** - timestamped log of all traffic, RX (green) and TX
  (blue), with byte-aligned hex columns, grouped per device; every message
  is also mirrored to the browser console, labeled by device.
- **Import/export** - full configuration snapshots as JSON, including the
  raw read-back pages. Import loads a snapshot into the app; _Apply all_
  pushes it to the device.

## Running

```sh
npm install
npm run dev
```

Then open the printed URL in a browser with Web MIDI support - **Chrome,
Edge, Opera** or **Firefox 108+** (HTTPS or `localhost` is mandatory). Grant
the MIDI / SysEx permission when prompted.

Production build:

```sh
npm run build
npm run preview
```

## Structure

```
src/
  lib/
    sysex.ts      protocol codec: message builders, parsers, checksums
    midi.ts       Web MIDI wrapper (ports, grouping, send/receive)
    device.ts     comms service: discovery, connect, config, import/export
    snapshot.ts   config snapshot serialization (validated JSON import)
    modes.ts      per-mode UI metadata
  components/
    DevicePanel.vue   device list, dots, connect/disconnect
    ConfigPanel.vue   configuration editors, import/export
    MonitorView.vue   MIDI monitor
  App.vue       wiring + top bar
```

All MIDI/SysEx handling lives in `src/lib`; UI components only call the
comms service. The service is the single owner of device state: it emits
frozen snapshots to the UI and commands are addressed by device key, so
stale responses can never leak across connect/disconnect sessions.

## Status / limitations

- Footswitch **D** step-mode address is inferred from the struct layout
  (no USB capture of that write exists); the UI marks it with `*`.
- Reads decode the operating mode, TRS setting and custom CC banks; other
  read-back fields are kept as raw pages in exports for future work.
- Bank transfers (editing individual bank entries) are not yet implemented.

## Development

```sh
npm test            # vitest (protocol codec bit-perfect vs captures,
                    #  snapshot import/export round-trips, comms orchestration)
npm run lint        # eslint
npm run format      # prettier
npm run build       # type-check + production build
```
