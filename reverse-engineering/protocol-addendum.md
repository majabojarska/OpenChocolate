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
  - the read requests sweep `addr = i * 1009`, i = 0..23 (23*1009 = 23207)
  - **the responses are NOT aligned to the request address.** The device
    streams the blob in contiguous 1153-byte chunks starting at blob 0:
    response k carries blob `[k*1153, (k+1)*1153)` and simply echoes the
    request address back. Verified against `open-device.pcapng`: laying each
    payload out at its request address makes the 144-byte overlaps between
    consecutive pages contradict each other in 30 places (impossible for a
    consistent device), while contiguous placement has zero conflicts, a sane
    blob head and a consistent trailing system block. The 23 full pages cover
    blob 0..26518 (past the 23646-byte config area). The 24 requests are
    replayed verbatim rather than recomputed.
  - **the trailing `0D 79` record is a fresh copy of the LAST 501 bytes of the
    blob** (blob 23145..23645), byte-aligned to the blob end. The live
    trailing system block (bankMax/usrpage/hidpage/polarity/...) is read from
    here: for the four `open-device-has-*` captures (TRS-MIDI x polarity
    reversal), the polarity byte sits at payload offset 497 = blob 23642 =
    exactly its write address, and tracks the setting (0 = off, 2 = on) in
    every capture. The same offsets inside the streamed pages (page 20 carries
    blob 23060..24213) hold a STALE copy - its polarity byte never changes.
    So the final record is NOT "beyond the config area": it is the config
    tail and must be used for the system block.
- Read stride 1009 with 1153-byte payloads: the payloads are contiguous
  streamed chunks of the blob (response k = blob `[k*1153, (k+1)*1153)`), not
  regions at the request addresses - see the note above.

## Footswitch A-D step modes = advCustom[0][n].mode

The FC2Struct layout (from `FC2Struct.setData`):

```
0      mode (state)          1 byte
1      trs (0 pedal, 2 midi) 1 byte   (read-backs store 2 for TRS-MIDI;
                                      config writes use 0/1 and the Android
                                      app clamps the read byte to 0..1)
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
23642  polar                 polarity reversal (0 off / 2 on in read-backs;
                             writes use 0/1)
23643  bankMidi
23644  pcdisp
23645  mixpage
```

These nine trailing bytes are carried by the `0D 79` final record (blob
23145..23645, see above), not by the streamed page 20.

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
| 128..173 (fsA page-0 midiCodeA tail, slots 6-15) | `0x38B`|
| 510 (footswitch B)                 | `0x38B`|
| 927 (footswitch C)                 | `0x18B`|
| 174..253 (midiCodeB / Bank B of every switch)    | `0x18B`|
| 23637-23642 (bankMax/group/polarity)| `0x20B`|

All 50+ captured `09 49` writes reproduce bit-perfect with these constants.
The rule behind the split is not yet understood (it is not a function of
address alone that we could find; B and C differ despite the same shape).
`fsD` (1344) has no capture - the implementation groups it with B (`0x38B`).

The `128..173` row and the `0x18B` Bank-B row were found by live K-sweeps,
not captures:

- fsA page-0 midiCodeA bytes 128..173 (Bank A slots 6-15) are REJECTED with
  the switch constant `0x28a` (no ACK) but ACKed with `0x38b`, value
  independent (0 / 1 / 0x7f behave identically). The official app never
  `09 49`-writes midiCodeA, so its constant was unknown until probed.
  Boundary probe after the fix: all 16 slots of BOTH banks ACK.
- Bank B of every switch (block+81..block+160) needs `0x18b`: the switch
  constant and `0x38b` both drew no response, `0x18b` was ACKed (same value
  as the footswitch-C block constant). Implemented as
  `CK_FOOTSWITCH_BANK_B` in `sysex.ts`.

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

`0D 79` final responses use `1B` instead of `3F` and carry 501 payload bytes
(the last 501 bytes of the blob).

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

## Advanced Custom read-back: packed view on the 0D path (device-validated)

Two read protocols exist and they differ:

- The **desktop app's own** `flash_read` (via `send_upload_request` /
  `get_upload_responds`) copies response payloads **verbatim** into the logical
  blob (`Ghidra: _memcpy(dst, src, len)`, no decryption). It addresses the
  logical layout directly: Bank A = `midiCodeA` @ `94 + sw*0x1a1 + page*0x684
  + slot*5`, Bank B = `midiCodeB` @ `174 + ...` (from `addAMidiCode` /
  `addBMidiCode`). Writes send that raw region via one `09 41` (blob 93..13437).
- The **stride-1009 `0D 41` pages** that open-chocolate (and the Android app)
  read carry a **packed view** of the advanced region: each switch block is
  stored at `ADV_PACKED_BASE + page*4*480 + sw*480` with mode <<2 at [+0], a
  constant 0x08 at [+1] and per-slot 5-byte records R0..R4 at [+2 + slot*5]
  (see the codec in `sysex.ts`). Slot 1 decodes bit-exact (validated against
  the GroupA-D captures AND live on a real device: `CH 16 CC 1 0`, `CH 1 PC
  0 0` read back correctly).

