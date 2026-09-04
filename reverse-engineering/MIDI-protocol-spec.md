# M-Vave Chocolate Plus MIDI protocol

This document describes the SysEx protocol of the M-Vave Chocolate Plus
("FC2") as observed in the supplied USB captures
(`usb-capture/*.pcapng`) and cross-checked against the official apps
(decompiled `CubeSuite.dmg` macOS binary and `CubeSuite.apk`).
See `protocol-addendum.md` for how these findings were established.

## Transport

The device is USB MIDI over bulk transfer, using endpoint `0x04 OUT` for host
commands. SysEx messages begin with `F0 00 32` and end with `F7`. USB MIDI
packets carry three MIDI bytes; continuation packets use CIN `0x04` and the
final packet uses CIN `0x05`, `0x06` or `0x07`.

## Configuration blob

Many commands address a byte offset inside a **23646-byte configuration
blob** held by the device. The official app reads the whole blob
(`splitReadData(ext=4, addr=0, len=23646)`), edits it in RAM, and pushes
single-byte updates. Known layout (from the app's `FC2Struct` and captured
writes):

| Blob address | Field |
| -----------: | ----- |
| 0 | Operating mode (0..12) |
| 1 | TRS jack function (stored/read back: 0 = expression pedal, 2 = TRS-MIDI; config writes use 0/1) |
| 2 | MIDI channel (0-based; UI displays +1) |
| 3..12 | Custom mode, 5 banks: latch at `3+2b`, CC number at `4+2b` |
| 13..92 | Custom mode tap codes: 16 x 5-byte MIDI codes |
| 93..3428 | Advanced Custom: 2 pages x 4 switches x 417 bytes; first byte of each block is the switch step mode |
| ... | Custom keyboard keys, Mix Key entries |
| 23637 | Max banks, Program Change A mode (0x1f = 32 banks) |
| 23638 | Max banks, Program Change B mode |
| 23639 | Max group count (value = count - 1) |
| 23640 | Advanced Custom page (0/1) |
| 23641 | Custom Keyboard page |
| 23642 | Polarity reversal (stored/read back: 0 = off, 2 = on; config writes use 0/1) |
| 23643..23645 | Bank-MIDI, PC display, Mix Key page |

## Discovery

Request:

```text
F0 00 32 45 00 00 00 40 7F F7
```

The device answers with a 41-byte response beginning
`F0 00 32 45 58 01 00 00 23`, followed by 17 device-specific bytes (serial
or id) and a trailing checksum byte. Discovery works on every MIDI output:
send the request to all outputs and match the response signature.

## Open/handshake

The captured initialization sequence in `open-device.pcapng` is:

1. Send the discovery request above; receive the 41-byte `45 58` response.
2. Send twenty-four `0D 41` read requests. Each is 20 bytes:

   ```text
   F0 00 32 0D 41 00 00 00 02 ss ss ss ss 10 7E 00 00 rr rr F7
   ```

   The address bytes `ss` advance in strides of 1009:
   `00 00 00 00`, `71 07 00 00`, `62 0F 00 00`, ... `27 35 01 00`
   (i.e. address `i * 1009` for `i` = 0..23, encoded 7-bit LE).
   `rr` is a rolling 7-bit pair (lo, hi): 7, 19, 30, ... +11 per request.
3. Receive a 1173-byte `0D 49` response per read. Layout:

   ```text
   F0 00 32 0D 49 3F 00 00 02 ss ss ss ss 10 7E 00 00 [1153-byte payload] [ck:2] F7
   ```

   The payload carries blob content as a contiguous stream: response k holds
   blob `[k*1153, (k+1)*1153)` for k = 0..22, i.e. the device streams the
   whole config area from address 0 in 1153-byte chunks instead of honouring
   the request address (the echoed `ss` bytes identify the request, not the
   returned region - see `protocol-addendum.md`).
4. The 24th request uses marker `70 36` instead of `10 7E` and `rr` = 66;
   the device answers with a 521-byte `0D 79` record whose 501-byte payload
   is a FRESH copy of the LAST 501 bytes of the blob (blob 23145..23645),
   byte-aligned to the blob end. The live trailing system block is read from
   here - e.g. blob 23642 (polarity) arrives at payload offset 497. The same
   offsets inside the streamed pages hold a stale copy and must not be used
   (verified with the four `open-device-has-*` captures).
5. Send six 21-byte `09 49` configuration writes, each acknowledged with a
   12-byte `01 08` response (here: the Custom-mode CC numbers of the
   captured session and the Program-Change-B max-bank count).

