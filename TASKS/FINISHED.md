# FINISHED.md

Completed tasks are listed here, most recent first.

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
