# REVERSED_PROTOCOL_SPEC.md

Working, honest description of the M-Vave Chocolate Plus ⇄ CubeSuite editor
MIDI protocol, reverse-engineered from captures under `captures/`.

- **Status:** work in progress. This documents what we have *observed* and
  *confirmed*; the second half lists what is *not* known and how to find out.
- **How captures were obtained:** `midi.record()` runs `aseqdump -p` on the
  two ALSA sequencer ports (`WINE midi driver` = the editor/app side,
  `SINCO` = the pedal side) while `choco.py` drives the GUI.
- **Decoders live in:** `trace.py` (`SYSEX_OP`, `decode_sysex`,
  `decode_d2`). If you change the decode, update this file.

---

## 1. Transport

| Port (client) | Role | Notes |
|---|---|---|
| `WINE midi driver` (e.g. `133:0`) | app → device | Bottles/Wine ALSA out; port name `WINE ALSA Output #N` varies by session |
| `SINCO` (e.g. `16:0`) | device → app | `SINCO` is the USB-MIDI chip vendor; this is the pedal |

- Direction is per *source port*: app-side events are host→device; SINCO-side
  are device→host. There is no direction flag in the payloads we treat as
  host→device (see `09`/`01` below).
- Wine buffers outgoing events if no subscriber is attached; attach
  `aseqdump`/`trace.py` *before* driving the GUI or the first flush may be
  missed.
- Client/port numbers are not stable across sessions — match by client name.

---

## 2. SysEx framing (host → device)

```
F0 00 32 09 41 OP 00 00 SUB_HI SUB_LO OFFSET  PAYLOAD...  CHK1 CHK2 F7
```

| byte(s) | meaning | observed |
|---|---|---|
| `F0 00 32` | vendor/prefix | constant |
| `09` | host→device | constant on app side |
| `41` | config family | constant on app side |
| `OP` | operation (see table) | `02`, `05`, `40` |
| `SUB_HI SUB_LO` | sub-id | `02 5D` (dump/write), `02 5E` (erase) |
| `OFFSET` | block offset (×8) for dumps; else 0x00/0x68 | see below |
| `CHK1 CHK2` | 2 bytes before `F7`; data-dependent | see §5 |
| `F7` | end of SysEx | constant |

Other families are documented separately: `09 49` mode select (§2d),
`0D 41`/`0D 49` register read-back (§2c), `45 58` discovery banner (§2b).

### 2b. Discovery — device banner at connect (family `45 58`) — SOLVED

When CubeSuite starts, it sends out a discovery request to all MIDI
devices; only the footswitch replies with its constant banner. That banner
is a one-shot, device→app SysEx, captured at app start
(`captures/09_05/midi_20260905_222230.log`):

```
F0 00 32 45 58 01 00 00 23 6F 5E 51 1B 44 4E 1C 36 50 58 55 1B 77 0B 4C 18 36
00 00 00 00 00 00 00 00 00 00 00 00 00 0E F7
```

- 44 bytes; `45 58` = the discovery family/marker.
- It identifies the device to the app; other devices respond with *some*
  bytes but not this constant, which is how the app tells the footswitch
  apart and allows its launcher entry to be clicked.
- `trace.py` labels it `discovery`.

The app's exact *request* for this banner was not captured (it is sent
before the app's Wine MIDI port is registered/tappable); the banner itself
is the observable, constant fingerprint.

### 2c. Init — full config read-back (register-read protocol, family `0D`) — SOLVED

When FootCtrlPlus opens (editing the discovered device), either CubeSuite
or FootCtrlPlus runs an **init sequence: it reads back the entire
device configuration** via a register-address read loop. The MIDI
responses from the device are what populate the application's UI state
(event lists, banks, modes). Capture:
`captures/09_05/discovery_handshake.log`.

**App → device: read request** (21 bytes, no ACK):

```
F0 00 32 0D 41 00 00 00 02 <ADDR0> <ADDR1> <ADDR2> 00 00 10 7E 00 00 <CMD> 00 F7
```

The device responds per request (echoing the address in bytes 9..11):

```
F0 00 32 0D 49 3F 00 00 02 <ADDR0> <ADDR1> <ADDR2>  <~1170-byte payload> F7
```

- The app sweeps addresses sequentially: `(00,00,00)`, `(71,07,00)`,
  `(62,0F,00)`, `(53,17,00)`, `(44,1F,00)`, … — a descending low-byte
  sweep, ~24 requests, 17 responses observed (aseqdump may merge/buffer
  the remainder).
- Each response carries a chunk of the config; reconstructed together they
  form the full device state the UI renders.
- `trace.py` labels them `read_req addr=...` / `read_resp addr=...`.

### 2d. Footswitch mode select (op `49`) — SOLVED

A single 21-byte SysEx changes the mode of the currently-selected foot
switch; the pedal ACKs it like any other write. Capture: 5 modes, one
message each (`captures/09_05/midi_20260905_215009.log`):

```
F0 00 32 09 49 00 00 00 02 5D 00 00 00 10 00 00 00 <MODE> <CHK1> <CHK2> F7
 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17  18    19    20
```

| byte | value | meaning |
|---|---|---|
| `4` | `49` | family: mode-select |
| `8..9` | footswitch selector | see table below |
| `17` | mode byte | see table below |
| `18..19` | checksum | tracks the mode byte + selector (see §5) |

Mode byte `17`:

| value | mode | banks |
|---|---|---|
| `00` | `single_step_single_bank` | 1 |
| `01` | `single_step_double_bank` | 2 |
| `02` | `press_down_release_double_bank` | 2 |
| `03` | `long_step_single_bank` | 1 |
| `04` | `step_short_or_long_double_bank` | 2 |

Footswitch selector (bytes `8..9`, from the full footswitch × mode sweep,
`captures/09_05/midi_20260905_215254.log`; all 5 modes observed per switch):

| bytes 8..9 | footswitch | observed CHK1..CHK2 (modes 0..4) |
|---|---|---|
| `02 5D` | A | `3A 02`, `38 02`, `36 02`, `34 02`, `32 02` |
| `02 7E` | B | `76 03`, `74 03`, `72 03`, `70 03`, `6E 03` |
| `02 1F` | C | `30 01`, `2E 01`, `2C 01`, `2A 01`, `28 01` |
| `02 40` | D | `6A 02`, `68 02`, `66 02`, `64 02`, `62 02` |

