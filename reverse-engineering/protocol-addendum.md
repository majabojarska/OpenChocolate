# Protocol addendum: findings from CubeSuite desktop binary + captures

This documents what was learned beyond `MIDI-protocol-spec.md` while building
`open-chocolate`. Evidence: `usb-capture/*.pcapng`, `old-apps/CubeSuite.dmg`
(Qt x86_64 binary, symbols intact, decompiled with Ghidra), and
`old-apps/CubeSuite.apk`.

## The "selector" is an address

The 4 selector bytes in `09 49` writes and `0D 41` reads are a **byte address
into the device's 23646-byte configuration blob**, encoded 7-bit
little-endian: `[addr & 7f, (addr>>7) & 7f, (addr>>14) & 7f, 0]`.

- The Android app's `FC2Struct.DATA_SIZE = 23646` and its UI reads
  `splitReadData(ext=4, addr=0, len=23646)`.
- `FootCtrlPlusDlg` (desktop app, Chocolate Plus dialog) keeps the same blob
  in RAM at `this+0x1470`, and every UI write is
  `sendDataToDevice(1, &blob[addr], 1)` - i.e. one-byte writes to blob
  offsets. Confirmed matches:
  - `0x14cd - 0x1470 = 93` -> footswitch A selector `5D 00 00 00`
  - `0x70c7 - 0x1470 = 23639` -> group count selector `57 38 01 00`
  - `0x70c5 / 0x70c6` -> max banks for PC-A / PC-B (`55/56 38 01 00`),
    written only when the respective mode is active
  - `0x70c8` -> advanced-custom page, used as the page index into the
    footswitch-mode blocks
  - the read requests sweep `addr = i * 1009`, i = 0..23 (23*1009 = 23207,
    +1153-byte payloads cover the full blob)
- Read stride 1009 with 1153-byte payloads: 23 pages * 1153 = 26519; the
  final 0D 79 record (498-byte payload) overlaps the tail. The 24 requests
  are replayed verbatim rather than recomputed.

## Footswitch A-D step modes = advCustom[0][n].mode

The FC2Struct layout (from `FC2Struct.setData`):

```
0      mode (state)          1 byte
1      trs (0 pedal, 1 midi) 1 byte
2      midi channel          1 byte
3..12  usr[5][2]             custom mode: 5 banks x (latch @ 3+2b, cc @ 4+2b)
13..92 midiCodeTap[16]       16 x 5-byte MIDI codes
93     advCustom1[2][4]      2 pages x 4 switches x 417 bytes:
                             mode(1) + midiCodeA(16x5) + midiCodeB(16x5)
                             + sysExA(128) + sysExB(128)
...    customKey, mixKey ... (stride per switch page 0x684/0x698)
23637  bankMax[0]            PC-A max banks (0x1f = 32)
23638  bankMax[1]            PC-B max banks
23639  bankMax[2]            max group count (value = count - 1)
23640  usrpage               advanced custom page (0/1)
23641  hidpage               custom keyboard page
23642  polar                 polarity reversal (0/1)
23643  bankMidi
23644  pcdisp
23645  mixpage
```

Evidence for the usr order: `FC2Fragment` wires a latch checkbox to
`usr[b][0]` and seeds the CC-selection adapter from `usr[b][1]`; the
open-device capture writes CC numbers (0x21, 0x22, 0x03, 0x2c, 0x07) to
addresses 4, 6, 8, 10, 12 (= `usr[b][1]`).

Footswitch A-D step-mode addresses are the first byte of each
`advCustom[0][n]` block: **93 (A), 510 (B), 927 (C), 1344 (D)**
(`5D 00 00 00`, `7E 03 00 00`, `1F 07 00 00`, `40 0A 00 00`).
D is confirmed by arithmetic (93 + 3*417) and by the decompiled struct
stride `0x684 = 4*417`; the D capture failed to record the actual message,
so treat D as inferred.

Step-mode values (captures): 0 = single step/single bank,
1 = single step/two banks, 2 = press and release, 3 = long step,
4 = step short or step long.

## Checksum constants are per address family

