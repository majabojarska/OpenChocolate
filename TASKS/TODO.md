# TODO.md

How to work on this file:

- Read the next task from this file
- Get extra context from recently finished tasks - read the first 50 lines of TASKS/FINISHED.md
- Move the completed task to FINISHED.md and report that you're finished

Open work, roughly in priority order. Items marked **[spec]** are detailed in
`REVERSED_PROTOCOL_SPEC.md`.

---

## Task — Bank A slots 8-10 re-basing at TRUE offsets

**Context (2026-09-06):** Bank B is now FULLY solved (all 10 slots
byte-exact, see FINISHED). The remaining known gap: bank A slots 8-10
spec rows were fit to buggy-shifted bytes (the old `0x16`-dropping
parser; e.g. true s8 = @148-152 with d2 PLAIN, not `d2>>3`+
`(d2&7)<<1`). Bank A slots 1-7 verified unaffected.

To finish:
- Re-derive bank A s8-s10 field layouts on the fixed parser using the
  same single-field diff campaign (`camp2.py` + `analyze_captures.py`,
  now with `--bank b` default not needed... bank A fills use
  `remove-all`/`add`/`set-message --bank a`). The 10-slot bank A state
  lives in `captures/09_06/camp_*.log` (bank A side).
- Then the final cross-check: `read-bank-exact a` returns all 10 bank A
  messages byte-exact (bank B already does).

---

## Task — Map the `0D` init register-read protocol to the Bank A/B contents (DONE 2026-09-06: bank B 10/10, bank A 1-7; see task above)

### Context

OCR (`read-bank`) gives an overview but not byte-exact values — the exact bank contents live in the device config, read back via the `0D` register-read protocol (spec §2c). The goal is to produce a byte-exact bank reader that replaces/augments OCR.

### Background

- Init (FootCtrlPlus open) runs a register-address read loop: app sends
  `F0 00 32 0D 41 00 00 00 02 <addr-lo> <addr-hi> <addr2> 00 00 10 7E 00 00 <cmd> 00 F7`,
  device replies `F0 00 32 0D 49 ... <same addr> ... <payload> F7`.
- Address sweep is sequential/descending; ~24 requests, 17 responses observed (may be split-by-aseqdump).
- Each response carries a config chunk; together they form the full device state (spec §2c).

### Status (2026-09-06)

- Goals 1-4 largely DONE: full init read-back reconstructed (fixed the
  aseqdump line-splitting handling + the 0x16-parser bug); bank B slots
  1-2 and bank A slots 1-7 decoded byte-exact via diff campaigns;
  `read-bank-exact` returns byte-exact messages per bank (no OCR) for
  the mapped slots.
- Remaining: bank B slots 3-10 + bank A slots 8-10 at TRUE offsets
  (see the task above), then the 10-random-capture verification.
