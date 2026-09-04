# M-Vave Chocolate Plus MIDI protocol

This document describes only behavior observed in the supplied USB captures.

## Transport

The device is USB MIDI over bulk transfer, using endpoint `0x04 OUT` for host
commands. SysEx messages begin with `F0 00 32` and end with `F7`. USB MIDI
packets carry three MIDI bytes; continuation packets use CIN `0x04` and the
final packet uses CIN `0x07`.

## Discovery

Request:

```text
F0 00 32 45 00 00 00 40 7F F7
```

The supplied discovery capture also contains a 41-byte response beginning
`F0 00 32 45 58 01 00 00 23`; its remaining fields are not yet identified.

## Open/handshake

The captured initialization sequence is:

1. Send the discovery request above.
2. Receive the 41-byte `45 58` discovery response.
3. Send twenty-four `0D 41` read requests. Each request is 20 bytes and has the
   form `F0 00 32 0D 41 00 00 00 02 ss ss ss ss 10 7E 00 rr rr F7`.
   The selector bytes advance through the device configuration records.
4. Receive a 1173-byte `0D 49` response after each read request. The response
   echoes the selector and contains the corresponding configuration payload.
5. Send one final `0D 41` request with selector `27 35 01 00` and marker
   `70 36`; the device answers with a 521-byte `0D 79` response.
6. Send six 21-byte `09 49` configuration writes (mode/custom settings), each
   followed by the 12-byte `01 08` acknowledgement.

Thus opening and loading configuration is a request/response exchange; it is
not a single fixed 16- or 20-byte “open” message. The exact request selectors
observed in order are:

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
|   9-12 |    4 | selector      | Selects the setting being changed |
|     13 |    1 | `10`          | Fixed data marker                 |
|  14-16 |    3 | `00 00 00`    | Reserved                          |
|     17 |    1 | value         | Setting value                     |
|  18-19 |    2 | checksum      | Two 7-bit validation bytes        |
|     20 |    1 | `F7`          | SysEx end                         |

All payload bytes must remain MIDI-safe (`0x00`-`0x7F`). The selector and value
are interpreted by the selected configuration family. For example, operating
mode writes use selector `00 00 00 00`, while groups and polarity use their
own selectors documented in their own sections.

```text
F0 00 32 01 08 00 00 00 00 7F 01 F7
```

## Known configuration selectors

The selector occupies offsets 9-12 of a `09 49` configuration write. The
following selectors are confirmed by the supplied captures or the referenced
external implementation:

| Selector                    | Configuration family                  | Value at offset 17                   |
| --------------------------- | ------------------------------------- | ------------------------------------ |
| `00 00 00 00`               | Operating mode                        | Mode identifier                      |
| `5A 38 01 00`               | Polarity reversal                     | `00` disabled, `01` enabled          |
| `57 38 01 00`               | Maximum group count                   | `group count - 1`                    |
| `01 00 00 00`               | MIDI interface type                   | `00` expression pedal, `01` TRS-MIDI |
| `5D 00 00 00`               | Footswitch A mode                     | Mode identifier                      |
| `7E 03 00 00`               | Footswitch B mode                     | Mode identifier                      |
| `1F 07 00 00`               | Footswitch C mode                     | Mode identifier                      |
| UNKNOWN                     | Footswitch D mode                     | Mode identifier                      |
| `02 00 00 00`               | Custom CC value, bank 1               | CC number                            |
| `03 00 00 00`               | Custom CC latch, bank 1               | `00` momentary, `01` latching        |
| `30 0E 00 00`–`3E 0E 00 00` | Advanced Custom per-switch attributes | Attribute value                      |

For Custom CC, the first selector byte advances by `02` per bank (`02`, `04`,
`06`, `08`, `0A` for CC and `03`, `05`, `07`, `09`, `0B` for latch). Advanced
Custom selectors advance by `04` per switch; the second selector byte `0E`
requests an immediate live write.

## Footswitch selection

Footswitch mode commands use the same 21-byte `09 49` envelope with selectors
including `5D 00 00 00`, `7E 03 00 00`, and `1F 07 00 00`. The value and final
validation bytes vary by operation.

## Bank transfers

Bank edits are segmented transfers, not one monolithic message:

- remove-all uses a 111-byte `09 41 05` message;
- add/configure operations send fourteen 1190-byte records followed by a
  12-byte acknowledgement, with a final 56-byte record;
- long-record indexes advance by `08`: `00, 08, ... 68`;
- bank payload field meanings and the validation algorithm remain unresolved.

No fixed four-footswitch offset mapping has been established from the captures.

## Bit-perfect examples: selector `00 00 00 00`

Only captured commands with selector bytes `00 00 00 00` are listed below.
Groups and polarity are documented in their respective sections above.
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

The protocol does not use a conventional CRC polynomial. The validation field is a two-byte little-endian 14-bit complement, with each output byte restricted to seven bits.

For a `09 49` configuration message, let `D` be the bytes from immediately after `F0` through the value byte immediately before the two checksum bytes. Let `S` be the unsigned sum of all bytes in `D`, `Q = D[8]` (the subcommand parameter), and `V = D[len(D)-1]` (the value). The checksum integer is:

```text
X = 0x28A - S - Q - V
checksum[0] = X & 0x7F
checksum[1] = (X >> 7) & 0x7F
```

The bytes are transmitted as `checksum[0]`, `checksum[1]`, followed by `F7`. For example, the captured Program Change A message has checksum `74 03`:

```text
F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 00 74 03 F7
```

The same two-byte calculation is used by the external implementation for other message families with family-specific constants:

| Message family          | Constant |
| ----------------------- | -------: |
| `09 49` configuration   |  `0x28A` |
| `01 08` acknowledgement |  `0x13A` |
| `45` discovery          |  `0x136` |
| Other/unknown           |  `0x200` |

For these families, `X = constant - sum(D)` and the result is encoded as the same two seven-bit bytes. The `09 49` form additionally subtracts its subcommand and value as shown above.