`X = K - sum(D) - Q - V` (D = bytes after F0 through the value byte,
Q = D[8] = first address byte, V = value). K verified from 35+ captured
writes:

| Writes to                          | K      |
| ---------------------------------- | ------ |
| 0, 1, 4-12, 93 (mode, TRS, CC, fsA)| `0x28A`|
| 510 (footswitch B)                 | `0x38B`|
| 927 (footswitch C)                 | `0x18B`|
| 23637-23642 (bankMax/group/polarity)| `0x20B`|

All 50+ captured `09 49` writes reproduce bit-perfect with these constants.
The rule behind the split is not yet understood (it is not a function of
address alone that we could find; B and C differ despite the same shape).
`fsD` (1344) has no capture - the implementation groups it with B (`0x38B`).

## Read request layout (20 bytes, corrected)

```
F0 00 32 0D 41 00 00 00 02 [addr:4] 10 7E 00 00 [rr:2] F7
```

The spec's 19-byte template was missing one `00` before the counter.
`rr` is a 7-bit pair (lo, hi) of a rolling counter: 7, 19, 30, ... +11 per
request (first +12). The final read uses marker `70 36` instead of `10 7E`
and rr = 66. Response layout:

```
F0 00 32 0D 49 3F 00 00 02 [addr:4] 10 7E 00 00 [1153-byte payload] [ck:2] F7
```

`0D 79` final responses use `1B` instead of `3F` and carry 498 payload bytes.

## Android app notes (CubeSuite.apk)

- Vendor: SinCo (strings `SINCO_*`); device-name pre-selection should match
  /sinco/i.
- Mode value -> label order used by the app UI (`modeOrder`):
  `{0, 1, 11, 2, 3, 4, 5, 6, 7, 8, 9, 10}` display order with Custom (2)
  shown last; labels match the MIDI-protocol-spec table.
- `.fcp` files = raw 23646-byte config blob dumps (import/export in the old
  app writes/reads `fcEntry.getData()` directly).
- Old `FootCtrlCommunication` / `Communication` classes are the BLE pedal
  protocol (0x59 header) - not applicable to the USB Chocolate Plus.

## Official manual (PD41-Software-Instructions.pdf)

The manufacturer's software instructions confirm the device model:

- **Virtual buttons E and F**: E = footswitches A+B pressed together,
  F = C+D pressed together. Used for group/bank switching.
- The manual lists 12 modes (numbered 1-12): PC-A, PC-B, Custom, Advanced
  Custom 1, Advanced Custom 2, Manufacturer, Touchscreen, Video, Keyboard A,
  Keyboard B, Multimedia, Custom Keyboard. Mix Key and Speaker exist in the
  firmware (captures 0x0B/0x0C) but are not in the manual.
- "Advanced Custom Mode 1" and "Mode 2" are the two pages (usrpage 0/1) of
  device mode 3 - not two separate mode ids.
- The five Advanced Custom sub-modes match the footswitch step-mode values
  0-4: single tap (single group), single tap (two groups switching),
  press-release, long press, short tap - long press.
- Predefined per-footswitch actions (not configurable):
  - Touchscreen: A swipe up, B swipe down, C swipe left, D swipe right
  - Video: A rewind, B fast forward, C pause/play, D loop
  - Keyboard A: A up, B down, C left, D right
  - Keyboard B: A page up, B page down, C space, D enter
  - Multimedia: A previous track, B next track, C volume down, D volume up
- Group/bank capacities: Program Change modes 32 banks (bankMax = 0x1f),
  Advanced Custom variant 2 up to 16 groups, Custom Keyboard 18 groups.

Open question: the blob holds five custom-mode CC/latch slots (addresses
4-12 even/odd), but the manual documents only four footswitches for Custom
mode. The fifth slot's purpose is unknown (expression pedal or reserved).

## Ghidra artifacts

`ghidra_scripts/` contains the scripts used to dump the macOS binary
functions (`CUSBConnect::add_checksum`, `make_flash_*_packet`,
`FootCtrlPlusDlg::*`). Decompiled copies of key Android classes are in this
folder (`FC2Struct.decompiled.java` etc.).
