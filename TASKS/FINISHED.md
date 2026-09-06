# FINISHED.md

Completed tasks are listed here, most recent first.

## Task — Bank B multi-slot mapping (2026-09-06, night checkpoint)

- **Bank B slot 1 fully decoded & verified** (true 1-slot and 2-slot
  banks): @199 `ch-1`, @200 `typeidx<<1`, @201 `(d1&0x1F)<<2`,
  @202 `(d2&0xF)<<3|(d1>>5)`, @203 `0x10|(d2>>4)` — 23/25 captures
  exact (2 misses = stale first-read-backs). `decode_slot1(chunk,"b")`
  updated; `decode_b_slots()` returns slot 1.
- **Bank B slots 2+**: continuously-interleaved bit-stream, byte
  alignment shifts with content (partial observations: d1 plain,
  d2<<1, ch bits @204<<5/@205 carry, type bits @205-bit6/@206-bit0).
  Not reliably decodable from fixed offsets — needs the firmware
  stream algorithm. Documented in spec §4.4.
- ~30 captures this session (023150-024626) archived in
  `captures/09_06/`; probe tables in /tmp/b*.json.

## Task — Map `0D` register-read — bank A 10 slots decoded (2026-09-06)

- **All 10 bank A slots decoded** (dense 5-byte records, each slot a
  different packing, verified 9/10 byte-exact on the 10-slot capture;
  the single "X" was pc's stale-data2 byte):
  - s1 @108-112, s2 @113-119, s3 @119-125, s4 @125-130, s5 @130-135
  - s6 @137-141, s7 @142-147, s8 @148-153, s9 @153-156, s10 @159-163
  (full encodings in spec §4.4; `trace.decode_bank_a_slots()` returns 10).
- **Bank B multi-slot** conclusion: continuously-encoded bit-stream with
  values spilling across byte boundaries (d2 changes shift @199 and later
  bytes) — NO fixed per-slot offsets. This explains the earlier "digits
  2/0 decode flakily" confusion: stream offsets depend on all preceding
  values. Bank B 1-slot is decodable (@200 ch-1 etc.); multi-slot needs a
  stream decoder, not fixed offsets.

## Task — Map `0D` register-read — slots 6-10 attempt (2026-09-06)

- **Slot 6** (10-slot layout, @136+): ch/type/d1 partially decoded (@137
  `(ch-1)<<1`, @138 type 0x04/0x08, @139 `(d1&7)<<3`); d2 and d1's high
  bits are interleaved in @140/@141 (dense packing, unresolved).
- Slots 7-10: 5-byte records present at @141+ but unmapped.
- **Bank B multi-slot**: 3-slot records @200-214 + mirror @675+, dense
  packing differs from 1-slot (partial).
- Consolidation: bank A slots 1-5 are fully exact; 6+ need the same
  per-field diff cycle. Spec §4.4 updated.

## Task — Map `0D` register-read — bank A slots 4-5 + 10-slot (2026-09-06)

- **Bank A slots 4-5 fully decoded** (5-slot layout):
  - slot4 @125-130: @125 `(ch-1)<<5`, @126 `type|carry`, @128 d1 plain,
    @129 `(d2&0x3F)<<1`, @130 `((d2>>6)<<2)|1`.
  - slot5 @130-135: @131 `(ch-1)<<3`, @132 type (0x10 cc/0x20 noteon),
    @133 `(d1&3)<<5`, @134 `(d1>>2)|((d2&1)<<6)`, @135 `d2>>1`.
  - Verified exact on the 5-slot capture (all 5 slots decode correctly).
- **10-slot bank A**: slots 1-5 decode exactly at their offsets; slots
  6-10 are a dense 5-byte-record stream at @136+ (partial: ch-1<<1, type,
  d1, d2>>6 observed).
- **Bank B multi-slot**: records at @200-214 (5-byte each, 3-slot case) +
  a mirror at @675+; encoding differs from the 1-slot case (dense
  packing) — partial.
- Spec §4.4 updated.

## Task — Map `0D` register-read to bank contents — 5-slot mapping (2026-09-06)

- **Bank A slots 1-3 fully decoded and verified exact** in both 3-slot
  and 5-slot banks (offsets stable for the first 3 records):
  - slot1: @108-112 (ch<<4|type|d1 LSB|d1>>1|d2)
  - slot2: @113-119 (ch<<2, type, packed d1/d2)
  - slot3: @119-125 — **completed**: @122 `(d1&0x1F)<<2`,
    @123 `((d2&0x1F)<<3)|(d1>>5)`, @124 `(d2>>5)` high bits (verified
    noteoff ch8/55/77, cc ch5/70/110).
- **Bank A slots 4-5** (5-slot layout): slot4 d1 plain @128; slot5
  `d1>>2`/`d2>>1` observed (ch/type + exact offsets pending).
- `trace.decode_bank_a_slots()` decodes slots 1-3 (exact) + 4-5 (partial).
- Spec §4.4 updated.

## Task — 3-per-bank run + OCR-flakiness check (2026-09-06)

- Filled bank A + bank B with 3 items each (values avoiding digits 2/0).
- **Confirmed the operator's hypothesis: OCR is the flaky component.**
  `read-bank` misread bank B slot 1 data2 88→38, slot 2 data1 19→13, and
  missed slot 3 entirely (2 runs, consistent wrong values).
- The `0D` decode is exact where mapped: bank A slots 1-3 decoded
  perfectly (ch4 cc 17 55 / ch6 noteon 31 99 / ch8 noteoff 55 77).
- **Bank B multi-slot layout is non-contiguous**: slot 1 @~200, slots 2+
  @~676+ (dense bit-packed; changing slot-2 data2 64→65 rewrote a 5-byte
  block @682-686). The 1-slot offsets don't generalize. Recorded in spec
  §4.4.

## Task — Map `0D` register-read to bank contents — completed for slot 1 (2026-09-06)

### Byte-exact slot-1 decoding (both banks) — SOLVED, 10/10 random verified

- **Bank A slot 1** record (000000 chunk) fully bit-decoded: @108
  `((ch-1)&7)<<4`, @109 `type_code|((ch-1)>>3)` (ch>=9 bit), @110
  `(d1&1)<<6`, @111 `d1>>1`, @112 `d2` plain, @1152-53 checksum.
- **Bank B slot 1** (~@199-205): @200 `ch-1`, @201 `type_index<<1`,
  @202 `d1<<2`, @203 `d2<<3`, @204 high bits.
- **10-capture random verification** (double-bank mode in effect): random
  ch 1-16 / odd+even data1 / all 4 types / random data2 — 10/10 decoded
  EXACTLY (caught + fixed the ch>=9 wrap and odd-data1 LSB spill).
- `trace.decode_slot1(chunk, bank)` + `choco.read-bank-exact` verified
  live both banks. Spec §4.3 rewritten.

### Other layouts extracted (recorded in spec §4.4)

- bank A slot 2 @113-119 (ch<<2, type 0x08/0x10, packed d1/d2 across
  @116-118), slot 3 @120-124 (ch-1, typeidx<<1, (d1&0x1F)<<2,
  (d2<<3|2), (d2>>5)<<1)
- bank B slot 2 @204-209 (d1 plain@208, d2<<1@209; ch/type packed
  @205-207 partial)
- **footswitch regions**: A ~@108-300, B ~@585+ (same 000000 chunk;
  per-footswitch layout; region-specific re-mapping needed for C/D)
- Shared white-marker/slot logic + bank-aware `set_message` logging

### Remaining (recorded, lower priority)

- bank B slot 2 ch/type packing, bank B slots 3+, footswitch C/D regions,
  bank A slot 3 d1>=32 high bits. Same change-one-field-diff technique.

## Task — Map `0D` register-read to bank contents — continuation (2026-09-06)

- **Bank A slot layouts** extracted (single-field diffs, captures
  `captures/09_06/midi_20260906_012*`):
  - slot 1: @108 (ch−1)<<4, @109 type (0x20/0x40/0x60/0x00), @111 d1>>1,
    @112 d2 plain.
  - slot 2: @114 (ch−1)<<2, @115 type (0x08 cc/0x10 noteon),
    @116 (d1&7)<<4, @117 ((d2&3)<<5)|(d1>>3), @118 0x40+(d2>>2) (verified
    by d1=60/61/62/63/65 sweep).
  - slot 3: @120–124 (partially mapped; @122 tracks data1).
  - Records are variable-length, per-slot differing encodings (no uniform
    stride).
- **Bank B**: lives at high offsets of the same `000000` chunk (~@199+);
  slot 1: @200 ch−1, @203 d2<<3 (data1/type still unmapped).
  `read-bank-exact b` now decodes bank B channel+data2 live (verified:
  `ch3 ? 0 2` for cc ch3/1/2).
- `trace.decode_slot1(chunk, bank)` + `read-bank-exact` extended; spec
  §4.4 documents the layouts (still marked partial).
- Also: `set_message` now logs the bank+slot ("bank A/B slot N = ...").
- **Remaining (queued):** slot 3 data1/type encoding, bank B type/data1,
  bank B slots 2+, other footswitches; 10-random-capture verification.

## Task — Map `0D` register-read to bank contents (2026-09-06, partial)

- Captured 9 init read-backs (close+reopen FootCtrlPlus under record) in
  `captures/09_06/`, each ~23 `0D 49` responses (two dense chunks: addr
  `000000` and `710700`, rest near-empty).
- **Slot-1 record byte-exact layout mapped** via single-field-change
  diffs (channel 1→2, data1 64→50, data2 5→80/100, type CC→NoteON→
  NoteOFF→PC):
  - chunk `000000` payload (after `00 10 7E 00 00` marker):
    offset 108 channel `(ch-1)<<4`, 109 type (0x20/0x40/0x60/0x00),
    111 data1>>1, 112 data2 plain byte, 1152-53 checksum.
  - Decoded all 9 captures exactly (9/9). `trace.decode_slot1()` and
    `choco.read_bank_exact()` (CLI `read-bank-exact`) implemented and
    verified live: decodes `ch2 pc 50` from a fresh init.
  - Spec §4.3 documents it; streaks/stride experiments recorded.
- **Not done (queued):** slots 2+, bank B, other footswitches layout;
  10-random-capture verification (task requirement). Multi-slot data2 is
  not a plain byte in `000000` — likely lives in `710700` w/ different
  encoding; same diff technique applies.

## Task — Detect footswitch mode (2026-09-05)

- `FOOTSWITCH_MODE_RADIOS` (strip banks from the 3-tuples) +
  `detect_footswitch_mode()` + CLI `footswitch-mode get`: detects the
  enabled footswitch mode for the currently-selected footswitch (white
  marker scan, shared `_detect_radio_group`); requires `advanced_custom`
  device mode (guard verified).
- Self-verified: 4 footswitches × 5 modes = 20/20 detected correctly;
  guard errors under `speaker`.

## Task — Detect footswitch selection (2026-09-05)

- Extend the white-marker detector: `_detect_radio_group` gains a `box`
  half-width + `x_off` (radios scan the dot left of the label; tabs scan
  centered, wider). Footswitch tabs show the same white selected-marker as
  the radios.
- `detect_footswitch()` + CLI `switch get`: detects A/B/C/D, requires
  device mode `advanced_custom` (guard verified — errors under `speaker`).
- Self-verified: clicked A/B/C/D/A/D, detected each — 6/6 OK.

## Task — Detect TRS Jack mode (2026-09-05)

- Refactored the white-dot radio detector into a shared
  `_detect_radio_group(modes, label)` (screenshot; enabled radio shows a
  white center dot, others dark; errors on 0 or >1).
- `detect_trs_jack_mode()` + CLI `trs-jack-mode get` (mirrors
  `device-mode get`).
- Self-verified: clicked each TRS mode twice and detected each time —
  4/4 OK.

## Task — Read device mode enablement from the GUI (2026-09-05)

- `detect_device_mode()` + CLI `choco.py device-mode get`: screenshots
  FootCtrlPlus and detects which device-mode radio is enabled. The
  selected radio shows a **white center dot** (others dark circle) —
  counts white pixels in a box left of each label; returns (mode,
  problems), errors on 0 or >1 enabled (bad state / failed detection).
- Verified (goal 2): click each of the 13 device modes, then detect —
  13/13 exact matches. Restored `advanced_custom` after.
- README updated (`device-mode get` usage).

## Task — Reading "Advanced Custom" bank contents with OCR (2026-09-05)

### Harness
- `read_bank(bank)` + CLI `choco.py read-bank [a|b]`: screenshot, crop
  the bank region (A: (590,640)-(883,852), B +340px X), mask on
  green-dominance (#33eab8 text on dark green), 6x upscale, OCR with
  tesseract (psm 6), parse `[idx] ch TYPE d1 [d2]`.
- Installed `pytesseract` + `eng.traineddata` (system had only `pol`);
  `read_bank` auto-points TESSDATA_PREFIX at ~/.local/share/tessdata.
- Added `EVENT_EDIT_BUTTONS` slot 11 (695,844) — each bank fits 11 rows.

### Full flow (11 per bank)
- Populated 11 distinct MIDI messages in bank A and 11 in bank B via the
  harness, then OCR'd both. Rows detected 8-11/11 per bank.

### Fidelity (honest)
Tesseract on the small green-on-dark font reliably reads row structure
(indices, message types) but exact data1/data2 digits are misread on
~30-40% of rows (worse at bottom rows 9-11; some index/type quirks e.g.
index `3` reused for row 8, `30` vs `90` digit confusion). `read-bank` is
an overview, not ground truth — exact values should come from the
`0D` register-read protocol decode instead. Documented in README.

## Task — TRS jack reverse-polarity (2026-09-05)

### Harness
- `polarity_reversal` toggle at (248,76) on FootCtrlPlus; CLI
  `choco.py trs-jack-reverse-polarity toggle|get` (renamed per operator)
  + `toggle_polarity()`.
- `polarity_reversed()` reads the switch state from the window pixels
  (screenshot via ImageMagick `import`, PIL sample averaged around the
  toggle, compared to #08251d off / #33eab8 on with ±24 tolerance).
- Operator-verified enable/disable (each confirmed), incl. after the
  screen-control permission was granted (clicks had been ignored).

### Protocol — capture `captures/09_05/midi_20260905_235754.log`

`F0 00 32 09 49 00 00 00 02 5A 00 00 00 38 00 00 00 <STATE> <CHK1> <CHK2> F7`
- selector `02 5A` (TRS-jack polarity), offset `38`.
- byte 17: `00`=ON (reversed), `01`=OFF (normal) — inverted semantics.
- checksum `08 01` / `06 01` (CHK1 -2 per step).
- `trace.py` decodes `sw=trs-pol polarity=on|off`; spec §2g added.

## Task — TRS jack mode controls (2026-09-05)

### Harness
- Added `TRS_JACK_MODES`: `expression_pedal` (38,151), `trs_midi`
  (218,151) — a 2-radio group on FootCtrlPlus, independent of device /
  footswitch mode. Wired into COORDS/ACTION_WINDOW/DISPLAY; CLI
  `choco.py trs-jack-mode <mode>` + `set_trs_jack_mode()`, gated on
  `footctrlplus`.
- Operator-verified both modes (goal 2).

### Protocol (goal 3) — capture `captures/09_05/midi_20260905_234141.log`

TRS jack mode uses the same 21-byte `49` mode frame, selector bytes `02 01`
(device mode uses `02 00`, footswitch modes `02 5D`-family):
`F0 00 32 09 49 00 00 00 02 01 00 00 00 10 00 00 00 <MODE> <CHK1> <CHK2> F7`

- Mode byte (17): `00`=expression_pedal, `01`=trs_midi.
- Checksum: `72 03` / `70 03` (CHK1 -2 per step).
- `trace.py` decodes as `sw=trs` + mode name; spec §2f added.

## Task — Device mode controls (2026-09-05)

### Harness
- Added `DEVICE_MODES`: 13 device-mode radio buttons on FootCtrlPlus
  (x,y coords per the task spec), one per device mode. Wired into
  `COORDS`/`ACTION_WINDOW`/`DISPLAY`; new CLI `choco.py device-mode <mode>`
  and importable `set_device_mode(mode)`, gated on `footctrlplus`.
- Operator-verified enablement of all 13 device modes sequentially (each
  confirmed in FootCtrlPlus).

### Protocol (goal 3) — capture `captures/09_05/midi_20260905_232844.log`

Device-mode select uses the same 21-byte `49` mode-select frame as
footswitch modes, but selector bytes `02 00` (footswitch modes use
`02 5D`-family):
`F0 00 32 09 49 00 00 00 02 00 00 00 00 10 00 00 00 <MODE> <CHK1> <CHK2> F7`

- Mode byte (17): `00`..`0C` in sweep order (program_change_a .. speaker).
- Checksum: `74 03`..`5C 03`, CHK1 decrements by 2 per mode, CHK2 = `03`.
- `trace.py` now decodes these as `sw=device` + the mode name
  (`DEVICE_MODE_SELECTOR`, `DEVICE_MODE_BYTE_TO_NAME`); spec §2e documents it.

## Task — Python static analysis & formatting (ruff) (2026-09-05)

- Added `pyproject.toml` with a ruff config (line-length 88, py39 target,
  rule set: E/W/F/UP/B/C4/PL/DTZ/FURB, PLR/PLC/BLE001 ignored).
- Linted + formatted all three modules (`choco.py`, `midi.py`, `trace.py`):
  `ruff check` clean, `ruff format --check` clean. Mechanical modern
  syntax via `--fix --unsafe-fixes` (Optional->X | None, deprecated-import
  upgrades); remaining issues fixed by hand (`check=False` on subprocess,
  tz-aware `astimezone()` datetimes, E501 line wraps, loop-var rename).
- **Fixed a real latent bug surfaced by the lint pass:** `trace.decode_d2`
  decoded values wrong for `lo==0x00` (off by one high-byte group).
  Correct encode/decode derived and verified against the full 16-entry
  table + round-trips (1..127). `REVERSED_PROTOCOL_SPEC.md` §4.1 updated
  with the corrected formula.
- Updated `AGENTS.md`: agents must run `ruff check` + `ruff format` before
  finishing any `.py` edit.

## Task 4 — GUI start/close + discovery handshake (2026-09-05)

### Step 4 result: discovery SysEx RE'd

- **Register-read protocol (family `0D`)**: app reads the device config on
  launch via an address sweep. Read request
  `F0 00 32 0D 41 ... <addr>`; the device echoes each address in a
  `0D 49` response with a ~1170-byte payload. 24 requests / 17 responses
  captured (`captures/09_05/discovery_handshake.log`).
- **Device discovery banner** (constant): `F0 00 32 45 58 01 00 00
  23 6F 5E ... 0E F7` — the "ping response" of the user model.
- `trace.py` decodes `read_req` / `read_resp` / `discovery`; spec §2b
  documents it and §6.1 is marked resolved.
- Finding: long device SysEx are split across aseqdump lines (must
  reconstruct by `F0` starts); the app reads in a descending-address sweep.

### Steps 1-3 (from earlier):

- `start-cubesuite`, `close-footctrlplus`, `close-launchpad` all work
  (see Task 4 entry below for the coordinate `-e`/`648,13` fixes).

---

## Task 4 (setup) — GUI start/close harness (2026-09-05)

Added start/close support for the two top-level windows.

- `start-cubesuite`: launches via `flatpak run com.usebottles.bottles -b
  Chocolate -e C:\users\maja\Desktop\CubeSuite\CubeSuite.exe`, waits for the
  launchpad window (~3.6s here). Learned: the `flatpak run` parent exits
  quickly (delegates to bottles-cli) — do NOT treat early exit as failure,
  wait on the window.
- `close-footctrlplus`: clicks the FootCtrlPlus title-bar close button
  (1250, 17); verified.
- `close-launchpad`: clicks the CubeSuite launchpad close button. Measured
  from a screenshot: the real close button is at the right end of the blue
  title bar, (648, 13) — NOT (139, 15) which is the menu/title text area.
- Verified end-to-end with the operator: start → footctrlplus →
  close-footctrlplus → close-launchpad → (no CubeSuite processes remain).

## Task 3 — Footswitch mode-select SysEx, all footswitches (2026-09-05)

Full (footswitch × mode) protocol sweep, capture
`captures/09_05/midi_20260905_215254.log` (20 mode messages + ACKs + 4
switch-selection writes; no dump cycle on mode change).

- The footswitch IS encoded: within the 21-byte mode-select message
  (`F0 00 32 09 49 ... <MODE> <CHK1> <CHK2> F7`), bytes `8..9` select the
  switch (not a constant sub-id as previously assumed):
  - `02 5D` = A, `02 7E` = B, `02 1F` = C, `02 40` = D
  - byte `10` also varies per switch (`00`/`03`/`07`/`0A`)
- Mode byte `17` is invariant per switch (0x00..0x04 across the 5 modes).
- Checksum: fully data-dependent; `CHK1` decrements by 2 per mode step
  within a switch, jumps across switches. Algorithm still unknown.
- `trace.py` now decodes both: `sw=A/B/C/D` + `mode=<name>` (added
  `MODE_SWITCH_BYTES`; `switch` field in `decode_sysex`).
- `REVERSED_PROTOCOL_SPEC.md` §2a updated with the selector + per-switch
  checksum tables; the previous "is the switch encoded?" open question is
  resolved.

## Task 2 — Footswitch mode-select SysEx protocol (2026-09-05)

Determined the wire protocol for switching footswitch modes (footswitch A).

- Capture: 5 mode switches over `record()` → `captures/09_05/midi_20260905_215009.log`;
  21-byte messages, each ACKed, **no** erase/dump cycle (unlike config edits).
- Message: `F0 00 32 09 49 00 00 00 02 5D 00 00 00 10 00 00 00 <MODE> <CHK1> <CHK2> F7`
  — new family `49` (op `mode`), sub-id `02 5D`, mode byte at index 17.
- Mode byte mapping: `00`=single_step_single_bank, `01`=single_step_double_bank,
  `02`=press_down_release_double_bank, `03`=long_step_single_bank,
  `04`=step_short_or_long_double_bank.
- Checksum tracks the mode byte (`CHK1` = `3A 02`, `38 02`, `36 02`, `34 02`, `32 02`
  for modes 0–4); algorithm still unknown.
- Implemented decode in `trace.py` (`SYSEX_OP[0x49]` = mode; `MODE_BYTE_TO_NAME`;
  family `0x49` branch in `decode_sysex`; `mode=` tag in the viewer).
- Documented in `REVERSED_PROTOCOL_SPEC.md` §2a.
- Open question (recorded in spec): whether the foot switch is encoded in the
  message — all 5 messages were sent with switch A selected and differ only in
  the mode byte + checksum. Test: repeat one mode change on switch B and diff.

## Task 1 — Footswitch mode selectors (2026-09-05)

Footswitch mode switching is now supported in the CLI harness.

- Modes are radio buttons on the FootCtrlPlus window (one radio group per
  foot switch; selecting a mode disables the others for that switch). The
  mode decides how many banks are configurable (1 or 2).
- `FOOTSWITCH_MODES` in `choco.py` is the source of truth (name → x, y,
  bank count):
  - `single_step_single_bank` (609, 221) — 1 bank
  - `single_step_double_bank` (609, 256) — 2 banks
  - `press_down_release_double_bank` (609, 289) — 2 banks
  - `long_step_single_bank` (609, 323) — 1 bank
  - `step_short_or_long_double_bank` (609, 356) — 2 banks
- New CLI: `choco.py footswitch-mode <mode>` (alias `mode`); importable
  `set_footswitch_mode(mode)`; all five radios usable via `click` and appear
  in `state`'s allowed list. Window-stack gated like other actions.
- Note: the previously-named `mode_single_step_two_banks` button is the
  `single_step_double_bank` radio; kept as a legacy alias.
- Bank reuse observations recorded (from task spec): bank A events are
  identical across all modes; bank B events are shared across double-bank
  modes and survive GUI restarts. Relevant to future blob-layout work.

## Session summary (pre-task-1)

### CLI / GUI driver (`choco.py`)

- xdotool/wmctrl wrapper driving the three-window stack (launchpad → FootCtrlPlus → midi-edit dialog), with a window-stack gate that refuses actions when the required window isn't focused.
- Actions: `state`, `geometry`, `start-foot-ctrl-plus`, `switch`, `add`, `remove-all`, `close-editor` (Escape — graceful), `open-edit`, `edit-channel`, `edit-type`, `edit-data1`, `edit-data2`, `confirm-edit`, `set-message` (one-shot full dialog fill).
- Bank support: `--bank b` shifts FootCtrlPlus X by +350 for remove/add/edit (verified across all 10 slots); the edit dialog is bank-agnostic.
- FootSwitches A–D fully exercised; all four switches × both banks can be cleared, populated, and per-slot configured (typed dialog automation, incl. double-click-to-edit, Enter-to-confirm combo, type-aware OK height for PC).
- Windows matched by title regex; ids are inherently unstable and re-resolved each action.

### MIDI capture / decode

- `midi.py`: context-manager recorder (`record()`) tapping ALSA ports by client-name pattern, streaming + archiving to `captures/<MM_DD>/<timestamp>.log` with a self-describing header.
- `trace.py`: single-command live decoder (taps both ports itself, no file needed) + offline log re-analysis; per-event direction tags (app-> / pdl->), ANSI colors, `--raw`, `--dir` filter, concurrent draining of multiple aseqdump pipes (fixed starvation bug).
- Cracks so far:
  - The dump cycle after every UI change: erase → 13 × 1190-byte dump chunks (off 0x00–0x60) → 56-byte write, each ACKed by the pedal.
  - Data2 field encoding fully solved (bytes 0x0B/0x0C, verified for values 1–16, 80, 99; inverse decoder in `trace.decode_d2`).
- ~8 archived captures under `captures/09_05/` incl. random-config sweep across all switches/banks.

### Docs

- `REVERSED_PROTOCOL_SPEC.md`: honest working spec — what's known (framing, opcodes, dump shape, data2, per-slot regions, checksum behavior) vs. open questions with concrete next experiments.
- `README.md`: usage for every tool and the window-stack model. `demo.sh` sequence script.

### Not included (deliberately)

- No commit history yet (all files untracked); `.gitignore` added for Python hygiene.
- No tests, no packaging/pyproject — repo is a working-session artifact.