Within a footswitch, `CHK1` decrements by 2 per mode step; across switches
it jumps (selector-dependent). The remaining non-constant byte is index
`10` (`00`, `03`, `07`, `0A` — also per switch).

### 2e. Device mode select (op `49`, selector `02 00`) — SOLVED

Device mode (how the device operates as a whole — distinct from footswitch
mode; only one enabled at a time) uses the same 21-byte `49` frame but with
selector bytes `02 00` (vs the footswitch selectors above):

```
F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 <MODE> <CHK1> <CHK2> F7
```

Capture: 13 modes, one message each
(`captures/09_05/midi_20260905_232844.log`); `trace.py` labels these
`sw=device` + the mode name.

Mode byte `17`:

| value | device mode |
|---|---|
| `00` | `program_change_a` |
| `01` | `program_change_b` |
| `02` | `custom` |
| `03` | `advanced_custom` (granular footswitch/bank config) |
| `04` | `manufacturer_control` |
| `05` | `touch_screen_android` |
| `06` | `video_control` |
| `07` | `keyboard_a` |
| `08` | `keyboard_b` |
| `09` | `multimedia_keyboard` |
| `0A` | `custom_keyboard` |
| `0B` | `mix` |
| `0C` | `speaker` |

Checksums (mode → `CHK1 CHK2`): `74 03`, `72 03`, `70 03`, `6E 03`, …,
`5C 03` — `CHK1` decrements by 2 per mode step, `CHK2` stays `03`.

**Read-back** (solved 2026-09-07): the init `0D` chunk `(0,0,0)` byte 0
is the mode enum `0x00`–`0x0C` in the table order above (all 13 modes
captured; each differs from `advanced_custom` in exactly this byte).
`trace.decode_device_mode()` implements it (order = `choco.DEVICE_MODES`).

### 2f. TRS jack mode select (op `49`, selector `02 01`) — SOLVED

How the TRS socket reads (expression pedal vs raw MIDI), independent of
device / footswitch mode; one at a time. Same 21-byte `49` frame, selector
bytes `02 01`:

```
F0 00 32 09 49 00 00 00 02 01 00 00 00 10 00 00 00 <MODE> <CHK1> <CHK2> F7
```

Capture: both modes × 2 sweeps (`captures/09_05/midi_20260905_234141.log`).

| mode byte `17` | mode | checksum |
|---|---|---|
| `00` | `expression_pedal` | `72 03` |
| `01` | `trs_midi` | `70 03` |

`trace.py` labels these `sw=trs` + the mode name.

**Read-back** (solved 2026-09-07): chunk `(0,0,0)` byte 1 is `0x00` =
`expression_pedal`, `0x02` = `trs_midi` (NOTE: differs from the live
write codes `0x00`/`0x01` above). `trace.decode_trs_jack_mode()`.
Untouched across all 13 device-mode captures.

### 2g. TRS jack reverse-polarity (op `49`, selector `02 5A`) — SOLVED

Toggle for the TRS jack polarity reversal (same position on/off in the UI,
which is: off=dark #08251d, on=bright #33eab8). Same 21-byte `49` frame,
selector `02 5A`, offset `38`:

```
F0 00 32 09 49 00 00 00 02 5A 00 00 00 38 00 00 00 <STATE> <CHK1> <CHK2> F7
```

| byte 17 | meaning | checksum |
|---|---|---|
| `00` | ON (reversed) | `08 01` |
| `01` | OFF (normal) | `06 01` |

Note byte 17 is **inverted** relative to intuition: `00` = on. Capture:
`captures/09_05/midi_20260905_235754.log` (2 cycles, reproducible).
`trace.py` labels these `sw=trs-pol polarity=on|off`.

**Read-back: NOT PRESENT (2026-09-07).** Two init captures with
pixel-verified opposite polarity states (`camp_pol_off` /
`camp_pol_on`) are byte-identical across all 23 `0D` chunks — the
polarity toggle is write-only as far as the init read-back goes (writes
are ACKed; live `025A` traffic is the only wire source of truth).
Write-byte ambiguity note: pixel-verified toggles show on->off sends
`0x00`, off->on sends `0x01` — consistent with EITHER new-state
semantics (`00`=OFF) or old-state semantics (`00`=ON, as correlated in
2026-09-05); toggle sequences cannot decide. Kept `00`=ON per the
operator note. Decisive test: absolute amidi `025A` write + TRS signal
measurement.

Device → host ACK:

```
F0 00 32 01 08 00 00 00 00 7F 01 F7     (12 bytes, constant)
```

- `01` = device→host; `08` = "ack/response"; trailing `7F 01` = status.

---

## 3. Operations (opcodes)

| OP | name | len | observed meaning |
|---|---|---|---|
| `02` | write | 56 B | commit a config region change. Payload is **mostly zeros**; only nonzero byte observed is `04` (constant across all writes so far — meaning unknown) |
| `05` | erase | 111 B | clear a region/list. Payload mostly zeros + one `0A` at offset 14; sub-id `02 5E` |
| `40` | dump | 1190 B | one chunk of the full config blob. Sent as a sequence after every UI change |

**Dump sequence** (observed after every edit/add/erase):

```
app→: erase(05) | dump(40) off=0x00 | dump(40) off=0x08 | ... | dump(40) off=0x60 | write(02) off=0x68
pdl→: ACK after every message
```

- 13 dump chunks, offsets `0x00`…`0x60` stepping `0x08`; reconstructed blob
  ≈ 15 KB (1190 B × 13 is 15470 B; reconstruction measured 15288 B, so one
  chunk may be shorter or duplicated — not fully confirmed).
- The `write` offset `0x68` lies just past the dump region; its payload is a
  single nonzero byte `04` in every observed write (see unknowns §6.3).

---

## 4. Config blob layout & field encodings

The event list for the currently-viewed foot switch/bank lives at the *start*
of the blob (first ~0x40 bytes, i.e. inside chunk `off=0x00`).

### 4.1 Data2 (CC value / note velocity) — SOLVED

Stored in the slot's region at blob offsets `0x0B`/`0x0C` (slot 1 of the
currently-displayed foot switch/bank). Verified against a live sweep
(`captures/09_05/midi_20260905_230150.log`) for data2 = 1, 3, 4, 5, 16,
20, 80, 99 (8/8 matches):

