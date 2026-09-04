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

Open traffic uses command `0D`, subcommand `41`, and a 20-byte record. The
capture contains multiple records with changing parameters, so the complete
handshake is not a single fixed message.

## Configuration commands

UI configuration writes use a 21-byte command:

```text
F0 00 32 09 49 ss ss ss ss vv vv vv vv vv vv vv vv vv vv cc F7
```

The selector occupies bytes 9-12, the selected value is normally byte 18, and
byte 19 is a validation/check byte. The checksum algorithm has not been
established.

Observed selectors and values include:

| Operation                    | Selector/value observed                                |
| ---------------------------- | ------------------------------------------------------ |
| Polarity disabled/enabled    | selector `5A 38 01 00`, value `00`/`01`                |
| Maximum groups 1, 3, 5, 7, 8 | selector `57 38 01 00`, value `00`/`02`/`04`/`06`/`07` |
| Program Change A/B           | selector `00 00 00 00`, value `00`/`01`                |
| Manufacturer control         | value `04`                                             |
| Touch-screen Android         | value `05`                                             |
| Video                        | value `06`                                             |
| Keyboard A/B                 | values `07`/`08`                                       |
| Multimedia keyboard          | value `09`                                             |
| Custom keyboard              | value `0A`                                             |
| Mix key                      | value `0B`                                             |
| Speaker                      | value `0C`                                             |
| Advanced custom              | value `03`                                             |

After configuration, the device commonly responds with this 12-byte
acknowledgement:

```text
F0 00 32 01 08 00 00 00 00 7F 01 F7
```

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

## Bit-perfect configuration examples

The following are complete host-to-device messages copied from the captures
(spaces are formatting only).

### Polarity

```text
Disabled  F0 00 32 09 49 00 00 00 02 5A 38 01 00 10 00 00 00 00 08 01 F7
Enabled   F0 00 32 09 49 00 00 00 02 5A 38 01 00 10 00 00 00 01 06 F7
```

### MIDI interface

```text
TRS-MIDI          F0 00 32 09 49 00 00 00 02 01 00 00 00 10 00 00 00 01 70 03 F7
Expression pedal  F0 00 32 09 49 00 00 00 02 01 00 00 00 10 00 00 00 00 72 03 F7
```

### Operating modes

```text
Program Change A   F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 00 74 03 F7
Program Change B   F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 01 72 03 F7
Advanced Custom    F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 03 6E 03 F7
Custom Mode        F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 02 70 03 F7
Keyboard A         F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 07 66 03 F7
Keyboard B         F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 08 64 03 F7
Manufacturer       F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 04 6C 03 F7
Touch Screen       F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 05 6A 03 F7
Video              F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 06 68 03 F7
Multimedia         F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 09 62 03 F7
Custom Keyboard    F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 0A 60 03 F7
Mix Key            F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 0B 5E 03 F7
Speaker            F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 0C 5C 03 F7
```

### Maximum group count

```text
1  F0 00 32 09 49 00 00 00 02 57 38 01 00 10 00 00 00 00 0E 01 F7
3  F0 00 32 09 49 00 00 00 02 57 38 01 00 10 00 00 00 02 0A 01 F7
5  F0 00 32 09 49 00 00 00 02 57 38 01 00 10 00 00 00 04 06 01 F7
7  F0 00 32 09 49 00 00 00 02 57 38 01 00 10 00 00 00 06 02 01 F7
8  F0 00 32 09 49 00 00 00 02 57 38 01 00 10 00 00 00 07 00 01 F7
```

### Captured footswitch and bank-clear operations

```text
A long step       F0 00 32 09 49 00 00 00 02 5D 00 00 00 10 00 00 00 03 34 02 F7
A single step     F0 00 32 09 49 00 00 00 02 5D 00 00 00 10 00 00 00 00 3A 02 F7
A two-bank switch F0 00 32 09 49 00 00 00 02 5D 00 00 00 10 00 00 00 01 38 02 F7
B short/long      F0 00 32 09 49 00 00 00 02 7E 03 00 00 10 00 00 00 04 6E 03 F7
C long step       F0 00 32 09 49 00 00 00 02 1F 07 00 00 10 00 00 00 03 2A 01 F7
```

The bank-add/configure captures contain large state-dependent payloads and
cannot be represented by a reusable example without reproducing the complete
1190-byte records; their segment structure is specified above.
