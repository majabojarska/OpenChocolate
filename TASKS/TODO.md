# TODO.md

How to work on this file:

- Read the next task from this file
- Get extra context from recently finished tasks - read the first 50 lines of TASKS/FINISHED.md
- Move the completed task to FINISHED.md and report that you're finished

Open work, roughly in priority order. Items marked **[spec]** are detailed in
`REVERSED_PROTOCOL_SPEC.md`. Done: bank A slots 2-7 (see FINISHED
2026-09-07), foot B/C/D stored mapping (see FINISHED 2026-09-07),
device/TRS/polarity read-back (see FINISHED 2026-09-07), mode
screenshots (see FINISHED 2026-09-07).

---

## Task 1 — Import/export device presets in the `choco.py` harness

**Goal:** `choco.py export-preset <name>` / `import-preset <name>`
driving FootCtrlPlus's Export/Import buttons + file picker, operating
from `Documents` only. The Wine prefix lives at
`~/.var/app/com.usebottles.bottles/data/bottles/bottles/Chocolate/`
(`drive_c/users/maja/Documents/` is empty; no `.FCP` files exist yet).

**Method:**
1. Recon: open each picker, screenshot, identify the picker window
   title (new `STACK` entry, e.g. `file_picker`), measure coords: File
   name input, Open/Save, Cancel, Documents tree item (single click,
   no tree-expansion sequences per constraints).
2. Extend `choco.py`: `STACK` + `WINDOW_TITLES` + `COORDS` +
   `ACTION_WINDOW` + `DISPLAY` entries; `export-preset` / `import-preset`
   actions reusing `_clear_and_type()` for the filename box, with
   appear/close waits like the `midi_edit` dialog flow. Add a prefix
   constant for Linux-side file access.
3. Gate: export creates `<name>.FCP` under prefix `Documents`
   (verified from the Linux side); import of a known `.FCP` reproduces
   its state via `read-bank-exact`; export→import→export round-trips
   byte-identical. End on `advanced_custom`.

---

## Task 2 — Generate `.FCP` files from a structured device representation **[spec]**

**Goal:** parse the proprietary `.FCP` export format (document in
`REVERSED_PROTOCOL_SPEC.md`, new section), then generate `.FCP` files
with arbitrary device configurations from a well-known structured
representation (e.g. JSON bank defs reusing `MidiMessage`).
Requires Task 1 (import/export harness).

**Method:**
1. Via the GUI, build N configs spanning the control space (device
   mode, footswitch modes, bank A/B contents incl. ch16/d127/all
   types, TRS mode, polarity) → export each to `Documents` → collect
   from the prefix.
2. Diff the `.FCPs` against each other and against the known `0D`
   chunk bytes (the export likely embeds the config blob) → field map.
3. Implement the generator; gate: generated `.FCP` → GUI import →
   `read-bank-exact` + mode/`get` detectors match the source
   representation exactly, for banks A/B on all four footswitches.
4. Document the format in the spec. Note any relation to the
   page-write checksum task (FCP import may be an alternate write
   path around it).

---

## Task — Page-write checksum (`09 41 40`) — still unsolved

The small-family checksum is SOLVED (spec §5, 14-bit complement sum,
verified 5224/5224 ACK + 1930/1935 config). The 1175-byte config page
writes use a different, non-linear checksum: every standard CRC-16
variant, an exhaustive 32768-poly scan, simple hash families, and sum
models all fail (details in spec §5). Until solved, **arbitrary page
writes are not possible** — only verbatim replay of captured page
sequences. Ideas: (a) model the payload as small 7-bit elements and try
X = K − Σ f(elem) with element-wise transforms; (b) check if the
checksum covers the read-back chunk domain (tail @1152-1153) which
might share the primitive; (c) gather more (payload, chk) pairs with
tiny deltas to brute linear weights.
