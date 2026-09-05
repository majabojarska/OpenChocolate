# AGENTS.md

Notes for agents working on this repo: implementation state, protocol
findings, and the development workflow for hacking on the M-Vave Chocolate
Plus (FC2) communication layer.

## Layout

- `open-chocolate/` - the web app (Vue 3 + Vite + Vitest). All protocol code
  lives in `src/lib/`.
- `reverse-engineering/` - captures (`usb-capture/*.pcapng`), decompiled
  official-app sources (`*.java`, `ghidra_scripts/`), binaries
  (`old-apps/`), and protocol notes (`MIDI-protocol-spec.md`,
  `protocol-addendum.md`).
- Git history is per-file (files were sometimes modified outside git, so
  `git diff` may be noisy; the working tree is the source of truth).

## Reverse-engineering: current ground truth

Aligned with `protocol-addendum.md`; verified live against a real device.

### Known gaps

- Bank A slots 1+: the fixed per-slot positions + 7 family codecs are derived
  and verified for a FULL bank (16/16 on fsA) and single-slot states, but
  SPARSE/mixed multi-slot occupancy re-packs (live fuzz). Type-4 (SysEx) is
  unmapped in the high families (0x10/0x20/0x40). The packed base for
  switches B-D is NOT verified (the 106+sw*480 stride may be wrong). The app
  guards by decoding only slot 0 unless the bank is full, and only fs0 is
  fuzz-targeted.
- Bank B read: first-message (index 0) layout and slots 3+ cells unmapped.
- The `09 41 40` chunked bank-write payload encoding (the official app's
  full/partial bank rewrites) - not implemented; writes use 09 49.
- Confirmed live: writes ACK for every slot of both banks (`09 49`; checksum
  exceptions: `0x38b` for midiCodeA 128..173, `0x18b` for the whole Bank B
  region). Reads: Bank A slot 0 (R-codec) round-trips exactly in ALL
  occupancies; a fully-populated fsA bank decodes 16/16; Bank B write
  round-trips but Bank B read is partial (only the marker-only first cell and
  the index-1 cell decode).

## Development workflow

### Tests

- `cd open-chocolate && npx vitest run` - test suite. 
- `npx eslint src/lib scripts` for lint.

### Closed-loop device testing (no manual clicks needed)

`scripts/drive-device.mjs` drives the app in a **persistent-profile headed
Chromium** via Playwright:

```sh
cd open-chocolate && npm run dev -- --host 127.0.0.1 --port 5174   # once
node scripts/drive-device.mjs --url http://127.0.0.1:5174/ \
  --out usb-capture/run.log connect bank A remove-all \
  add 1 PC 0 0 add 1 CC 25 0 add 1 NoteON 27 29 reread
node scripts/analyze-log.mjs usb-capture/run.log --page0 --bb [--diff other.log]
```

- Actions: `connect set-mode N bank A|B add <ch> <type> <d1> [d2] edit
  <slot> ... remove-all reread sleep dump`.
- Console capture: the app logs every SysEx TX/RX as `[open-chocolate] TX|RX
  <port> (N B): f0 ... f7`; the driver saves all such lines to `--out`.
- Web MIDI permission: the FIRST run needs a manual "Allow" on Chromium's
  popup (it persists in the persistent profile at
  `/tmp/open-chocolate-drive-profile`); later runs don't prompt. The driver
  also CDP-grants `midi` and connects via the app UI before the actions.
- Headed Chromium is required (Web MIDI needs the ALSA backend; headless
  drops the device). Runs must be `unsandboxed` (Chromium needs sockets /
  ptrace / home-dir writes).
- Device is selected via `navigator.requestMIDIAccess` + the `SINCO` port
  filter. `analyze-log.mjs` parses both the driver format and the pasted
  console format (`... device.ts`).

### Reproducing the differential method

To isolate an encoding, run two sessions identical except one field, then
`--diff` the logs; the changed read-back bytes reveal the field's packing.
This is how the slot-1 R-codec, slot-2 codec2, and the Bank B write constant
were derived.

### Reminders

- The device stores logical data on write but serves the packed view on the
  `0D` read; macro definitions span `sysex.ts` (codecs/constants) and
  `device.ts` (`decodeAdvancedCustom`, `blobByte`).
- Factory reset: hold A+D until "000" blinks (from app tips) - safe to use
  when experiments corrupt flash.