The read requests observed in `open-device.pcapng`, in order:

```text
00 00 00 00, 71 07 00 00, 62 0F 00 00, 53 17 00 00,
44 1F 00 00, 35 27 00 00, 26 2F 00 00, 17 37 00 00,
08 3F 00 00, 79 46 00 00, 6A 4E 00 00, 5B 56 00 00,
4C 5E 00 00, 3D 66 00 00, 2E 6E 00 00, 1F 76 00 00,
10 7E 00 00, 01 06 01 00, 72 0D 01 00, 63 15 01 00,
54 1D 01 00, 45 25 01 00, 36 2D 01 00, 27 35 01 00
```

## Configuration commands

### Configuration write structure

A standard configuration write is a 21-byte SysEx message:

```text
F0 MM MM CC SS PP PP PP PP VV VV VV VV TT PP PP PP PP DD CC CC F7
```

| Offset | Size | Field         | Meaning                           |
| -----: | ---: | ------------- | --------------------------------- |
|      0 |    1 | `F0`          | SysEx start                       |
|    1-2 |    2 | `00 32`       | Manufacturer identifier           |
|      3 |    1 | `09`          | Configuration command class       |
|      4 |    1 | `49`          | Configuration-write subcommand    |
|    5-8 |    4 | `00 00 00 02` | Fixed message parameter           |
|   9-12 |    4 | address       | Blob address, 7-bit little-endian |
|     13 |    1 | `10`          | Fixed data marker                 |
|  14-16 |    3 | `00 00 00`    | Reserved                          |
|     17 |    1 | value         | Setting value                     |
|  18-19 |    2 | checksum      | Two 7-bit validation bytes        |
|     20 |    1 | `F7`          | SysEx end                         |

All payload bytes must remain MIDI-safe (`0x00`-`0x7F`). The address selects
the target byte inside the configuration blob (see the blob layout above);
single-value settings such as the operating mode live at their own address.
For example, operating mode writes use address `00 00 00 00`.

## Known configuration addresses

The address occupies offsets 9-12 of a `09 49` write, encoded as
`[addr & 7f, (addr >> 7) & 7f, (addr >> 14) & 7f, 0]`. Confirmed addresses:

| Address (bytes)              | Blob addr | Setting                              | Value at offset 17 |
| ---------------------------- | --------: | ------------------------------------ | ------------------ |
| `00 00 00 00`                | 0         | Operating mode                       | Mode identifier    |
| `01 00 00 00`                | 1         | MIDI interface type                  | `00` expression pedal, `01` TRS-MIDI (write; read-back uses `02` for TRS-MIDI) |
| `02 00 00 00`                | 2         | MIDI channel                         | 0-based channel    |
| `03 00 00 00`                | 3         | Custom bank 1 latch                  | `00` momentary, `01` latching |
| `04 00 00 00`                | 4         | Custom bank 1 CC number              | CC number          |
| `05`-`0C` (odd/even pairs)   | 5-12      | Custom banks 2-5 latch / CC          | as above           |
| `5D 00 00 00`                | 93        | Footswitch A step mode               | Mode identifier    |
| `7E 03 00 00`                | 510       | Footswitch B step mode               | Mode identifier    |
| `1F 07 00 00`                | 927       | Footswitch C step mode               | Mode identifier    |
| `40 0A 00 00`                | 1344      | Footswitch D step mode               | Mode identifier (inferred, see below) |
| `55 38 01 00`                | 23637     | Max banks, Program Change A          | `count - 1`        |
| `56 38 01 00`                | 23638     | Max banks, Program Change B          | `count - 1`        |
| `57 38 01 00`                | 23639     | Max group count                      | `group count - 1`  |
| `5A 38 01 00`                | 23642     | Polarity reversal                    | `00` disabled, `01` enabled (write; read-back uses `02` for enabled) |

Footswitch D follows the same 417-byte block stride as A-C (93 + 3 x 417 =
1344) and matches the decompiled struct layout, but the corresponding USB
capture is empty, so treat it as inferred.

## Footswitch selection

Footswitch mode commands use the same 21-byte `09 49` envelope with
addresses 93 (A), 510 (B), 927 (C) and 1344 (D). Captured values:

| Value | Step mode                          |
| ----: | ---------------------------------- |
| 0     | Single step (single bank)          |
| 1     | Single step (switch between two banks) |
| 2     | Press and release                  |
| 3     | Long step                          |
| 4     | Step short or step long            |