```
lo = (v & 3) << 5        # low 2 bits of the value -> lo byte's top 2 bits
hi = 0x40 + (v >> 2)     # value // 4 -> hi byte's low 6 bits
value = ((hi - 0x40) << 2) | (lo >> 5)
```

| d2 | blob[0x0B] (lo) | blob[0x0C] (hi) |
|---|---|---|
| 1 | 28 | 40 |
| 3 | 68 | 40 |
| 4 | 08 | 41 |
| 5 | 28 | 41 |
| 16 | 08 | 44 |
| 20 | 08 | 45 |
| 80 | 08 | 54 |
| 99 | 68 | 58 |

Inverse is `trace.decode_d2(lo, hi)`.

### 4.2 Per-slot region (partial)

Each additional event appends a small field group near the start of the blob.
Consecutive slot edits (1 slot changed, others identical) touched only these
byte runs — i.e. a ~5–6 byte stride, offset within the region varies by slot:

```
slot 1: 0x0F-0x11        slot 6: 0x2B-0x2E
slot 2: 0x14, 0x16-0x17  slot 7: 0x31, 0x33
slot 3: 0x1A, 0x1C-0x1D  slot 8: 0x37-0x39
slot 4: 0x20-0x22        slot 9: 0x3C, 0x3E-0x3F
slot 5: 0x26-0x28
```

The exact per-field meaning of these bytes (type/channel/data1) is **not yet
decoded** (see §6.1).

### 4.3 `0D` config record — bank slot 1 (SOLVED, byte-exact)

From the `0D` init read-back (`000000` chunk, payload after the
`00 10 7E 00 00` marker), the **slot-1 record** of the displayed bank was
mapped by single-field-change diffs + a 10-random-capture verification
(`captures/09_06/midi_20260906_0138*.log`, all values across ch 1-16,
odd/even data1, all 4 types, random data2 — **10/10 decoded exactly**):

Bank A slot 1 (offsets within `000000` payload):

| offset | field | encoding |
|---|---|---|
| 108 | channel | `((ch−1) & 7) << 4` |
| 109 | type | `type_code \| ((ch−1) >> 3)` — type_code: `0x20`=cc, `0x40`=noteon, `0x60`=noteoff, `0x00`=pc; ch≥9 sets bit 0 |
| 110 | data1 LSB | `(data1 & 1) << 6` (odd data1) |
| 111 | data1 | `data1 >> 1` |
| 112 | data2 | plain byte (stale/unused for pc) |
| 1152…1153 | checksum | derived from config content; hard constraint (2026-09-07): byte 1153 = `0x2E − 2·(byte 0) − (byte 1)` over the 13 device modes × 2 TRS modes (byte 1154 constant `0x01`) — the tail covers the header bytes linearly |

Bank B slot 1 (offsets ~199–205, same chunk):

| offset | field | encoding |
|---|---|---|
| 200 | channel | `ch − 1` |
| 201 | type | `type_index << 1` (0=pc, 2=cc, 4=noteon, 6=noteoff) |
| 202 | data1 | `data1 << 2` |
| 203 | data2 | `data2 << 3` |
| 204 | data2 high bits | (0 for small values) |

`trace.decode_slot1(chunk, bank)` implements both;
`choco.read_bank_exact()` closes+reopens FootCtrlPlus under a capture,
rebuilds the chunk, and prints the decoded slot 1.

### 4.4 Extracted slot layouts (bank A `000000` + bank B) — partial

Continued diff experiments (captures `captures/09_06/midi_20260906_012*`,
`013*`): bank A slot records are variable-length, **not uniformly strided**, each
slot a different internal encoding:

| record | location | mapped fields |
|---|---|---|
| bank A slot 1 | @108–112 | complete (§4.3 above) |

> **BANK A SLOTS 2-7 SOLVED (2026-09-07):** value-spread campaign
> (`sweep_a_full.py`: s3-7 × d2{1..127} × d1{33..127} × ch16, 65 variants)
> + per-bit solver (`solve_bits.py`, ~117 samples/slot, mismatch-tolerant
> with dissenter reporting) + `rand_verify.py a 9` 10/10 random banks.
> Decoder: exact bit lists in `trace._A_SLOTS` assembled by `trace._x()`
> (no phantom/overlap bits). Verification: `verify_a.py` 20/20,
> `verify_a2.py` 48/48, `rand_verify a 9` 10/10, `solve_bits` zero
> dissenters. Along the way: legacy pc/d2 expectations fixed (device
> forces d2=0 for pc), one stale fill dropped (`camp_s6d2v2` slot 4),
> solver tie-breaks arbitrated by rand data (s2 ch-bit3/d2 → classic
> mapping; s6 d2-bit1 completed; s4 ch is 4-bit with type mask 0xFC).
> Residual caveats: s7 ch<9 unconfirmed (all samples ch>=9); C-A s10
> ch-b3/d2-b3 share a bit (exact on 10 samples, needs a spot-check).

