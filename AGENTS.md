# Project rules for agents

## Working with Python

- **Lint and format with `ruff`.** Config lives in `pyproject.toml`
  (line-length 88, modern-Python rules). Before finishing any edit to a
  `.py` file, run:
  ```sh
  ruff check <file>.py
  ruff format <file>.py
  ```
  `ruff check` must pass with no errors; `ruff format --check` should show
  the file as formatted. If you fix lint issues, only run `--fix`
  (and `--fix --unsafe-fixes` for the mechanical modern-syntax upgrades if
  needed), then review the remaining warnings before addressing them.
- Use type hints.
- Use descriptive, human-friendly names.

## Project layout (context)

- `choco.py` — CLI/GUI harness driving the M-Vave editor windows
  (xdotool/wmctrl), importable actions.
- `midi.py` — ALSA sequencer recorder (`record()` context manager, archives
  to `captures/<MM_DD>/`).
- `trace.py` — live/offline SysEx decoder (colors app->/pdl->, decodes the
  protocol: read_req/read_resp/discovery/mode/data2).
- `REVERSED_PROTOCOL_SPEC.md` — the reverse-engineered protocol spec; keep
  in sync with decoders in `trace.py`.
- `TASKS/` — `TODO.md` (next task) and `FINISHED.md` (completed tasks,
  most recent first). When you finish a task, move it from TODO to
  FINISHED.

## Working with the GUI harness

If mouse clicks are not effective, stop and ask the operator to check for a "screen control" permission popup.
A missing permission could exhibit as `FootCtrlPlus` not starting after clicking on `CubeSuite`.
