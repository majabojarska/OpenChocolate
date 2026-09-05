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
  single nonzero byte `04` in every observed write (see unknowns §6.4).

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
decoded** (see §6.2).

---

## 5. Checksum

- Two bytes before `F7` (`CHK1 CHK2`) vary per chunk **and** per session with
  identical UI actions — i.e. data-dependent, not a counter.
- Identical payload → identical checksum (the `write(02)` for "add one event"
  and the `erase` are byte-identical every time, including their checksum),
  so it is a deterministic function of the payload.
- Observed (chunk `off=0x00`, different contents): `6C 01`, `68 01`, `64 01`,
  `60 01`, `5C 01`, `30 01` … — low byte tracks payload, high byte mostly
  fixed per content set. Algorithm **unknown** (see §6.3).

---

## 6. NOT KNOWN — open questions (equal weight to the above)

### 6.1 Init handshake: never captured
The user-model says: app sends a discovery ping on connect; pedal replies;
app then requests a full config dump. **We have never observed the ping /
response.** All our dumps were triggered by UI actions. The dumps we see on
`start-foot-ctrl-plus` were never cleanly captured (the editor window was
closed/relaunched mid-experiment).

*Experiment:* put `record()` (or `trace.py`) running, cold-start the editor
via `start-foot-ctrl-plus`, and capture from before the window appears.

### 6.2 Channel / Data1 / message-type encodings: unknown
We can *make* the GUI write any (type, channel, data1, data2) and we know
*where* the slot bytes land, but the mapping from value → bytes is not
decoded. Data2 is the only field cracked.

*Experiment:* value sweeps, one field at a time (channel 1..16 with type/data
fixed; then data1; then type; then slot index), diffing consecutive cycles —
exactly what cracked data2.

### 6.3 Checksum algorithm: unknown
Not XOR-sum-of-payload, not obviously additive (high byte varies). Need
pairs of (payload, checksum) with the same checksum region across contents.

*Experiment:* collect ≥20 (payload, 2-byte chk) samples from `--raw`
captures; test CRC-16 variants, Fletcher, additive-with-carry, 2-byte
xor/wrap. A correct algorithm is required before *injecting* messages.

### 6.4 `write(02)` payload: `04` — what is it?
Nonzero byte is `0x04` in every observed write (slot 1 add AND slot-N edits),
so it is probably *not* the slot index. Candidates: page/count/dirty flag/
region id. The offset byte `0x68` may be the region being committed.

*Experiment:* edit slot 2 only; edit a foot switch page; watch for the byte
changing.

### 6.5 Full blob layout: banks & foot switches
We only mapped the current view (foot switch A, bank A). Where do banks A/B
and foot switches B/C/D live in the blob? The +350 px UI shift for bank B
suggests two side-by-side pages, but the wire layout is unknown.

*Experiment:* diff blob images across (foot switch × bank) with `--raw` —
pattern from the 10-slot demo applies.

### 6.6 Device outbound (button presses)
Pressing the pedal with N mapped PC events emitted N × `Program change 0,
program 0` (`C0 00`) — the eval of *mapped* events. Not yet verified: CC /
note messages, bank selection on the device, or unsolicited traffic when the
editor is idle/open.

### 6.7 Misc small unknowns
- The `0A` byte at offset 14 of the `erase(05)` payload.
- Sub-ids `02 5D` vs `02 5E`: erase uses `5E`, dump/write use `5D` — likely a
  "clear" vs "read/write" region selector, not confirmed.
- Whether the app ever *reads* from the device outside this dump flow
  (e.g. on startup) — we only ever saw app→device pushes.
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