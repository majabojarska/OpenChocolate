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
| 1152…1153 | checksum | derived from config content |

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
| bank A slot 2 | @113–119 | @114 ch `(ch−1)<<2`, @115 type (0x08 cc / 0x10 noteon), @116 `(d1&7)<<4`, @117 `((d2&3)<<5)|(d1>>3)`, @118 `0x40+(d2>>2)` |
| bank A slot 3 | @119–125 | @120 `ch−1`, @121 `type_index<<1`, @122 `(d1&0x1F)<<2`, @123 `((d2&0x1F)<<3)|(d1>>5)`, @124 `(d2>>5)` high bits — **fully decoded** (verified noteoff ch8/55/77, cc ch5/70/110) |
| bank A slot 4 | @125–130 (5-slot) | @125 `(ch-1)<<5`, @126 `type|((ch-1)<<5>>7)`, @128 `d1` plain, @129 `(d2&0x3F)<<1`, @130 `((d2>>6)<<2)|1` — **fully decoded** |
| bank A slot 5 | @130–135 (5-slot) | @131 `(ch-1)<<3`, @132 type (0x10 cc/0x20 noteon), @133 `(d1&3)<<5`, @134 `(d1>>2)|((d2&1)<<6)`, @135 `d2>>1` — **fully decoded** |
| bank A slots 6-10 | @136+ (10-slot) | 5-byte records, each a different dense packing — **all decoded**: s6 @137 `(ch-1)<<1`/@138 type/@139 `(d1&7)<<3`/@140 `(d1>>4)|((d2&1)<<4)|((d2&4)<<4)`/@141 `(d2>>3)|0x20`; s7 @142 `(ch-9)<<6`/@144 type/@145 `(d1&0x3F)<<1`/@146 `(d2&0x1F)<<2`/@147 `(d2>>5)|8`; s8 @148 `(ch-1)<<4`/@149 type/@150 `(d1&1)<<6`/@151 `d1>>1`/@152 `d2>>3`/@153 `(d2&7)<<1`; s9 @153 `(ch-1)<<2`/@154 type/@155 `(d1&7)<<4`/@156 `(d1>>3)|(d2<<5)`; s10 @159 `ch-1`/@160 type/@161 `(d1&0x1F)<<2`/@162 `(d2&0x0F)<<3|(d1>>5)`/@163 `(d2>>4)|6` |
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

**Footswitch regions** (same `000000` chunk, per-footswitch offsets):
footswitch A ~@108–300, footswitch B ~@585+. Each footswitch has its own
region with its own record layout; same diff technique applies per region.

---

## 5. Checksum

- Two bytes before `F7` (`CHK1 CHK2`) vary per chunk **and** per session with
  identical UI actions — i.e. data-dependent, not a counter.
- Identical payload → identical checksum (the `write(02)` for "add one event"
  and the `erase` are byte-identical every time, including their checksum),
  so it is a deterministic function of the payload.
- Observed (chunk `off=0x00`, different contents): `6C 01`, `68 01`, `64 01`,
  `60 01`, `5C 01`, `30 01` … — low byte tracks payload, high byte mostly
  fixed per content set. Algorithm **unknown** (see §6.2).

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

### 6.4 Full blob layout: banks & foot switches
We only mapped the current view (foot switch A, bank A). Where do banks A/B
and foot switches B/C/D live in the blob? The +350 px UI shift for bank B
suggests two side-by-side pages, but the wire layout is unknown.

*Experiment:* diff blob images across (foot switch × bank) with `--raw` —
pattern from the 10-slot demo applies.

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
```

Conventions: app-> = host→device (green in tty), pdl-> = device→host
(yellow). `record()` archives under `captures/<MM_DD>/` with a self-describing
header.