| bank A slot 2 | @113–119 | **SOLVED**: ch-1 in 114 bits 2-5; type {0x00 pc, 0x08 cc, 0x10 noteon, 0x18 noteoff}; d1 = (116>>4)&7 \| ((117&0x0F)<<3); d2 = (117>>5)&3 \| ((118&0x3F)<<2) |
| bank A slot 3 | @119–125 | **SOLVED**: ch-1 plain @120 bits 0-3; type {0 pc, 2 cc, 4 noteon, 6 noteoff}; d1 = (122>>2)&0x1F \| ((123&3)<<5); d2 = (123>>3)&0x1F \| ((124&7)<<4) |
| bank A slot 4 | @125–130 | **SOLVED**: ch-1 4-bit (125:5-6, 126:0-1); type {0x00 pc, 0x40 cc} mask 0xFC — **pc/cc-ONLY** (combo has 2 entries; noteon/noteoff wrap to pc/cc, device-side); d1 plain @128; d2 = (129>>1)&0x3F \| ((130&1)<<6), stale/0 for pc |
| bank A slot 5 | @130–135 | **SOLVED** (agrees with original row, now high-bit verified to 127): ch-1 = (131>>3)&0x0F; type {0x00 pc, 0x10 cc, 0x20 noteon, 0x30 noteoff}; d1 = (133>>5)&3 \| ((134&0x3F)<<2); d2 = (134>>6)&1 \| ((135&0x3F)<<1) |
| bank A slot 6 | @136–141 | **SOLVED** (old row missed d2-bit1): ch-1 = (137>>1)&0x0F; type {0x00 pc, 0x04 cc, 0x08 noteon, 0x0C noteoff}; d1 = (139>>3)&0x0F \| ((140&7)<<4); d2 = (140>>4)&1 \| (141&1)<<1 \| ((140>>6)&1)<<2 \| ((141>>1)&1)<<3 \| ((141>>2)&1)<<4 \| ((141>>3)&1)<<5 \| ((140>>5)&1)<<6 |
| bank A slot 7 | @142–147 | **SOLVED**: ch-1 = (142>>6)&1 \| ((143&7)<<1), +1 (ch<9 unconfirmed); type {0x00 pc, 0x01 cc, 0x02 noteon, 0x03 noteoff}; d1 = (145>>1)&0x3F \| ((146&1)<<6); d2 = (146>>2)&0x1F \| ((147&3)<<5) |
| bank A slot 8 | @148–152 | **FULLY DECODED** (2026-09-06, extended 2026-09-07): ch-1 bits 0-2 @148:4-6 + bit3 @149:0, type_idx<<5 (0/32/64/96), (d1&1)<<6, d1>>1, d2 plain — verified on the a8 sweep (6 variants) + s8ch9/12/16 single-field fills |
| bank A slot 9 | @154–158 | **FULLY DECODED** (2026-09-06): (ch-1)<<2, type_idx<<3, (d1&7)<<4, (d1>>3)|((d2&3)<<5), 0x40|(d2>>2) — verified on the a9 sweep |
| bank A slot 10 | @160–164 | **FULLY DECODED** (2026-09-06): ch-1, type_idx<<1, (d1&0x1F)<<2, ((d2&0xF)<<3)\|(d1>>5), d2>>4 — verified on a10 sweep + d2 sweep (no 0x10 marker bit) |
| bank A slot 11 | @165–170 (format B, 6B) | **DECODED via reuse** (2026-09-07): ch b0-1 @165:5-6 + b2-3 @166:0-1; type (@166:6<<1)\|@167:0; d1 plain @168; d2 = ((@169&0x7F)\|((@170&1)<<7))>>1 |
| bank A slot 12 | @171–175 (format C, 5B) | **DECODED via reuse**: (ch-1)<<3 @171; type b0<<5\|b1<<4 @172; d1 = ((@173>>5)&3)\|((@174&0x1F)<<2); d2 = (@175<<1)\|((@174>>6)&1) |
| bank A slot 13 | @177–181 (format D, 5B) | **DECODED via reuse** (caveat: A-s6@176 also fits — needs a ch/type/d2 spot-check): (ch-1)<<1 @177; type<<2 @178 (inverted table); d1 = ((@179>>3)&0x0F)\|((@180&7)<<4); d2 = ((@181&0x0F)<<3)\|((@180>>4)&7); flag @176=0x01 |
| bank A slot 14 | @181–187 (A-s7 bits, 7B) | **DECODED via reuse**: ch = (@182>>6)\|((@183&7)<<1); type @184 (s7 table); d1 = ((@185>>1)&0x3F)\|((@186&1)<<6); d2 = ((@186>>2)&0x1F)\|((@187&3)<<5) — @181 shared with s13's last byte |
| bank A slot 15 | @188–192 (A-s8 row; B-F also fits) | **DECODED via reuse**: ch b0-2 @188:4-6 + b3 @189:0; type<<5 @189; d1 = ((@190>>6)\|(@191<<1)); d2 plain @192 |
| bank A slot 16 | @194–198 (A-s9 row; B-G also fits) | **DECODED via reuse**: (ch-1)<<2 @194; type<<3 @195; d1 = ((@196>>4)\|((@197&0x1F)<<3)); d2 = ((@198-0x40)<<2)\|(@197>>5); flag @193=0x02 |
| bank B slot 1 | @200–204 | @200 `ch−1`, @201 `type_index<<1` (0/2/4/6), @202 `(d1&0x1F)<<2`, @203 `(d2&0x0F)<<3 \| (d1>>5)`, @204 `0x10 \| (d2>>4)` (bit 4 optional in some read-backs) — **FULLY DECODED** (format A) |
| bank B slot 2 | @205–210 | **FULLY DECODED** (format B): @205 bits 5-6 = `(ch-1)` bits 0-1; @206 bits 0-1 = `(ch-1)` bits 2-3; type = `(@206 bit6 << 1) \| (@207 bit0)` (0=pc 1=noteon 2=cc 3=noteoff); @208 `d1` plain; @209 `(d2<<1) & 0x7F`; @210 bit 0 = `d2 >> 6` |
| bank B slot 3 | @211–215 | **FULLY DECODED** (format C): @211 `(ch-1)<<3`; @212 `(type bit0)<<5 \| (type bit1)<<4`; @213 `(d1&3)<<5`; @214 `(d1>>2) \| ((d2&1)<<6)`; @215 `d2>>1` |
| bank B slot 4 | @217–221 (@216 = 0x01 flag) | **FULLY DECODED** (format D, type table INVERTED: 0=pc 1=cc 2=noteon 3=noteoff): @217 `(ch-1)<<1`; @218 `type<<2`; @219 `(d1&0xF)<<3`; @220 bits 0-2 = `(d1>>4)&7` + bits 4-6 = `d2&7`; @221 `0x20 \| (d2>>3)` |
| bank B slot 5 | @222–227 | **FULLY DECODED** (format E, inverted type table): @222 bit 6 = `(ch-1)&1`, @223 `(ch-1)>>1`; @224 `type` (0=pc 1=cc 2=noteon 3=noteoff); @225 `(d1<<1)&0x7F`; @226 `((d2&0x1F)<<2) \| (d1>>6)`; @227 `0x08 \| (d2 bit5) \| ((d2 bit6)<<1)` |
| bank B slot 6 | @228–232 | **FULLY DECODED** (format F, inverted type table): @228 `(ch-1&7)<<4`; @229 bit 0 = `(ch-1)>>3`, bits 5-6 = type (LSB-first); @230 `(d1&1)<<6`; @231 `d1>>1`; @232 `d2` plain |
| bank B slot 7 | @234–238 (@233 = 0x02 flag) | **FULLY DECODED** (format G, standard type table): @234 `(ch-1)<<2`; @235 `(type bit0)<<4 \| (type bit1)<<3`; @236 `(d1&7)<<4`; @237 `((d2&7)<<5)&0x7F \| (d1>>3)`; @238 `0x40 \| (d2>>2)` |
| bank B slot 8 | @240–244 | **FULLY DECODED** — same layout as slot 1 (format A) |
| bank B slot 9 | @245–250 | **FULLY DECODED** — same layout as slot 2 (format B) |
| bank B slot 10 | @251–255 | **FULLY DECODED** — same layout as slot 3 (format C) |

