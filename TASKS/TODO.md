# TODO.md

How to work on this file:

- Read the next task from this file
- Get extra context from recently finished tasks - read the first 50 lines of TASKS/FINISHED.md
- Move the completed task to FINISHED.md and report that you're finished

Open work, roughly in priority order. Items marked **[spec]** are detailed in
`REVERSED_PROTOCOL_SPEC.md`. Done: bank A slots 2-7 (see FINISHED
2026-09-07), foot B/C/D stored mapping (see FINISHED 2026-09-07),
device/TRS/polarity read-back (see FINISHED 2026-09-07), mode
screenshots (see FINISHED 2026-09-07), import/export harness (see
FINISHED 2026-09-07).

---

## Task 2 — Scrollbar support: add/edit/read bank items up to 16 **[spec]**

At 12+ slots a scrollbar appears (up arrow, slider, down arrow).
Today the harness covers slots 1-11 (`EVENT_EDIT_BUTTONS`); slots 12-16
need scrolling and their protocol layouts are unmapped (decoders cover
10 slots/bank).

**Method:**
1. Recon: fill 12-16 slots, screenshot the bank list, measure scrollbar
   coords + slots 12-16 edit-button positions. Scroll-to-bottom = left
   click just above the down arrow (from top). Use the auto-incremented
   `[n]` indices as reference.
2. Harness: scroll-aware `open_edit` (ensure-visible: scroll to bottom
   for index ≥ visible count), extend `EVENT_EDIT_BUTTONS` to 16,
   `read-bank` OCR region for the scrolled view.
3. Protocol: map slots 11-16 offsets/layouts via diff campaign (same
   technique as s2-7: single-field value spreads + solver), extend
   `decode_bank_a_slots` / `decode_b_slots` / stored homes as needed.
4. Gate: add + edit + `read-bank-exact` a 16-slot bank end-to-end;
   17th add refused (Task 1). Document scrollbar + slots 11-16 in spec.

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
