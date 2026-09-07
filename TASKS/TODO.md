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

## Task — Page-write checksum (`09 41 40`): joint-table mapping + live ACK **[spec]**

**Goal:** compute valid checksums for arbitrary direct page writes
(`amidi`, no GUI/import flow). Model cracked (spec §5): `X = K − 4·S
(mod 2¹⁴)`, 37 bit-exponents solved, joint-table method LOOCV-exact.
Arbitrary writes already work via FCP import (§4.7), so this is now
about headless/targeted writes — priority accordingly.

**Method:**
1. Extend the grid method per interacting byte group (`/tmp/grid144145.pkl`
   pattern: sweep the full value range, including high bits — the
   144∈{0,8,16,24} grid missed the b5/b6 regime change; cover 0-127).
   Start with the known groups: (144,145) full 128-combo grid, pos-205
   region (map its FCP fields first via chained single-field deltas).
2. Solve K from any fully-mapped page (`K = X + 4·S`), then predict
   held-out pages (fixed off0=16+ pages, never in fit) — must match exactly.
3. Gate: craft a page write with computed checksum via `amidi` → device
   ACKs (`01 08`) + `read-bank-exact`/stored decode confirms the state
   change. NAKs make trial writes safe (rejected, device unchanged).
4. Document the full algorithm in spec §5 (replacing the partial note).

Tools/datasets ready: `harvest_pages.py` (3600+ pairs, regenerable),
`solve_chexp.py` (propagation), `gen_rand_fcp.py` + `camp_import.py`
(bit-spread import campaigns, no dialogs/scrolls needed). Open residuals:
K value, `0D 49` tail checksum vs this model, e≥12 invisible bits.