## Bank transfers

Bank edits are segmented transfers, not one monolithic message.

### Remove-all (`09 41 05`)

The official app clears one whole footswitch bank with a single 111-byte
message (two captures, footswitch B bank B and footswitch D bank A):

```text
F0 00 32 09 41 05 00 00 02 [addr:4] 00 0A [93 x 00] [ck:2] F7
```

`addr` is the bank's first 80-byte midi-code region (`midiCodeAddr(page, sw,
bank, 0, 0)`); the `00 0A` prefix and 93 zero bytes are reproduced as
captured. The two-byte checksum is `K - sum(D)` with `D` = all bytes after
`F0` through the last data byte (no `Q`/`V` subtraction), and
`K = 0x400 - 0x50 * bank` (bank A = `0x400`, bank B = `0x3B0`). This
reproduces both captures bit-perfect (`28 06` and `50 05`).

### Add/configure chunk writes

- add/configure operations send fourteen 1190-byte records followed by a
  12-byte acknowledgement, with a final 56-byte record;
- long-record indexes advance by `08`: `00, 08, ... 68`;
- the primary-midi-code fields are understood; the chunk-write validation
  algorithm remains unresolved.

No fixed four-footswitch offset mapping has been established from the captures.

## Bit-perfect examples: address `00 00 00 00`

Only captured commands with address `00 00 00 00` are listed below.
Spaces are formatting only.

| Mode                   | Request                                                          | Mode Value | Checksum |
| ---------------------- | ---------------------------------------------------------------- | ---------- | -------- |
| Program Change A       | `F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 00 74 03 F7` | `00`       | `74 03`  |
| Program Change B       | `F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 01 72 03 F7` | `01`       | `72 03`  |
| Advanced Custom        | `F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 03 6E 03 F7` | `03`       | `6E 03`  |
| Custom                 | `F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 02 70 03 F7` | `02`       | `70 03`  |
| Keyboard A             | `F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 07 66 03 F7` | `07`       | `66 03`  |
| Keyboard B             | `F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 08 64 03 F7` | `08`       | `64 03`  |
| Manufacturer control   | `F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 04 6C 03 F7` | `04`       | `6C 03`  |
| Touch Screen (Android) | `F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 05 6A 03 F7` | `05`       | `6A 03`  |
| Video mode             | `F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 06 68 03 F7` | `06`       | `68 03`  |
| Multimedia keyboard    | `F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 09 62 03 F7` | `09`       | `62 03`  |
| Custom Keyboard        | `F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 0A 60 03 F7` | `0A`       | `60 03`  |
| Mix Key                | `F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 0B 5E 03 F7` | `0B`       | `5E 03`  |
| Speaker                | `F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 0C 5C 03 F7` | `0C`       | `5C 03`  |

## Checksum

The protocol does not use a conventional CRC polynomial. The validation field
is a two-byte little-endian 14-bit complement, with each output byte
restricted to seven bits.

For a `09 49` configuration message, let `D` be the bytes from immediately
after `F0` through the value byte immediately before the two checksum bytes.
Let `S` be the unsigned sum of all bytes in `D`, `Q = D[8]` (the first
address byte), and `V = D[len(D)-1]` (the value). The checksum integer is:

```text
X = K - S - Q - V
checksum[0] = X & 0x7F
checksum[1] = (X >> 7) & 0x7F
```

`K` is constant per address family (determined from 50+ captured writes,
all of which reproduce bit-perfect):

| Address family                                        | K      |
| ----------------------------------------------------- | ------ |
| 0, 1, 4-12, 93 (mode, channel, TRS, custom CC, fs A)  | `0x28A`|
| 510 (footswitch B)                                    | `0x38B`|
| 927 (footswitch C)                                    | `0x18B`|
| 23637-23642 (max banks, groups, polarity)             | `0x20B`|

The rule that produces these constants is not yet understood; the constants
were derived empirically. Footswitch D (1344) has no capture; the reference
implementation groups it with footswitch B (`0x38B`).

For example, the captured Program Change A message has checksum `74 03`:

```text
F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 00 74 03 F7
```

Other message families use the same two-byte calculation with
family-specific constants and `X = K - S` (no `Q`/`V` subtraction):

| Message family          | Constant |
| ----------------------- | -------: |
| `09 49` configuration   |  `0x28A` (see address families above) |
| `01 08` acknowledgement |  `0x13A` |
| `45` discovery          |  `0x136` (single checksum byte `7F`) |
| Other/unknown           |  `0x200` |