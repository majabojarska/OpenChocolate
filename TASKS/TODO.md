# TODO.md

How to work on this file:

- Read the next task from this file
- Get extra context from recently finished tasks - read the first 50 lines of TASKS/FINISHED.md
- Move the completed task to FINISHED.md and report that you're finished

Open work, roughly in priority order. Items marked **[spec]** are detailed in
`REVERSED_PROTOCOL_SPEC.md`. Done: bank A slots 2-7 (see FINISHED
2026-09-07), foot B/C/D stored mapping (see FINISHED 2026-09-07).

---

## Task — Map device mode / TRS-jack mode / polarity toggle in the init read-back **[spec]**

**Goal:** parse the current device-mode selection, TRS-jack mode, and
polarity-reversal toggle **from the FootCtrlPlus startup init read-back
(`0D` SysEx) alone** — no UI reads. Verify each parsed value against
the GUI detectors (`device-mode get`, `trs-jack-mode get`,
`trs-jack-reverse-polarity get`) after a fresh restart.

**Background:** the WRITE path is mapped (spec §2e/2f/2g + captures
`captures/09_05/midi_20260905_232844.log` (device mode),
`..._234141.log` (TRS), `..._235754.log` (polarity)). The READ path
(where these live in the init chunks) is unknown. GUI detectors are
proven working (white-dot radios; polarity pixel colors).

**Method** (mirrors the anchor campaign):
1. Baseline: `advanced_custom` init capture (bank UI visible; foot A).
2. Per value, set via GUI → close/reopen FootCtrlPlus under recording
   → diff init chunks vs baseline → locate bytes:
   - device mode: all 13 values (~13 captures ≈ 25 min)
   - TRS-jack mode: `expression_pedal` + `trs_midi` (2 captures)
   - polarity: off + on (2 captures; toggle, read back via `get`)
3. Implement decoders in `trace.py` (e.g. `decode_device_mode(chunk)`)
   + spec §2e/2f/2g read-back rows.
4. Gate: parse-from-capture == GUI-`get` for all 17 states, each on a
   fresh restart (restart resets foot to A — irrelevant, modes are
   global). End with device back on `advanced_custom` (bank UI depends
   on it).

**Watch-outs:** mode changes rewrite large config (expect big page
writes in captures — analysis uses only the `0D` read-back); viewed
bank areas may move/blank outside `advanced_custom` (compare same-mode
pairs; baseline is `advanced_custom`); per-variant foot re-select is
not needed (modes are global), but confirm `state` is `footctrlplus`
before each set.

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
