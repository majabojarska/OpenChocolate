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

Stored in bytes `0x0B`/`0x0C` of the config region. Verified for d2 = 1..16
(16/16 matches) plus d2 = 99 and 80 round-trips:

```
n   = d2 - 1
lo  = (0x20, 0x40, 0x60, 0x00)[n & 3]        # 0x20 * ((n % 4) + 1), wraps
hi  = 0x40 + (d2 >> 2)
```

| d2 | lo | hi | | d2 | lo | hi |
|---|---|---|---|---|---|---|
| 1 | 20 | 40 | | 9 | 20 | 42 |
| 2 | 40 | 40 | | 10 | 40 | 42 |
| 3 | 60 | 40 | | 16 | 00 | 44 |

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