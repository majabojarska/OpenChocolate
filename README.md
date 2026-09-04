# OpenChocolate

## About

FOSS, web-based, cross-platform configuration tool for the M-Vave Chocolate Plus MIDI footswitch.

## Structure

- `./open-chocolate` web application sources. See [its README](open-chocolate/README.md) for features, usage and development.
- `./reverse-engineering` reverse engineering notes and SysEx protocol analysis:
  - [`MIDI-protocol-spec.md`](reverse-engineering/MIDI-protocol-spec.md) - protocol reference
  - [`protocol-addendum.md`](reverse-engineering/protocol-addendum.md) - findings from the official apps and captures
  - [`usb-capture/`](reverse-engineering/usb-capture) - USBPcap captures (filename describes the action)
  - [`extract_sysex.py`](reverse-engineering/extract_sysex.py) - pcapng to SysEx listing tool

## Prior related works
- [https://github.com/cbix/mvave-chocolate-sysex](https://github.com/cbix/mvave-chocolate-sysex)
- [WilsonNet/mvave-chocolate-tui](https://github.com/WilsonNet/mvave-chocolate-tui)
