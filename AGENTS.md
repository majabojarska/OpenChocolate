# Project rules for agents

## Working with Python

- **Lint and format with `ruff`.** Config lives in `pyproject.toml`
  (line-length 88, modern-Python rules). Before finishing any edit to a
  `.py` file, run (always format before lint):
  ```sh
  ruff format <file>.py
  ruff check <file>.py
  ```
  `ruff check` must pass with no errors; `ruff format --check` should show
  the file as formatted. If you fix lint issues, only run `--fix`
  (and `--fix --unsafe-fixes` for the mechanical modern-syntax upgrades if
  needed), then review the remaining warnings before addressing them.
- Use type hints.
- Use descriptive, human-friendly names.

## Project layout (context)

Root = product: the harness and live decoders. `tools/` = capture engine
plus tangential analysis/campaign/verify scripts (run from repo root —
they resolve imports and `captures/` paths relative to it).

- `choco.py` — CLI/GUI harness driving the M-Vave editor windows
  (xdotool/wmctrl), importable actions.
- `midi.py` — ALSA sequencer recorder (`record()` context manager, archives
  to `captures/<MM_DD>/`).
- `trace.py` — live/offline SysEx decoder (colors app->/pdl->, decodes the
  protocol: read_req/read_resp/discovery/mode/data2).
- `tools/` — capture engine, decoders, and supporting scripts, by role:
  - engine: `camp2.py` (GUI fill + close/reopen capture workhorse),
    `analyze_captures.py` (capture parser shared by everything in `tools/`),
    `decode_stored.py` (foot B/C/D stored-region bank decoders)
- `tools/` — one-shot or supporting scripts, by role:
  - campaigns: `sweep_a_full.py`, `anchor_feet.py`, `rand_stored.py`,
    `camp_import.py` (import-capture loop harvesting page writes)
  - solvers/search: `solve_bits.py`, `solve_stored.py`, `fmt_search.py`,
    `fmt_search6.py`, `pick_bits.py`, `solve_checksum.py` (page-checksum
    lstsq exploration), `solve_chexp.py` (checksum bit-exponent
    propagation + union-find)
  - gates: `verify_a.py`, `verify_a2.py`, `verify_b.py`,
    `verify_sweeps.py`, `rand_verify.py`, `verify_hypothesis.py`,
    `verify_gate1.py` (generated-FCP gate vs a close/reopen capture)
  - generators: `gen_fcp.py` (`.FCP` preset generator from a JSON device
    spec) with gate specs `tools/gate1.json`, `tools/gate2.json`,
    `gen_rand_fcp.py` (randomized/chained FCPs for checksum campaigns)
  - misc: `diff_chunks.py`, `direct_test.py`, `harvest_pages.py`
    (rebuild page-write pair dataset from captures), `gate_write.py`
    (crafted-checksum page-write gate via aseqsend)
- `REVERSED_PROTOCOL_SPEC.md` — the reverse-engineered protocol spec; keep
  in sync with decoders in `trace.py`.
- `TASKS/` — `TODO.md` (next task) and `FINISHED.md` (completed tasks,
  most recent first). When you finish a task, move it from TODO to
  FINISHED.

## Capture files (conventions — follow for all new captures)

- Location: `captures/YYYY-MM-DD/` (local date when the capture starts).
- Filename: `YYYY-MM-DD_hh-mm-ss_<kind>[_<name>].log` — `midi.py` writes
  `<ts>_midi.log`, `camp2.py` writes `<ts>_camp_<name>.log`.
- Always run tools from the repo root; capture code resolves `captures/`
  relative to cwd (`midi.default_log_path()`, `camp2.capture_path()`).
- Readers: never hardcode dated dirs — glob `captures/*/*_<suffix>` or
  use `analyze_captures.find_capture()` / `logical_name()` (strips the
  timestamp prefix for name parsers).
- Pre-2026-09-08 docs reference old paths (`captures/09_05/...`,
  unprefixed names); resolve by filename suffix.

## Working with the GUI harness

- Before starting a new task from [./TASKS/TODO.md](./TASKS/TODO.md), run a minimal healthcheck routine to ensure you can start `FootCtrlPlus`, and that changes are being written into the device.
  1. Confirm the footswitch MIDI device is present (`aseqdump -l` shows `SINCO`).
  2. Close `FootCtrlPlus` (if open): `python3 choco.py close-footctrlplus` (`close-editor` via Escape if wedged).
  3. Open `FootCtrlPlus`: `python3 choco.py start-cubesuite` (if needed) + `python3 choco.py start-foot-ctrl-plus`; wait ~15s, then confirm `python3 choco.py state` shows `footctrlplus` and the `WINE midi driver` port appears.
  4. Prove the write path with a stateless toggle: `python3 choco.py trs-jack-reverse-polarity get` (note value) → `toggle` → `get` (must flip) → `toggle` → `get` (must flip back). Both flips confirm app→device writes; the round-trip restores state.
- If mouse clicks are not effective, stop and ask the operator to check for a "screen control" permission popup.
A missing permission could exhibit as `FootCtrlPlus` not starting after clicking on `CubeSuite`.
- Click coordinates are per-window and origin conventions differ:
  `FootCtrlPlus` main-window `COORDS` are client-area coords, but modal
dialogs (file picker) report an origin that includes the ~30px title
  bar — add +30 to screenshot-measured Y for dialog coords. `COORDS`
  already stores working per-window values; if clicks land offset, use
  `--absolute` (converts via `wmctrl -lG`) or re-measure from a fresh
  screenshot.
- When working with screenshots, prefer using or writing tools to process them (like comparing or detecting something). Abstain from reading the raw files yourself!
