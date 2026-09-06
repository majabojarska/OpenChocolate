# TODO.md

How to work on this file:

- Read the next task from this file
- Get extra context from recently finished tasks - read the first 50 lines of TASKS/FINISHED.md
- Move the completed task to FINISHED.md and report that you're finished

Open work, roughly in priority order. Items marked **[spec]** are detailed in
`REVERSED_PROTOCOL_SPEC.md`.

---

## Task — Bank B slots 2-10 bit-stream decoder

- Bank B slot 1 is decoded (spec §4.4); slots 2+ are a continuously
  interleaved bit-stream whose byte alignment shifts with content. To
  finish: collect a large (slots × fields × values) capture matrix and
  reverse the stream algorithm (or brute-force the bit widths per
  field) so all 10 bank B slots decode.

---

## Task — Map the `0D` register-read protocol to the config slot layout
## Task — Map the `0D` init register-read protocol to the Bank A/B contents

### Context

OCR (`read-bank`) gives an overview but not byte-exact values — the exact bank contents live in the device config, read back via the `0D` register-read protocol (spec §2c). The goal is to produce a byte-exact bank reader that replaces/augments OCR.

### Background

- Init (FootCtrlPlus open) runs a register-address read loop: app sends
  `F0 00 32 0D 41 00 00 00 02 <addr-lo> <addr-hi> <addr2> 00 00 10 7E 00 00 <cmd> 00 F7`,
  device replies `F0 00 32 0D 49 ... <same addr> ... <payload> F7`.
- Address sweep is sequential/descending; ~24 requests, 17 responses observed (may be split-by-aseqdump).
- Each response carries a config chunk; together they form the full device state (spec §2c). We know where a few fields live (Data2 at blob 0x0B/0x0C for slot 1 of the displayed switch/bank) but not the full per-slot / per-bank / per-footswitch layout (spec §6.4/6.5).

### Goals

1. Capture a full `0D` init read-back (cold start of FootCtrlPlus) with
   both ports, reconstruct the complete config image (handle aseqdump
   line-splitting by F0 starts).
2. Correlate the config image with a **known** bank state (set a fixed, distinctive set of messages via the harness — e.g. 11 in bank A: CC/Note ON/Note OFF/PC with recognizable values — then OCR/read the bank as ground truth).
3. Diff config images across variations (bank A vs B, footswitch A vs B,
   device modes) to map where each slot's fields (channel/type/data1/data2)
   live in the blob. Produce a documented byte-exact layout.
4. Implement a `read-bank-exact` (or similar) harness command that decodes
   the config image into the list of messages per bank, with no OCR.

### Verification

- For a populated bank of known messages, `read-bank-exact` returns exactly
  those messages (bytes, not OCR).
- Cross-check against the (imperfect) OCR to sanity-check the decode.
- Perform 10 captures with randomly generated bank contents. Make sure to use a double-bank footswitch mode.
