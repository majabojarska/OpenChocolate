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