Consequences:

- The earlier "packed flash" hypothesis was correct FOR THE 0D PATH, and the
  logical-only decode was wrong for it (the desktop raw-copy proof applies only
  to the desktop's own read protocol). `open-chocolate` reads via 0D, so it
  unpacks the packed records; it still WRITES via the plain logical addresses
  (midiCodeA/B), matching the desktop app.
- `.fcp` exports made with the desktop app keep Bank A at blob 94
  (`midiCodeA`). The `complex-3` files with Bank A at blob 174 were produced by
  a different app/build (the Flutter "Midi Suite" has its own codec -
  `sysex_codec.dart`/`FcMidiCodeStruct` in `old-apps/Midi Suite/data/app.so`).
- **Codec2 (marker `0x02` only - supersedes the older "slot 2+ codec" claim).**
  A clean-state walk (see the marker table below) disproved the earlier claim
  that every further slot at [+8], [+13], ... uses this codec at a fixed
  `+5`-per-slot stride: that layout is only valid for records carrying the
  `0x02` marker (slot indices 1, 8, 15). Formula, with the d2 fix included:

  ```
  B0 = (channel & 0xf) << 2
  B1 = (type & 0x7) << 3
  B2 = (data1 & 0x7) << 4                  // data1 bits 0..2
  B3 = (data1 >> 3) | ((data2 & 3) << 5)   // data1 bits 3..6, data2 bits 0..1
  B4 = (data2 >> 2) | (data2 & 0x40)       // d2 bits 2..6, bit 6 duplicated (live find)
  ```

  The `d2 & 0x40` term was found by live sweep: the device packs d2 bit 6 into
  B4 bit 6 on top of `d2 >> 2` (d2=71 -> B4=0x51, d2=81 -> 0x54). An earlier
  `B4 = data2 >> 2` decoded d2 >= 0x20 with garbage upper bits (71 -> 0x144).
  Decode masks it back off: `d2 = ((B4 & 0x1f) << 2) | ((B3 >> 5) & 3)`. The
  four originally-verified on-device reads stay valid, but they are codec2
  evidence, not a blanket slot-2+ layout.
- Caveat (unchanged): a single-message block may leave stale bytes in the
  other slots' cells, so the UI can show a leftover message until the block
  is cleared.

### Bank A slots 2+: the 7-codec marker cycle (live, clean-state walks)

Clearing all 16 slots of fsA page-0 Bank A, then writing each slot one at a
time from a zero baseline and diffing the packed region, shows records sit at
FIXED per-slot positions and edit IN PLACE when a value changes - the earlier
"compaction" hypothesis is REFUTED (the apparent shifting was dirty bank
state, not compaction). Slot assignment repeats with period 7; each record is
a single-bit marker byte + content (marker family same as the Bank B type
markers). For CODE={ch7, NoteON, 93, 71}:

| Marker | Slots (0-based) | Record (marker + content) | Codec |
| ------ | --------------- | ------------------------- | ----- |
| `0x02` | 1, 8, 15        | `02 1c 10 50 6b 11`       | codec2 (d2 = (B4&0x1f)<<2 | (B3>>5)&3) |
| `0x08` | 7, 14           | `08 70 40 40 2e 47`       | R-family (type bit2 -> B2 bit0) |
| `0x04` | 4, 11           | `04 38 20 20 57 23`       | template (ch<<3, type<<4, ...) |
| `0x01` | 5, 12           | `01 0e 08 68 75 08`       | ch<<1, type<<2, (d1&f)<<3, d2 in B4/B5 |
| `0x40` | 2, 9            | `40 00 07 04 74 3a 04` (7B) | ch B1, type<<1 B2, d1<<2, d2<<3 |
| `0x10` | 3, 10           | `10 60 01 01 5d 0e 01` (7B) | ch bits, type bits, d1 B3, d2<<1 |
| `0x20` | 6, 13           | `20 40 03 02 3a 1d 02` (7B) | ch bits, type B2, d1<<1, d2<<2 |

Key facts (all verified live against a real device):

- Slot index 0 is the R-codec record (standalone, always reliable) at packed
  blob 107 (marker `08` + 5 content bytes). Marker by `index % 7`:
  1->0x02, 2->0x40, 3->0x10, 4->0x04, 5->0x01, 6->0x20, 0->0x08.
- Record length is marker-dependent (6 bytes for `01/02/04/08`, 7 bytes for
  `10/20/40`; the extra byte carries d2's high bits). Positions are pinned by
  live diffing and repeat with period 7:
  P = [107, 113, 118, 124, 130, 136, 141, 147, 153, 158, 164, 170, 176, 181,
  187, 193].
- All 7 family codecs (0x01/0x02/0x04/0x08/0x10/0x20/0x40) are derived and
  implemented in `sysex.ts` (`decodePackedFamily`/`encodePackedFamily`); a
  full 16-slot Bank A on fsA decodes 16/16 EXACT through the app decoder
  (`verify-app-decoder.mjs`). The 0x01 codec carries d2 bits 3..5 in the next
  slot's marker low bits (marker-OR).
- Marker-OR: the LAST content byte of a cell is OR'd with the NEXT slot's
  marker ONLY when that next marker is a high family (>= 0x04); the low
  markers 0x01/0x02 leave the previous byte as pure data.
- Occupancy dependence (live fuzz): the fixed positions/codecs are verified
  for a FULLY-POPULATED bank and SINGLE-slot states. SPARSE/MIXED multi-slot
  occupancy (2..15 populated, non-contiguous) re-packs and the fixed model
  decodes wrong. The app therefore guards: when the bank is not full and has
  more than one populated slot, only slot 0 is decoded; slots 1+ are reported
  EMpty (honest-empty, same policy as unmapped Bank B cells). The fuzzer
  targets fs0 and covers full-bank + sparse states; it PASSes with warns for
  the sparse slots.
- Type 4 (SysEx) packs correctly in the low families (0x01/0x02/0x04/0x08)
  but has an UNMAPPED layout in the high families (0x10/0x20/0x40) - the
  type/channel bits relocate when type >= 4 (live probe). The decoder returns
  undefined for those instead of fabricating.
- NOT yet verified: the packed block base for switches B-D. `advPackedBlockBase`
  (= 106 + sw*480) was derived from the Android struct, but a live probe
  writing to fs1's logical area did NOT find the expected R-codec anywhere in
  page 0 - the packed view for sw>=1 may live at a different base/stride. The
  fuzzer therefore targets fs0 only until this is pinned.

### Bank B (midiCodeB) write checksum - confirmed live

Writing a Bank A (`midiCodeA`) slot via `09 49` is ACKed by the device with the
general/per-switch constant (`0x28a` for footswitch A). The **midiCodeB region**
(block+81..block+160, i.e. Bank B of every switch) needs its own constant,
confirmed by live trial on a real device: a write to addr 175 with 0x28a drew no
response, 0x38b also drew no response, and **0x18b was ACKed** (the same value as
the footswitch-C block constant). Implemented as `CK_FOOTSWITCH_BANK_B = 0x18b`
in `sysex.ts` `checksumConstantFor`.

### Bank B read-back cells - partially mapped

Differential reads (changing one Bank-B message field at a time) pin the Bank B
region: 6-byte cells at packed block +92, stride 6, with:

- `b0` = type via `0x40 >> (2*type)` (PC/CC/NoteON/NoteOFF -> 0x40/0x10/0x04/0x01)
- `b2` = type via `0x80 >> (type+1)` masked to 7 bits
- the SECOND message (`slot 1`) decodes exactly: `data1 = b4` (literal),
  `data2 = b5 >> 1` (verified live: `CH1 CC 1 2` read back bit-exact from
  `10 00 40 00 01 04`).
- the FIRST message uses a DIFFERENT, value-dependent spread (e.g. a live
  `{ch2,CC,25,0}` -> `40 00 02 02 64 00` did not fit the second-message
  formula), and slots 3+ are also unmapped. `decodePackedBankBCell` therefore
  only trusts the marker-only first cell (`40 00 00 00 00 00` = PC 0 0) and
  the second cell, so the UI never fabricates values.

## Bank edits are chunked `09 41` flash writes, not per-byte `09 49`

The official (Android) app writes an edited Advanced Custom bank as a
segmented flash transfer, not a `09 49` byte loop:

- 13 messages of **1190 bytes** with header `F0 00 32 09 41 40 00 00 02
  <addr:4>` and an address stride of `0x400` (93, 1117, ..., 12381), each
  acked by a 12-byte `01 08`, followed by a **56-byte** `09 41 02` final
  message at the next chunk base (13405), then its ack.
- The 1190-byte payload is the **packed** flash region (matching the read
  view), NOT a plain 1024-byte copy: the edited slot's 5 bytes appear spread
  across a handful of bit-encoded bytes, and most of each message is zeros.
- The framing byte at offset 5 differs by message (0x40 for data chunks,
  0x02 for the final, 0x05 for the `09 41` bank-clear). Checksum uses the
  same `K - sum(D)` scheme as the 111-byte bank-clear, with a per-chunk
  constant not yet derived.

Current `setFootswitchMidiCode` writes each logical byte via `09 49`; the
write packet/re-pack algorithm remains to be reproduced before bank edits can
be sent the way the official app does. This section supersedes the older
"Add/configure chunk writes" note in `MIDI-protocol-spec.md`.
