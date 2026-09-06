# TODO.md

How to work on this file:

- Read the next task from this file
- Get extra context from recently finished tasks - read the first 50 lines of TASKS/FINISHED.md
- Move the completed task to FINISHED.md and report that you're finished

Open work, roughly in priority order. Items marked **[spec]** are detailed in
`REVERSED_PROTOCOL_SPEC.md`.

---

## Task — Bank A slots 2-7: re-derive at true offsets (bit-scatter)

**Status (2026-09-06 handover):** the old spec rows for bank A slots 2-7
were fit to the buggy (0x16-dropping) parser and are RANGE-VERIFIED ONLY
(they decode the original captures, which lack 0x16 before these
records). Slots 8-10 are re-derived + fully verified. Slots 2-7 are
**bit-scattered** packings (each field a scattered set of LSB-first bits
over a 5-6 byte record, unlike bank B).

An exhaustive per-bit solver (`pick_bits.py`) fit all 61 b-sweep samples
for s2 (ch/t/d1/d2) and partly s3/s4 (d1), but the d1/d2 HIGH bits were
under-constrained (sweep values 21/13/33 never varied them). The fitted
code regressed the a_base decode, so it was **reverted** — the decoder
keeps the range-limited rows. Do NOT re-apply the FIT table without
high-bit samples.

Next steps (mechanical):
1. Sweep d1/d2 across 1..127 for slots 3-7 (and ch=16) — the interrupted
   `sweep_a_full.py` covers this (s3-7 × d2{1,2,4,8,16,32,64,127} ×
   d1{33,66,99,127} × ch16 + s4 non-pc d2). Ensure the GUI stack is up
   (`start-cubesuite` + `start-foot-ctrl-plus`) and retry fills on races.
   Evidence already on disk: `camp_a_hi57` (s5-7 at 127),
   `camp_a6d2v{1,2}` (s6 d2=1,2).
2. Run `pick_bits.py` (now fed the high-bit samples) and insert the
   working combos into `trace.decode_bank_a_slots` for s3-7.
3. Verify: `verify_a2.py` (b-sweeps) + `verify_a.py` (a-base/a8-10) +
   a fresh 10-random-bank run (`rand_verify.py a <seed>`).
4. Then `read-bank-exact a` returns all 10 slots; update §4.4 bank A
   rows to the verified layouts.

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

---

## Task — Map the `0D` init register-read protocol to the Bank A/B contents (DONE 2026-09-06: bank B 10/10; bank A slots 1,8-10; slots 2-7 in progress above)

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