> **BANK B FULLY SOLVED (2026-09-06):** all 10 bank B slots decode
> byte-exact. Record starts: 200, 205, 211, 217, 222, 228, 234, 240,
> 245, 251 (fixed offsets; each record has its own packing, formats A-G,
> with A/B/C repeating for slots 8/9/10). Verified: 8 known-state
> captures + 16 field-sweep captures (160 slots) + **10 freshly-filled
> random 10-slot banks (double-bank footswitch mode, seed 42) = 100/100
> slots byte-exact**. `trace.decode_b_slots()` implements all formats;
> `read-bank-exact b` decodes the live device (e.g. the current random
> bank reads back exactly). Empty slots (all-zero records) are skipped;
> an all-zero record is indistinguishable from a real ch1/pc/d1=0 slot.
> Unmapped constants: @197/@198 (0x00/0x40 marker bytes), @216 = 0x01
> and @233 = 0x02 (slot flags), @227 bit 3 = 0x08 (slot-5 flag).

> **⚠ PARSER BUG DISCOVERED (2026-09-06) — invalidates the earlier
> "bit-stream / shifts with content" conclusions.** All the offline analysis
> tools filtered out any payload byte valued `0x16` (a leftover "strip port
> id 16" hack) from the aseqdump hex. Since `0x16` is a legit MIDI byte
> (e.g. data1 = 22), every config containing one parsed SHORTER, silently
> shifting every subsequent byte and producing the phantom "byte alignment
> shifts with content" and "d1 vanished" effects. The device read-back is a
> FIXED 1155-byte chunk with FIXED offsets. Fixed in `analyze_captures.py`
> and every scratch tool; `read_bank_exact` never had the bug (it strips the
> port column, not byte values) so its `@199` bank-B decode was off by +1
> (it saw a truthful chunk) — corrected to `@200-204`.
>
> **Bank B slot 1/2 offsets above are RAW-PINNED** (located the literal
> `02 02 2c 08 12` and `16 58` byte runs in the raw SysEx) and verified
> byte-exact on the fixed parser: `trace.decode_b_slots()` decodes all 10
> slots (formats A-G above), `read-bank-exact b` prints them live.
>
> **Bank A slots 8-10 remain to be re-derived**: the spec rows above for
> s8-s10 were fit to buggy-shifted bytes (e.g. true s8 = @148-152 with d2
> PLAIN, not `d2>>3`+`(d2&7)<<1`). Slots 1-7 are unaffected (no matter where
> the `0x16`s were, the true parse never shifts) and still decode exactly.

**OCR flakiness confirmed (2026-09-06):** `read-bank` OCR misread bank B
slot 1 data2 88→38, slot 2 data1 19→13, and missed slot 3 entirely — the
OCR is the flaky component, not the `0D` decode (which is exact where the
layout is mapped).

**Footswitch regions and stored packing: SOLVED (2026-09-07), see §4.5.**
The viewed bank areas are view-relative (same offsets for every foot);
each foot's persistent bank data lives at fixed stored homes with a
foot-independent packing palette (per-slot formats, §4.5 table).

### 4.5 Footswitch stored regions — SOLVED (2026-09-07)

Two behaviors discovered via the anchor campaign (`anchor_feet.py`, 12
captures: BASE + HI per foot×bank):

1. **FootCtrlPlus resets to footswitch A on every open.** Every
   `camp2.py` capture (close + reopen) therefore views foot A. Foot
   switching is write-only for the harness: re-select before EVERY fill
   (`anchor_feet.py`/`rand_stored.py` do this; the first anchor attempt
   silently filled foot A and its logs were discarded). View-switch
   clicks emit zero MIDI (traced twice) — the init read loop is the only
   read path and always dumps the whole config.
2. **Viewed bank areas are view-relative** (`000000` @108+ bank A,
   @199+ bank B — same offsets for every foot), while each foot's
   persistent bank data lives at **fixed stored homes** with a
   foot-independent packing palette (proven: foot B and D stored HI
   records byte-identical; 6-point format matches across feet).

Stored homes (chunk addr, offset). Bank stride is 72 bytes:

| foot | bank A home | bank B home |
|---|---|---|
| A | viewed (0,0,0)@108 | viewed (0,0,0)@199 |
| B | (0,0,0)@~584 | (0,0,0)@~676 |
| C | (0,0,0)@~1055 | (113,7,0)@~0 |
| D | (113,7,0)@~384 | (113,7,0)@~476 |

Per-slot stored formats (from `fmt_search6.py` 6-point matches over
BASE + HI + 4 randoms per home, `s8f` = unified s8/fmtf/slot1 form):

| home | slot formats 1-10 |
|---|---|
| B-A | fmtd fmte s8f s9 s10a **bits** fmtc fmtd fmte s8f |
| B-B | s8f s9 s10a **bits** fmtc fmtd fmte s8f s9 **bits** |
| C-A | **bits** s5view fmtd fmte s8f s9 s10a **bits** fmtc **bits** |
| C-B | s10a **bits** fmtc fmtd fmte s8f s9 **bits** s10a fmtc |
| D-A | fmtd fmte s8f s9 s10a **bits** fmtc fmtd fmte s8f |
| D-B | s8f s9 s10a **bits** fmtc fmtd fmte s8f s9 **bits** |

**bits** = solved-by-solver slots (`solve_stored.py`, 10 samples each,
zero dissenters; `decode_stored.STORED_BITS`): near-universal record
`ch=[+0:5,+0:6,+1:0,+1:1], d1=plain@+3, d2=[+4:1-6,+5:0]`, type = standard
2-bit code `[(+1:6),(+2:0)]` pc=00 cc=10 noteon=01 noteoff=11 — except
bank-B slot 10 (B+D joint solve: ch plain @+1, d1=[+3:2-6,+4:0-1],
d2=[+4:3-6,+5:0-2], type [(+2:1),(+2:2)] standard) and C-A s1/s8/s10
(per-home fits). Per-foot divergences are real but mapped (e.g. C-A s2
= s5view vs B/D = fmte; C-B s6 = s8f vs fmtd; C-B s7 = s9 vs fmte) —
no full sweep needed, the per-home tables ARE the complete map.

Verification: `decode_stored.decode_home()` over all 60 B/C/D captures
(12 anchors + 48 stored randoms) = **599/600 slots exact** (1 documented
fill-side type miss: `camp_fDst_a_33_0` slot 2 holds cc, fill meant
noteon — 9 sibling samples confirm the code; decoder is right).
Residual caveats: C-A s10 ch-b3/d2-b3 share a bit (exact on 10,
needs a spot-check); unobserved type codes decode '?'.

> **BANK A SLOTS 11-16 DECODED via format reuse (2026-09-07):** a 16-slot
> bank (slot1=77, slots 6-11=60-110, slots 12-16=120-124, operator-scrolled
> bottom viewport + harness viewport-row clicks) read back via `0D`, and
> every known format was slid across @165-198: s11 = format B @165,
> s12 = format C @171, s13 = format D @177, s14 = A-s7 bits @181,
> s15 = A-s8 row @188, s16 = A-s9 row @194 — each EXACT on its
> distinctive d1 (110,120,121,122,123,124, ch1/pc/d2=0) using the
> authoritative `trace._fmt_*`/`_A_SLOTS` implementations. Pattern: slots
> 11-13 reuse bank-B formats B/C/D, slots 14-16 reuse bank-A s7/s8/s9.
> `trace.decode_bank_a_slots` now returns all 16; `read-bank-exact a`
> verified 16/16 live (77,0,0,0,0,60,70,80,90,100,110,120-124).
> Caveats: single-sample assignments (ch/type/d2 variation untested for
> 11-16; the bit positions themselves are fully solved elsewhere);
> s13/s15/s16 have dual fits (A-s6/B-D, A-s8/B-F, A-s9/B-G — near-identical
> formats, need ch/type/d2 spot-checks); `remove-all` does NOT clear
> @165+ (stale bytes from older 16-slot states linger — this is how the
> first marker round was misread: it edited bottom-viewport slots 11-16
> while the analysis assumed top).

### 4.6 Bank capacity — 16 slots max (2026-09-07)

| property | value |
|---|---|
| max slots per bank | 16 |
| 17th Add (operator-observed, no wire recon) | UI still accepts the click — the Add button stays enabled — but adds nothing: no 17th row appears and the scrollbar slider size does not change |
| harness gate | `choco.MAX_SLOTS = 16`; `add --count N` refuses (exit 1, no click) when N ≥ 16, `open-edit` / `set-message` refuse event index ≥ 16; `camp2.fill` passes `--count` and refuses fills longer than 16 |

At 12+ slots a scrollbar appears (up arrow, slider, down arrow); slots
12-16 edit-button positions are unmapped — see Task 2.

#### Scrollbar geometry + scroll failure (2026-09-07 recon, bank A)

Measured in frame pixels (= `xdotool --window` click coords = screenshot
pixels; the `import -window` shot is the 1267x896 frame, client origin
≈ (+3, +29)):

| element | geometry |
|---|---|
| list rows | 11 visible, 19px pitch, first-row text y ~640-658, list y ~636-852 |
| gutter | x 864-880 (center ~872) |
| up-arrow button | y ~612-629 (glyph triangle ~619-621) |
| track | y ~630-831 |
| thumb (16 slots, top) | y ~660-711 |
| down-arrow button | y ~832-849 (glyph triangle ~840-842) |

**Scrolling works synthetically via a single track click just above the
down arrow (874,829) — operator-confirmed, then harness-verified
2026-09-07.** One click pages a 16-slot list from top straight to the
bottom (slots 6-16); idempotent (no-op when already there). Earlier
"~18 failures" were partly input-dead tests (screen-control permission
expired mid-session) and partly wrong coords (872,814 is a dead zone;
874,829 just above the arrow button is the spot). What still does NOT
work: page-up clicks (665/720, likely landing on the stuck-rendered
thumb), up/down-arrow clicks (pressed state only), thumb drags, wheel
(up to 20 ticks), End/Page_Down/Down/F6, Tab-focus+keys. The scrollbar
thumb position is MEANINGLESS (seen at bottom on fresh opens showing
slots 1-11); verify scroll state by row contents (markers), never the
thumb. To return to the top: close + reopen FootCtrlPlus (page-up has
no working primitive). Harness: `scroll-to-bottom` command (bank A
only — bank B's scrollbar offset is unmeasured) + `--view-start`
viewport mapping (bank B bottom fills refused until measured). What DOES
also work: row click selects (white band x 595-866), hover highlights
the hovered row. Tab order is a 16-cycle reaching Import + the bank-B
list, never bank-A Edit buttons. The window is fixed-size (1267x896;
`wmctrl -e` resize refused) on the 1920x1080 screen.

Viewport-offset harness model (the Edit buttons are PER-VIEWPORT-ROW,
not per-slot — proven: the same 11 button coords address slots 1-11 at
top and slots 6-16 at bottom): `open-edit` / `set-message` take the
ABSOLUTE slot index plus `--view-start` (0 = top, 5 = bottom;
viewport row = slot − view_start); `scroll-to-bottom` pages down
synthetically (bank A only); close + reopen returns to the top.
`camp2.fill` supports two-phase fills (`fresh=False` + 11 viewport msgs,
auto-scrolls). `read-bank` needs no change for scrolled views (same
OCR region, rows repaint in place). Repaint caveat: the top viewport
row can go stale (keeps showing old slot-1 content after scrolling —
identify viewports by markers, and distrust row 0).

#### Slots 11-16 protocol: SOLVED via reuse (2026-09-07 — supersedes the 2-sample note below)

See §4.4 table + the §4.5 box: s11=B-B@165, s12=B-C@171, s13=B-D@177,
s14=A-s7@181, s15=A-s8@188, s16=A-s9@194; `decode_bank_a_slots` returns
all 16, `read-bank-exact a` gated 16/16 live. Captures:
`2026-09-07_task2_16slot_readback` (defaults + stale @165+),
`2026-09-07_task2_slot11_prot` (markers), `2026-09-07_task2_slot12_edit`
+ `2026-09-07_task2_slots13_16_edit` (per-edit page writes),
`2026-09-07_task2_16slot_final` (16-slot gate read-back).

Original 2-sample note (kept for the record):

Records live at chunk `000000` @165-198 (nonzero, denser than slots
1-10). Two samples: 16 defaults (`2026-09-07_task2_16slot_readback`)
vs slot1=77 + slots 6-11=60/70/80/90/100/110
(`2026-09-07_task2_slot11_prot`, all verified via `read-bank-exact`).
The ONLY bank-A byte that changes with slot 11's d1 (0→110) is @168
(`0x3C`→`0x6E`); slots 1-10 diffs hit their known records exactly
(@110-111, @139-140, @145-146, @151, @156-157, @162-163). Separately,
bytes @194-198 read `00 00 60 0D 40` — a byte-exact slot-9-format
encoding of (ch1, pc, d1=110) — but slot 11's record offset is
unresolved (@165 vs @194; @165-193 dense). Slots 12-16 (all defaults)
are unmapped. A spread campaign needs UI edits of slots 12-16 →
blocked on scrolling (above).

Write-path note: the first marker attempt (6x `set-message`, no MIDI
listener attached, 1s spacing) showed values in the UI but never
reached the device; the retry (listener attached via `record`, 3s
spacing) stuck fully (13 page-writes/edit on the wire, read-back
exact). Hypothesis: keep a subscriber attached during fills (the known
Wine-buffering caveat) — or pace. Unconfirmed which factor mattered.

### 4.7 `.FCP` preset files — SOLVED (2026-09-07)

FootCtrlPlus Export/Import preset (`.FCP`, in the Bottles prefix
`drive_c/users/maja/Documents`). Fixed size **23646 bytes**: a fixed
template with per-foot bank regions and a few global bytes. Generator:
`tools/gen_fcp.py spec.json out.fcp` (template + field writes; spec
reuses `MidiMessage` fields). Gate files: `tools/gate1.json` (rich
banks, all double-bank) and `tools/gate2.json` (mixed foot modes).

| offset | field | encoding |
|---|---|---|
| foot regions | A@95, B@512, C@929, D@1346 (stride 417, 417B each) | bank A records at +0, bank B records at +80 (16 × 5B each) |
| slot record (5B) | `[ch-1, type, d1, d2, flag]` | type 0=pc,1=cc,2=noteon,3=noteoff; all plain bytes (NOT bit-packed like the `0D` chunk!) |
| flag | `01` iff another slot follows (`i < count-1`), `00` for the last slot; rec15 byte always `01` | import reads while-`01`-plus-one, cap 16 (proven: 2-slot file imports as 2 rows) |
| @0 | device mode | `0x00`-`0x0C` (program_a, program_b, custom, advanced, manuf, touch, video, kbd_a, kbd_b, multi-kbd, custom-kbd, mix, speaker) — 1 byte each, verified |
| @1 | TRS jack mode | 0=expression, 1=midi |
| @93 + per-foot @region-2 (B@510, C@927, D@1344) | footswitch mode | `0x00`-`0x04` (single1, double1, press, long1, stepshortlong); per-foot confirmed (mixed-mode import sticks per foot); @93 mirrors the viewed foot |
| @23642 | TRS reverse-polarity | 0=normal, 1=reversed |
| rest (~22KB) | fixed template | byte-identical across all exports |

Not stored: the selected foot (exports differ only in foot data).
Empty slots: `[0,0,0,0,flag]` (import skips nothing — flags set count).

Import semantics (gate-proven): generated FCP → GUI import →
`read-bank-exact` + mode/`get` detectors match EXACTLY (gate1: 16+10
foot-A slots, 4+3/4+3/4+3 B/C/D slots incl. ch16/d127/all types +
device/TRS/polarity/all-foot-modes; gate2: mixed per-foot modes +
banks). **Import needs ~60-90s settle before close/reopen** (async
write queue; an early reopen reads back stale feet — this initially
masqueraded as "import skips B/C/D").

**App-model staleness warning (2026-09-07):** GUI fills update the
device + visible list but NOT the app's per-foot bank model; the next
fill's full-config page writes flush STALE unviewed feet to the device
(proven: foot-B [41,42] wiped by a later foot-C fill; foot-A always
survives because it stays viewed/fresh). RULE: never fill feet
sequentially via GUI without re-verifying — **use FCP import for
multi-foot writes** (single atomic write, no staleness).

**Relation to the page-write checksum task:** FCP import is a working
alternate write path around the unsolved `09 41 40` checksum — it
writes arbitrary full configs (all feet/banks/modes) with no checksum
to solve. Direct page writes remain unsolved; prefer import.

---

## 5. Checksum

### SOLVED — 14-bit complement sum for the small SysEx families (2026-09-06)

For the short configuration messages (`01 08` ACK, `09 49` modes, `0D`
read requests/responses), the two bytes before `F7` are a **little-endian
14-bit two's-complement checksum**:

    X  = K - (sum of bytes from immediately after F0 .. byte before chk)   (mod 2^14)
    chk0 = X & 0x7F ; chk1 = (X >> 7) & 0x7F      (sent as low, high)

Family constants K (empirically derived, verified on the corpus):

| family | K |
|---|---|
| `01 08` ACK | `0x13A` |
| `09 49` config, selector 0x00 | `0x28A` |
| `09 49` config, selector 0x1F (fs C) | `0x18B` |
| `09 49` config, selector 0x7E (fs B) / fs D | `0x38B` |
| `09 49` config, selector 0x57/0x5A (groups/polarity) | `0x20B` |
| `0D` (read req + `0D 49` response) | still open (no standard sum fits — see below) |

Verified **bit-perfect**: 5224/5224 ACKs, and 1930/1935 `09 49` messages
(the 5 mismatches were the spec's earlier wrong guess for the fs-D
selector `40 0A` — it uses `0x28A`, not `0x38B`).

### PARTIALLY SOLVED — `09 41 40` model cracked, full mapping open (2026-09-07)

The 1175-byte page writes (`09 41 40`) use **X = K − 4·S (mod 2¹⁴)**
with S a bit-weighted sum plus joint terms — found after the standard
families failed (K−S 0/2376, CRC-16 ×20 0/936, 32768-poly scan, hashes).
Dataset: 3600+ `(payload, X)` pairs harvested from all captures
(`tools/harvest_pages.py` → `/tmp/pagepairs.pkl`; GUI-edit domain
### SOLVED — `09 41 40` page-write checksum (2026-09-07)

**Model: X = K − 4·S (mod 2¹⁴)**, S a bit-weighted sum plus joint
terms — **gate-proven by a live crafted write** (`tools/gate_write.py`:
23/23 pages ACKed, device slot 6 reads d1=51 exactly as computed).

How it was cracked (after K−S 0/2376, CRC-16 ×20 0/936, 32768-poly
scan, hash families all failed): 3600+ `(payload, X)` pairs harvested
from all captures (`tools/harvest_pages.py`; GUI domain `(02,5D)` +
import domain `(02,00)`; only off0 ∈ {0,8} pages vary). Key findings:

- ALL pair ΔX divisible by 4; X ∈ [8,1004] (no mod wrap).
- 60+ single-bit flips fit S = ±2^e (bit exponents e ≤ 11); 37 solved
  by propagation (`tools/solve_chexp.py`: seeds + union-find + k≤3
  unique decomposition), 0 conflicts on 400+ checkable pairs.
- **Interactions**: flipping the same bit gives different ΔX by
  background (pos-145: +32 vs −224) — S has joint (multi-bit) terms.
- **Joint-table method** (the solver): grid-map each interacting byte
group (4×4 grid LOOCV-exact; full 32-point table for the slot-6-d1
  group at page bytes 144/145); predict ΔX from the table, no K needed
  (K cancels in deltas).
- **Gate**: modified one page of a captured 23-page import sequence
  (slot-6 d1 bits via bytes (144,145) = (24,3), X=44 from the table),
  sent all 23 via `aseqsend` (ALSA sequencer — Wine holds the raw MIDI
  port exclusively, so `amidi` direct is unusable while CubeSuite runs),
  23/23 ACKed, `read-bank-exact` confirms slot 6 d1 == 51.

Tools: `harvest_pages.py`, `solve_checksum.py`, `solve_chexp.py`,
`gen_rand_fcp.py` (random/chain/bit-sweep/grid FCPs), `camp_import.py`
(import-capture loop), `gate_write.py` (crafted-write gate).
Residual: K value (unneeded — delta method cancels it), full joint
tables per group (only slot-6-d1 mapped; same grid method extends),
`0D 49` tail checksum untested vs this model.

Superseded note (2026-09-06): arbitrary page writes are NOT yet possible
via direct writes; verbatim replay works (ACKs, sets state).

---

## 6. NOT KNOWN — open questions (equal weight to the above)

### 6.1 Channel / Data1 / message-type encodings: unknown
We can *make* the GUI write any (type, channel, data1, data2) and we know
*where* the slot bytes land, but the mapping from value → bytes is not
decoded. Data2 is the only field cracked.

*Experiment:* value sweeps, one field at a time (channel 1..16 with type/data
fixed; then data1; then type; then slot index), diffing consecutive cycles —
exactly what cracked data2.

### 6.2 Checksum algorithm: unknown
Not XOR-sum-of-payload, not obviously additive (high byte varies). Need
pairs of (payload, checksum) with the same checksum region across contents.

*Experiment:* collect ≥20 (payload, 2-byte chk) samples from `--raw`
captures; test CRC-16 variants, Fletcher, additive-with-carry, 2-byte
xor/wrap. A correct algorithm is required before *injecting* messages.

### 6.3 `write(02)` payload: `04` — what is it?
Nonzero byte is `0x04` in every observed write (slot 1 add AND slot-N edits),
so it is probably *not* the slot index. Candidates: page/count/dirty flag/
region id. The offset byte `0x68` may be the region being committed.

*Experiment:* edit slot 2 only; edit a foot switch page; watch for the byte
changing.

### 6.4 Full blob layout: banks & foot switches — SOLVED (2026-09-07)

Mapped (see §4.5): the viewed bank areas are view-relative (foot A @108+
bank A / @199+ bank B after every reopen, which resets to foot A), and
each foot's persistent bank data lives at fixed stored homes (table in
§4.5, 72-byte bank stride) decoded by `decode_stored.decode_home()`.
The +350 px UI bank shift has no wire counterpart — both banks' viewed
records sit at fixed offsets regardless of foot.

### 6.5 Device outbound (button presses)
Pressing the pedal with N mapped PC events emitted N × `Program change 0,
program 0` (`C0 00`) — the eval of *mapped* events. Not yet verified: CC /
note messages, bank selection on the device, or unsolicited traffic when the
editor is idle/open.

### 6.6 Misc small unknowns
- The `0A` byte at offset 14 of the `erase(05)` payload.
- Sub-ids `02 5D` vs `02 5E`: erase uses `5E`, dump/write use `5D` — likely a
  "clear" vs "read/write" region selector, not confirmed.
- `System` `Announce` (ALSA port `0:1`) traffic was never examined.

---

## 7. Tooling recap for future experiments

```sh
python3 trace.py                          # live decode (taps both ports itself)
python3 trace.py --raw                    # ... with full hex
python3 trace.py captures/09_05/xxx.log   # offline re-analysis of an archive
python3 choco.py set-message cc 5 64 80 --bank b   # drive a specific config
python3 tools/sweep_a_full.py              # bank-A s3-7 value-spread campaign (writes /tmp/ba_map.json)
python3 tools/anchor_feet.py [b c d]       # B/C/D BASE+HI anchors (per-variant foot re-select!)
python3 tools/device_mode_sweep.py        # 13 device modes + TRS + polarity init captures
python3 tools/rand_stored.py <foot> <bank> <seed> <n>  # stored-region random banks
python3 tools/solve_bits.py [slots]        # viewed s2-7 per-bit solver
python3 tools/solve_stored.py              # stored-slot solver (10 missing homes)
python3 tools/fmt_search6.py               # 6-point stored format matcher
python3 tools/verify_a.py / verify_a2.py / verify_b.py  # offline regression gates
python3 tools/rand_verify.py a <seed>      # 10 random banks, live gate (slot 4 = pc/cc only)
```

Conventions: app-> = host→device (green in tty), pdl-> = device→host
(yellow). `record()` archives under `captures/<MM_DD>/` with a self-describing
header.