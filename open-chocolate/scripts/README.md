# Closed-loop device driver

This lets the agent drive the real M-Vave Chocolate Plus through the browser
and capture the exact MIDI SysEx traffic, so reverse-engineering the read/write
format no longer requires manual UI clicks or pasting console exports.

## How it works

- The open-chocolate web app logs **every** SysEx message it sends and receives
  to the browser console (`console.info("... [open-chocolate] TX/RX ...")`).
- `drive-device.mjs` drives the app in a **headed Chromium** (Playwright),
  clicks the real UI (Connect, Operating mode, Bank tabs, Add/Edit message,
  Re-read), and captures every console line containing `[open-chocolate]`.
- The captured session is written to a log file, which can be diffed between
  runs to isolate how one changed field is encoded (the method used to crack
  the Bank A slot-2+ and Bank B layouts).

## Prerequisites

- The device plugged in and visible to Web MIDI in Chromium on this machine
  (it already is - the app lists it as e.g. `SINCO:SINCO MIDI 1`).
- The dev server running: `npm run dev` (default `http://localhost:5173`).
- Playwright installed once: `npm i -D playwright && npx playwright install chromium`.

## Usage

```sh
node scripts/drive-device.mjs --out usb-capture/bank-a-1.log \
  connect \
  set-mode 3 \
  bank A \
  remove-all \
  add 2 CC 50 60 \
  reread
```

Actions:

| action | meaning |
| ------ | ------- |
| `connect` | connect to the first detected device |
| `set-mode N` | set Operating mode to N (`3` = Advanced Custom) |
| `bank A\|B` | open footswitch A's Bank A / Bank B tab |
| `add <ch> <type> <d1> [d2]` | add a message (ch 1..16; type PC/CC/NoteON/NoteOFF/SysEx) |
| `edit <slot> <ch> <type> <d1> [d2]` | edit an existing message |
| `remove-all` | Remove all in the current bank |
| `reread` | click Re-read and wait for the read |
| `sleep <ms>` | wait |
| `dump` | print captured console lines so far |

Example differential pair (vary one field of message 2 of Bank B):

```sh
node scripts/drive-device.mjs --out usb-capture/bb-d1.log \
  connect set-mode 3 bank B remove-all \
  add 1 PC 0 0 add 1 CC 25 0 add 1 NoteON 27 29 reread

node scripts/drive-device.mjs --out usb-capture/bb-d2.log \
  connect set-mode 3 bank B remove-all \
  add 1 PC 0 0 add 1 CC 24 0 add 1 NoteON 27 29 reread
```

`diff` the two logs: the bytes that change in the `0d 49` read responses are
exactly the encoding of the 25->24 change.

## Notes / flags

- `--url` - app URL (default `http://localhost:5173`).
- `--timeout` - per-step timeout in ms.
- The driver grants the MIDI (SysEx) permission via `context.grantPermissions`.
- Headed Chromium is used on purpose: Web MIDI on Linux needs the live ALSA
  backend; Web MIDI is enabled with `--enable-features=WebMidi`.