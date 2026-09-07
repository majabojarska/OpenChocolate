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
  - campaigns: `sweep_a_full.py`, `anchor_feet.py`, `rand_stored.py`
  - solvers/search: `solve_bits.py`, `solve_stored.py`, `fmt_search.py`,
    `fmt_search6.py`, `pick_bits.py`
  - gates: `verify_a.py`, `verify_a2.py`, `verify_b.py`,
    `verify_sweeps.py`, `rand_verify.py`, `verify_hypothesis.py`
  - misc: `diff_chunks.py`, `direct_test.py`
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

If mouse clicks are not effective, stop and ask the operator to check for a "screen control" permission popup.
A missing permission could exhibit as `FootCtrlPlus` not starting after clicking on `CubeSuite`.
