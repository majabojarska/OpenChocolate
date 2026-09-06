#!/usr/bin/env python3
"""trace.py: condensed, direction-tagged decoder for choco MIDI traffic.

Two modes:

    python3 trace.py -f [PORT_PATTERN ...]   # LIVE: taps ALSA ports itself,
                                             #   decodes each event as it
                                             #   arrives. One command, no
                                             #   middleman file.
    python3 trace.py midi_xxx.log            # after-capture analysis

Each event becomes one short line, decoded where possible:

    [# 1] app-> SYSEX len=111 op=erase?(05) sub=025E off=00 chk=6804
    [# 2] pdl-> SYSEX len=12 ACK F0 00 32 01 08 00 00 00 00 7F 01 F7
    [#31] pdl-> Program change 0, program 0

Direction comes from the source port's client name: names matching --app
are "app->" (TX), all others are "pdl->" (RX) unless --pedal is given.
"""

from __future__ import annotations

import argparse
import os
import re
import selectors
import shutil
import subprocess
import sys
from collections.abc import Iterable

# -*- ANSI colors for direction-tagged lines (aggressive; override with --no-color).
_COLOR = {
    "app->": "\033[32m",  # green
    "pdl->": "\033[33m",  # yellow
    "?->": "\033[31m",  # red (unknown direction)
    "end": "\033[0m",
}

# ---------------------------------------------------------------- decode ---
# Tentative understanding of the device protocol (will evolve):
#   F0 00 32 <dir> 41 <op> <a> <b> <sub_hi> <sub_lo> <offset> ... <chk1> <chk2> F7
#     dir: 09 = host->device, 01 = device->host
#     op:  02=write, 05=erase?, 40=config dump
#   device ACK: F0 00 32 01 08 00 00 00 00 7F 01 F7
# Footswitch mode select (op 0x49), 21 bytes:
#   F0 00 32 09 49 00 00 00 02 5D 00 00 00 10 00 00 00 <mode> <chk1> <chk2> F7
SYSEX_OP = {0x02: "write", 0x05: "erase?", 0x40: "dump", 0x49: "mode"}

# mode byte (index 17) <-> footswitch mode name, for op 0x49.
MODE_BYTE_TO_NAME = {
    0x00: "single_step_single_bank",
    0x01: "single_step_double_bank",
    0x02: "press_down_release_double_bank",
    0x03: "long_step_single_bank",
    0x04: "step_short_or_long_double_bank",
}

# Footswitch selector for op 0x49: bytes 8..10 (sub-id + continuation)
# identify which foot switch the mode change targets. From the (foot x
# mode) sweep capture midi_20260905_215254.log.
MODE_SWITCH_BYTES = {
    0x025D: "A",  # bytes 8..9 = 02 5D
    0x027E: "B",  # 02 7E
    0x021F: "C",  # 02 1F
    0x0240: "D",  # 02 40
}

# Device-mode selector for op 0x49: bytes 8..9 = 02 00 means the mode byte
# (17) selects the DEVICE mode (not a footswitch mode).
DEVICE_MODE_SELECTOR = 0x0200
# TRS-jack-mode selector: bytes 8..9 = 02 01.
TRS_JACK_SELECTOR = 0x0201

# device mode byte (index 17) <-> device mode name (op 0x49, selector 02 00).
# From the device-mode sweep capture midi_20260905_232844.log.
DEVICE_MODE_BYTE_TO_NAME = {
    0x00: "program_change_a",
    0x01: "program_change_b",
    0x02: "custom",
    0x03: "advanced_custom",
    0x04: "manufacturer_control",
    0x05: "touch_screen_android",
    0x06: "video_control",
    0x07: "keyboard_a",
    0x08: "keyboard_b",
    0x09: "multimedia_keyboard",
    0x0A: "custom_keyboard",
    0x0B: "mix",
    0x0C: "speaker",
}

# TRS jack mode byte (index 17) <-> name (op 0x49, selector 02 01).
# From captures/09_05/midi_20260905_234141.log.
TRS_JACK_MODE_BYTE_TO_NAME = {
    0x00: "expression_pedal",
    0x01: "trs_midi",
}

# TRS jack reverse-polarity toggle (op 0x49, selector 02 5A, off=0x38):
# byte 17 = 0x00 when ON (reversed), 0x01 when OFF.
TRS_POLARITY_SELECTOR = 0x025A
TRS_POLARITY_OFF = 0x38

# Init/discovery handshake (register read protocol):
#   app -> dev read request: F0 00 32 0D 41 00 00 00 02 <a> <b> <c>
#                             00 00 10 7E 00 00 <v> 00 F7
#   dev -> app response:     F0 00 32 0D 49 3F 00 00 02 <same a.b.c> ...
# The device also emits a constant discovery banner: F0 00 32 45 58 01 00 00 ...
READ_REQUEST_FAM = 0x41  # after 0x0D: request
RESPONSE_FAM = 0x49  # after 0x0D: response
DISCOVERY_BANNER = 0x58  # after 0x45: device discovery banner

# Config blob: each event slot's entry occupies ~6 bytes starting at 0x0C.
# The "data2" field of a CC message is encoded across the slot region's
# bytes (blob offsets 0x0B/0x0C for slot 1 of the displayed switch/bank):
#   lo = (v & 3) << 5        # low 2 bits of v in the lo byte's top 2 bits
#   hi = 0x40 + (v >> 2)     # v//4 in the hi byte's low 6 bits
# (derived + verified against a live data2=1..99 sweep; matches 8/8)


def decode_d2(lo: int, hi: int) -> int | None:
    """Inverse of the Data2 encoding; None if the bytes don't fit.

    lo's top 2 bits carry v & 3; hi's low 6 bits carry v >> 2.
    """
    if hi < 0x40:
        return None
    v = ((hi - 0x40) << 2) | (lo >> 5)
    return v if 1 <= v <= 127 else None


# Slot-1 record layout (chunk 000000, offsets within the payload after the
# 00 10 7E 00 00 marker), mapped via single-field-change diffs:
#   108 = channel:      (ch-1) << 4
#   109 = type:         0x20=cc 0x40=noteon 0x60=noteoff 0x00=pc
#   111 = data1:        data1 >> 1
#   112 = data2:        plain byte (for pc this is stale/unused)
#   1152/1153 = checksum over the config
SLOT1_TYPE = {0x20: "cc", 0x40: "noteon", 0x60: "noteoff", 0x00: "pc"}
SLOT1_CH_OFF = 108
SLOT1_TYPE_OFF = 109
SLOT1_DATA1_OFF = 111
SLOT1_DATA2_OFF = 112


def decode_slot1(chunk: bytes, bank: str = "a") -> dict:
    """Decode the slot-1 MIDI message from the 000000 config chunk.

    Bank A slot 1 is bit-packed with spill bits (mapped by single-field
    diffs incl. ch 9-16 and odd data1):
      @108 = ((ch-1) & 7) << 4
      @109 = type_code | ((ch-1) >> 3)   (ch >= 9 sets bit 0)
      @110 = (d1 & 1) << 6               (odd data1)
      @111 = d1 >> 1
      @112 = d2 (plain byte; stale for pc)
    Bank B slot 1 (@200-204, offset pinned by locating the raw bytes in
    the capture; earlier notes said @199-203 which was a +1 off-by-one):
      @200 = ch - 1, @201 = type_index<<1 (0/2/4/6),
      @202 = (d1&0x1F)<<2, @203 = (d2&0x0F)<<3 | (d1>>5),
      @204 = 0x10 | (d2>>4)   (bit 4 optional in some read-backs)
    """
    if bank == "b":
        ch = chunk[200] + 1
        typ = {0: "pc", 2: "cc", 4: "noteon", 6: "noteoff"}.get(chunk[201], "?")
        d1 = (chunk[202] >> 2) | ((chunk[203] & 0x03) << 5)
        # d2: low nibble in @203 bits 3-6 ((d2&0xF)<<3), high nibble in
        # @204 bits 0-3 (d2>>4). @204 bit 4 is an optional marker bit
        # (0x10, seen in some firmware/read-back variants); masking it off
        # is always correct since d2 <= 127 never sets it.
        d2 = ((chunk[203] >> 3) & 0x0F) | ((chunk[204] & 0x0F) << 4)
        d2 = d2 if typ != "pc" else 0
        return {"channel": ch, "type": typ, "data1": d1, "data2": d2}
    ch = ((chunk[SLOT1_CH_OFF] >> 4) | ((chunk[SLOT1_TYPE_OFF] & 1) << 3)) + 1
    typ = SLOT1_TYPE.get(chunk[SLOT1_TYPE_OFF] & 0xFE, "?")
    d1 = (chunk[SLOT1_DATA1_OFF] << 1) | ((chunk[110] >> 6) & 1)
    d2 = chunk[SLOT1_DATA2_OFF]
    return {"channel": ch, "type": typ, "data1": d1, "data2": d2 if typ != "pc" else 0}


_BB_TYPE = {0: "pc", 1: "noteon", 2: "cc", 3: "noteoff"}
# bank B slots 4/5/6 use an inverted code table (cc before noteon).
_BB_TYPE_S5 = {0: "pc", 1: "cc", 2: "noteon", 3: "noteoff"}

# Bank B slot record starts (fixed offsets within the 000000 chunk),
# raw-pinned + diff-mapped on 2026-09-06. Records are adjacent but each
# slot has its own bit-packing (no uniform stride); slots 9-10 repeat
# the slot-2/slot-3 formats (period 7... actually 2->9, 1->8, 3->10).
_BB_OFFS = {
    1: 200,  # format A (same as bank-A slot 1 in bank B packing)
    2: 205,  # format B
    3: 211,  # format C
    4: 217,  # format D
    5: 222,  # format E
    6: 228,  # format F
    7: 234,  # format G (partial)
    8: 240,  # format A (same as slot 1)
    9: 245,  # format B (same as slot 2)
    10: 251,  # format C (same as slot 3)
}

# The 2-bit type codes stored per format (LSB-first where scattered).
_TYPE_A = {0: "pc", 2: "cc", 4: "noteon", 6: "noteoff"}  # slot1/8: value*2
_TYPE_C = _BB_TYPE  # slot 3/10
_TYPE_D = _BB_TYPE_S5  # slot 4/6: code << 2 (inverted table)
_TYPE_E = _BB_TYPE_S5  # slot 5: code stored directly
_TYPE_G = _BB_TYPE  # slot 7: bit0<<4 | bit1<<3


def _clean(msg: dict) -> dict | None:
    """None if the slot record is all zeros (empty slot) or out of range."""
    if msg["type"] == "?":
        return None
    if not 1 <= msg["channel"] <= 16:
        return None
    if not 0 <= msg["data1"] <= 127:
        return None
    if msg["type"] != "pc" and not 0 <= msg["data2"] <= 127:
        return None
    return msg


def _any(b: bytes, off: int, n: int) -> bool:
    return any(b[off : off + n])


def _fmt_a(b: bytes, off: int) -> dict | None:
    """ch-1 plain; type*2; (d1&0x1F)<<2; ((d2&0xF)<<3)|(d1>>5); 0x10|(d2>>4)."""
    if not _any(b, off, 5):
        return None
    typ = _TYPE_A.get(b[off + 1], "?")
    d1 = (b[off + 2] >> 2) | ((b[off + 3] & 3) << 5)
    d2 = ((b[off + 3] >> 3) & 0x0F) | ((b[off + 4] & 0x0F) << 4)
    return _clean(
        {
            "channel": b[off] + 1,
            "type": typ,
            "data1": d1,
            "data2": d2 if typ != "pc" else 0,
        }
    )


def _fmt_b(b: bytes, off: int) -> dict | None:
    """ch-1 bits0-1 @off bits5-6, bits2-3 @off+1 bits0-1; type 2bit at
    off+1 bit6 / off+2 bit0; d1 plain @off+3; (d2<<1)&0x7F @off+4 with
    bit0 of @off+5 = d2>>6."""
    if not _any(b, off, 6):
        return None
    ch = (
        ((b[off] >> 5) & 1)
        | (((b[off] >> 6) & 1) << 1)
        | ((b[off + 1] & 1) << 2)
        | (((b[off + 1] >> 1) & 1) << 3)
    ) + 1
    typ = _BB_TYPE.get((((b[off + 1] >> 6) & 1) << 1) | (b[off + 2] & 1), "?")
    d1 = b[off + 3]
    d2 = ((b[off + 4] & 0x7F) | ((b[off + 5] & 1) << 7)) >> 1
    return _clean(
        {"channel": ch, "type": typ, "data1": d1, "data2": d2 if typ != "pc" else 0}
    )


def _fmt_c(b: bytes, off: int) -> dict | None:
    """(ch-1)<<3; type0<<5|type1<<4; (d1&3)<<5; (d1>>2)|(d2&1)<<6; d2>>1."""
    if not _any(b, off, 6):
        return None
    ch = (b[off] >> 3) + 1
    typ = _TYPE_C.get(((b[off + 1] >> 5) & 1) | (((b[off + 1] >> 4) & 1) << 1), "?")
    d1 = ((b[off + 2] >> 5) & 3) | ((b[off + 3] & 0x1F) << 2)
    d2 = (b[off + 4] << 1) | ((b[off + 3] >> 6) & 1)
    return _clean(
        {"channel": ch, "type": typ, "data1": d1, "data2": d2 if typ != "pc" else 0}
    )


def _fmt_d(b: bytes, off: int) -> dict | None:
    """Flag @off-1 = 0x01 (unmapped); (ch-1)<<1 @off; type<<2 @off+1
    (inverted table); (d1&0xF)<<3 @off+2; @off+3 bits 0-2 = d1 bits
    4-6 REVERSED + bits 4-6 = d2&7; @off+4 = 0x20|(d2>>3)."""
    if not _any(b, off, 5):
        return None
    ch = (b[off] >> 1) + 1
    typ = _TYPE_D.get(b[off + 1] >> 2, "?")
    d1 = ((b[off + 2] >> 3) & 0x0F) | ((b[off + 3] & 7) << 4)
    d2 = ((b[off + 4] & 0x0F) << 3) | ((b[off + 3] >> 4) & 7)
    return _clean(
        {"channel": ch, "type": typ, "data1": d1, "data2": d2 if typ != "pc" else 0}
    )


def _fmt_e(b: bytes, off: int) -> dict | None:
    """ch-1 bit0 @off bit6 + (ch-1)>>1 @off+1; type (inverted) @off+2;
    (d1<<1)&0x7F @off+3; ((d2&0x1F)<<2)|(d1>>6) @off+4;
    0x08|((d2>>6)<<1)|(d2&0x20?1:0)... i.e. d2 bit5 -> @off+5 bit0,
    d2 bit6 -> @off+5 bit1."""
    if not _any(b, off, 6):
        return None
    ch = (((b[off] >> 6) & 1) | (b[off + 1] << 1)) + 1
    typ = _TYPE_E.get(b[off + 2], "?")
    d1 = (b[off + 3] >> 1) | ((b[off + 4] & 1) << 6)
    d2 = (
        ((b[off + 4] >> 2) & 0x1F)
        | ((b[off + 5] & 1) << 5)
        | (((b[off + 5] >> 1) & 1) << 6)
    )
    return _clean(
        {"channel": ch, "type": typ, "data1": d1, "data2": d2 if typ != "pc" else 0}
    )


def _fmt_f(b: bytes, off: int) -> dict | None:
    """(ch-1)&7<<4 @off; (ch-1>>3)|type<<5 @off+1 (inverted table, bit0
    of the code at... code stored as LSB-first 2 bits @ bits 5-6);
    (d1&1)<<6 @off+2; d1>>1 @off+3; d2 plain @off+4."""
    if not _any(b, off, 5):
        return None
    ch = (((b[off] >> 4) & 7) | ((b[off + 1] & 1) << 3)) + 1
    typ = _BB_TYPE_S5.get((b[off + 1] >> 5) & 3, "?")
    d1 = ((b[off + 2] >> 6) & 1) | (b[off + 3] << 1)
    d2 = b[off + 4]
    return _clean(
        {"channel": ch, "type": typ, "data1": d1, "data2": d2 if typ != "pc" else 0}
    )


def _fmt_g(b: bytes, off: int) -> dict | None:
    """Slot 7: (ch-1)<<2; type: bit0<<4|bit1<<3; (d1&7)<<4;
    @+3 = ((d2&7)<<5)&0x7F | (d1>>3); @+4 = 0x40|(d2>>2).
    d1 = ((b&7)<<3 | (lo3)); d2 = ((@+4&0x1F)<<2) | (d2lo)."""
    if not _any(b, off, 5):
        return None
    ch = (b[off] >> 2) + 1
    typ = _BB_TYPE.get((((b[off + 1] >> 3) & 1) << 1) | ((b[off + 1] >> 4) & 1), "?")
    d1 = ((b[off + 3] & 0x0F) << 3) | ((b[off + 2] >> 4) & 7)
    d2 = ((b[off + 4] & 0x1F) << 2) | ((b[off + 3] >> 5) & 3)
    return _clean(
        {"channel": ch, "type": typ, "data1": d1, "data2": d2 if typ != "pc" else 0}
    )


def decode_b_slots(chunk: bytes) -> list[dict]:
    """Decode bank B slots from the 000000 chunk.

    All ten slot records are at FIXED offsets (raw-pinned + verified,
    2026-09-06): 200, 205, 211, 217, 222, 228, 234, 240, 245, 251. Each
    slot uses its own bit-packing, so the decoder dispatches per-record
    format. Verified byte-exact (across the camp_* campaign captures):
    slots 1-6 and 8-10. Slot 7's data1-high/data2 packing is still being
    mapped (channel/type known). Empty slots (all-zero records) are
    skipped.
    """
    fmts = {
        1: _fmt_a,
        2: _fmt_b,
        3: _fmt_c,
        4: _fmt_d,
        5: _fmt_e,
        6: _fmt_f,
        7: _fmt_g,
        8: _fmt_a,
        9: _fmt_b,
        10: _fmt_c,
    }
    out = []
    for i in range(1, 11):
        msg = fmts[i](chunk, _BB_OFFS[i])
        if msg:
            out.append(msg)
    return out


# Bank A slot 2 (@113-119) and slot 3 (@120-124) decoders, from the 3-slot
# capture diffs (verified: slot2 noteon ch6/31/99, slot3 noteoff ch8/55/77
# and cc ch5/70/110).
_B2_TYPE = {0x08: "cc", 0x10: "noteon"}
_B3_TYPE = {0: "pc", 2: "cc", 4: "noteon", 6: "noteoff"}


def decode_bank_a_slots(chunk: bytes) -> list[dict]:
    """Decode bank A slots 1-3 from the 000000 chunk (3-slot layout).

    Slot records are variable-length bit-packed (no uniform stride); this
    covers the first three records at their mapped offsets.
    """
    out = [decode_slot1(chunk, "a")]
    # slot 2
    ch2 = (chunk[114] >> 2) + 1
    t2 = _B2_TYPE.get(chunk[115], "?")
    d1_2 = ((chunk[117] & 0x1F) << 3) | (chunk[116] >> 4)
    d2_2 = ((chunk[118] - 0x40) << 2) | (chunk[117] >> 5)
    out.append({"channel": ch2, "type": t2, "data1": d1_2, "data2": d2_2})
    # slot 3
    ch3 = chunk[120] + 1
    t3 = _B3_TYPE.get(chunk[121], "?")
    d1_3 = (chunk[122] >> 2) | ((chunk[123] & 0x07) << 5)
    d2_3 = (chunk[123] >> 3) | (((chunk[124] >> 1) & 3) << 5)
    out.append({"channel": ch3, "type": t3, "data1": d1_3, "data2": d2_3})
    # slots 4-5 (5-slot layout):
    #   slot4 @125-130: @125 (ch-1)<<5, @126 type|((ch-1)>>3), @127 type
    #     (pc=00/cc=40), @128 d1 plain, @129 (d2&0x3F)<<1, @130 ((d2>>6)<<2)|1
    #   slot5 @130-135: @131 (ch-1)<<3, @132 type?, @133 (d1&3)<<5,
    #     @134 ((d2&1)<<6)|3, @135 d2>>1  (d1 high bits pending)
    out.append(
        {
            "channel": (((chunk[125] & 0x7F) >> 5) | ((chunk[126] & 1) << 2)) + 1,
            "type": {0x00: "pc", 0x40: "cc"}.get(chunk[126] & 0xFE, "?"),
            "data1": chunk[128],
            "data2": (chunk[129] >> 1) | ((chunk[130] >> 2) << 6),
        }
    )
    out.append(
        {
            "channel": (chunk[131] >> 3) + 1,
            "type": {0x10: "cc", 0x20: "noteon"}.get(chunk[132], "?"),
            "data1": (chunk[133] >> 5) | ((chunk[134] & 0x3F) << 2),
            "data2": (chunk[135] << 1) | ((chunk[134] >> 6) & 1),
        }
    )
    # slot 6 (10-slot layout) — fully decoded:
    #   @137 (ch-1)<<1, @138 type (0x04 cc/0x08 noteon), @139 (d1&7)<<3,
    #   @140 (d1>>4) | ((d2&1)<<4) | ((d2&4)<<4), @141 (d2>>3)|0x20
    out.append(
        {
            "channel": (chunk[137] >> 1) + 1,
            "type": {0x04: "cc", 0x08: "noteon"}.get(chunk[138], "?"),
            "data1": (chunk[139] >> 3) | ((chunk[140] & 0x07) << 4),
            "data2": ((chunk[141] & 0x1F) << 3)
            | ((chunk[140] >> 6) << 2)
            | ((chunk[140] >> 4) & 1),
        }
    )
    # slot 7 (10-slot layout): @142 (ch-9)<<6, @144 type (0x01 cc/0x02
    # noteon), @145 (d1&0x3F)<<1, @146 (d2&0x1F)<<2, @147 (d2>>5)|0x08
    out.append(
        {
            "channel": (chunk[142] >> 6) + 9,
            "type": {0x01: "cc", 0x02: "noteon"}.get(chunk[144], "?"),
            "data1": (chunk[145] >> 1) & 0x3F,
            "data2": (chunk[146] >> 2) | ((chunk[147] & 0x07) << 5),
        }
    )
    # slot 8 (10-slot layout): @148 (ch-1)<<4, @149 type (0x60 noteoff/
    # 0x20 cc), @150 (d1&1)<<6, @151 d1>>1, @152 d2>>3, @153 (d2&7)<<1
    out.append(
        {
            "channel": (chunk[148] >> 4) + 1,
            "type": {0x60: "noteoff", 0x20: "cc"}.get(chunk[149], "?"),
            "data1": (chunk[151] << 1) | (chunk[150] >> 6),
            "data2": (chunk[152] << 3) | (chunk[153] >> 1),
        }
    )
    # slot 9 (10-slot layout): @153 (ch-1)<<2, @154 type (0x00 pc/0x08
    # cc), @155 (d1&7)<<4, @156 (d1>>3)|(d2<<5)
    out.append(
        {
            "channel": (chunk[153] >> 2) + 1,
            "type": {0x00: "pc", 0x08: "cc"}.get(chunk[154], "?"),
            "data1": (chunk[155] >> 4) | ((chunk[156] & 0x1F) << 3),
            "data2": chunk[156] >> 5,
        }
    )
    # slot 10 (10-slot layout): @159 ch-1, @160 type (0x02 cc/0x04 noteon),
    # @161 (d1&0x1F)<<2, @162 (d2&0x0F)<<3 | (d1>>5), @163 (d2>>4)|6
    out.append(
        {
            "channel": chunk[159] + 1,
            "type": {0x02: "cc", 0x04: "noteon"}.get(chunk[160], "?"),
            "data1": (chunk[161] >> 2) | ((chunk[162] & 0x07) << 5),
            "data2": ((chunk[163] & 0x07) << 4) | ((chunk[162] >> 3) & 0x0F),
        }
    )
    return out


_EVENT_RE = re.compile(r"^\s*(\d+:\d+)\s+(.*)$")
_HEADER_PORT_RE = re.compile(r"^# port: (\d+:\d+)\s+(.*)$")
_SPLIT_RE = re.compile(r"\s{2,}")


def parse_line(line: str) -> tuple[str, str, str] | None:
    """Return (source port, event kind, data) for an aseqdump event line."""
    m = _EVENT_RE.match(line)
    if not m:
        return None
    port, rest = m.group(1), m.group(2).strip()
    if not rest:
        return None
    parts = _SPLIT_RE.split(rest, maxsplit=1)
    kind = parts[0]
    data = parts[1].strip() if len(parts) > 1 else ""
    return port, kind, data


def _hexbytes(text: str) -> bytes:
    return bytes(int(x, 16) for x in text.split())


def decode_sysex(b: bytes) -> dict[str, object]:
    """Best-effort decode of a SysEx message."""
    info: dict[str, object] = {"len": len(b)}
    if len(b) < 4 or b[0] != 0xF0 or b[-1] != 0xF7:
        return info
    info["dir_byte"] = f"{b[3]:02X}"
    if b[3] == 0x09 and len(b) >= 11:
        # host -> device configuration message
        family = b[4]
        info["family"] = f"{family:02X}"
        info["sub"] = f"{b[8]:02X}{b[9]:02X}"
        info["chk"] = f"{b[-3]:02X}{b[-2]:02X}" if len(b) >= 5 else ""
        if family == 0x41:
            op = b[5]
            info["op"] = f"{op:02X}"
            info["op_name"] = SYSEX_OP.get(op, "?")
            info["off"] = f"{b[10]:02X}"
            # Slot-1 Data2 (CC value / velocity) sits at config-blob offsets
            # 0x0B/0x0C, i.e. payload indices 0x0B/0x0C of the off=0x00 dump
            # chunk (11-byte SysEx header + chunk payload).
            if op == 0x40 and b[10] == 0x00 and len(b) >= 11 + 0x0D + 1:
                lo, hi = b[11 + 0x0B], b[11 + 0x0C]
                d2 = decode_d2(lo, hi)
                if d2 is not None:
                    info["data2"] = d2
        elif family == 0x49:
            # Mode select: byte 17 encodes the mode; bytes 8..9 select the
            # target — a footswitch (02 5D-family), the DEVICE mode (02 00),
            # or the TRS jack mode (02 01).
            info["op"] = "49"
            info["op_name"] = "mode"
            info["off"] = f"{b[10]:02X}"
            sel = (b[8] << 8) | b[9]
            if sel == DEVICE_MODE_SELECTOR:
                info["switch"] = "device"
                if len(b) >= 18:
                    info["mode"] = DEVICE_MODE_BYTE_TO_NAME.get(b[17], f"0x{b[17]:02X}")
            elif sel == TRS_JACK_SELECTOR:
                info["switch"] = "trs"
                if len(b) >= 18:
                    info["mode"] = TRS_JACK_MODE_BYTE_TO_NAME.get(
                        b[17], f"0x{b[17]:02X}"
                    )
            elif sel == TRS_POLARITY_SELECTOR and b[10] == TRS_POLARITY_OFF:
                # TRS jack reverse-polarity: 00 = on (reversed), 01 = off.
                info["switch"] = "trs-pol"
                info["polarity"] = "on" if b[17] == 0x00 else "off"
            else:
                sw = MODE_SWITCH_BYTES.get(sel, "?")
                info["switch"] = sw
                if len(b) >= 18:
                    info["mode"] = MODE_BYTE_TO_NAME.get(b[17], f"0x{b[17]:02X}")
    elif b[3] == 0x0D:
        # Init/discovery register-read protocol.
        if b[4] == READ_REQUEST_FAM and len(b) >= 21:
            info["kind"] = "read_req"
            info["addr"] = f"{b[9]:02X}{b[10]:02X}{b[11]:02X}"
        elif b[4] == RESPONSE_FAM:
            info["kind"] = "read_resp"
            info["addr"] = f"{b[9]:02X}{b[10]:02X}{b[11]:02X}"
    elif b[3] == 0x45 and b[4] == DISCOVERY_BANNER:
        info["kind"] = "discovery"
    elif b[3] == 0x01:
        # device -> host
        if len(b) == 12 and b[4] == 0x08:
            info["kind"] = "ACK"
        else:
            info["kind"] = "resp?"
    return info


def _emit(
    direction: str,
    shown: str,
    count: int,
    color: bool = True,
) -> None:
    if color and direction in _COLOR:
        print(
            f"[#{count:4d}] {_COLOR[direction]}{direction}{_COLOR['end']} {shown}",
            flush=True,
        )
    else:
        print(f"[#{count:4d}] {direction} {shown}", flush=True)


def render(port: str, kind: str, data: str, raw: bool = False) -> str | None:
    """Produce one condensed line for an event, or None to skip."""
    if kind == "System exclusive":
        b = _hexbytes(data)
        info = decode_sysex(b)
        details = []
        if "kind" in info:
            details.append(f"len={len(b)} {info['kind']}")
            if "addr" in info:
                details.append(f"addr={info['addr']}")
            if raw or len(b) <= 16:
                details.append(data)
        else:
            details.append(f"len={len(b)}")
            if "op_name" in info:
                details.append(f"op={info['op_name']}({info['op']})")
                details.append(f"sub={info['sub']}")
                details.append(f"off={info['off']}")
                details.append(f"chk={info['chk']}")
                if "mode" in info:
                    details.append(f"mode={info['mode']}")
                if "switch" in info:
                    details.append(f"sw={info['switch']}")
                if "polarity" in info:
                    details.append(f"polarity={info['polarity']}")
                if "data2" in info:
                    details.append(f"data2={info['data2']}")
                if raw:
                    details.append(data)
            elif raw:
                details.append(data)
        return "SYSEX " + " ".join(details)
    return f"{kind} {data}".strip()


# ------------------------------------------------------------ direction ----
_PORTS_RE = re.compile(r"^\s*(\d+:\d+)\s+(.*?)\s{2,}(.*)$")


def _aseqdump_ports() -> list[tuple[str, str, str]]:
    """(port id, client name, port name) from `aseqdump -l`."""
    proc = subprocess.run(
        ["aseqdump", "-l"], capture_output=True, text=True, check=False
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"aseqdump -l failed: {proc.stderr.strip() or proc.stdout.strip()}"
        )
    ports = []
    for line in proc.stdout.splitlines():
        m = _PORTS_RE.match(line)
        if m:
            ports.append((m.group(1), m.group(2).strip(), m.group(3).strip()))
    return ports


def resolve_ports(patterns: list[str]) -> list[tuple[str, str, str]]:
    """Ports whose client name contains any pattern (case-insensitive)."""
    pats = [p.lower() for p in patterns if p]
    if not pats:
        return []
    return [p for p in _aseqdump_ports() if any(pn in p[1].lower() for pn in pats)]


def classify(name: str, app_pats: list[str], pedal_pats: list[str]) -> str:
    n = name.lower()
    if any(p in n for p in app_pats):
        return "app->"
    if pedal_pats:
        return "pdl->" if any(p in n for p in pedal_pats) else "?->"
    return "pdl->"  # default: anything non-app is the pedal


# ------------------------------------------------------------ live tap -----
def tap(
    patterns: list[str],
    *,
    app_pats: list[str],
    pedal_pats: list[str],
    raw: bool,
    dir_filter: str | None,
    color: bool = True,
) -> int:
    """Run aseqdump on the matching ports and decode events live.

    Prints nothing to the log file — events stream to stderr at the top,
    decoded lines to stdout, so `1> trace.txt` captures only the decode.
    """
    ports = resolve_ports(patterns)
    if not ports:
        available = "\n".join(f"  {p[0]:>6}  {p[1]}" for p in _aseqdump_ports())
        print(
            f"no ALSA sequencer port matched {patterns!r}\navailable:\n{available}",
            file=sys.stderr,
        )
        return 1

    name_by_port = {pid: client for pid, client, _ in ports}
    stdbuf = shutil.which("stdbuf")
    procs = []
    try:
        for pid, _client, _ in ports:
            cmd = (["stdbuf", "-oL"] if stdbuf else []) + ["aseqdump", "-p", pid]
            p = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
            )
            procs.append(p)
        print(
            f"listening on {len(ports)} port(s): "
            + ", ".join(f"{c} ({p})" for p, c, _ in ports)
            + "   (Ctrl+C to stop)",
            file=sys.stderr,
        )

        count = 0
        # Drain all aseqdump children concurrently so no port's events are
        # starved (a single sequential loop would block on the first port
        # and buffer the rest).
        sel = selectors.DefaultSelector()
        for p in procs:
            sel.register(p.stdout, selectors.EVENT_READ, p)
        done = set()
        while True:
            for key, _ in sel.select(timeout=0.2):
                proc = key.data
                line = proc.stdout.readline()
                if line == "":  # EOF: this child ended
                    done.add(id(proc))
                    sel.unregister(proc.stdout)
                    continue
                ev = parse_line(line)
                if not ev:
                    continue
                port, kind, data = ev
                direction = classify(name_by_port.get(port, port), app_pats, pedal_pats)
                if dir_filter and direction != dir_filter:
                    continue
                shown = render(port, kind, data, raw=raw)
                if shown is None:
                    continue
                count += 1
                _emit(direction, shown, count, color=color)
            if len(done) == len(procs):
                break
    except KeyboardInterrupt:
        pass
    finally:
        for p in procs:
            p.terminate()
        _, alive = _wait_children(procs, timeout=2.0)
        for p in alive:
            p.kill()
    print(f"stopped; decoded {count} event line(s)", file=sys.stderr)
    return 0


def _wait_children(procs, timeout: float) -> tuple[list, list]:
    import time as _t

    deadline = _t.time() + timeout
    done, alive = [], []
    for p in procs:
        try:
            p.wait(timeout=max(0, deadline - _t.time()))
            done.append(p)
        except subprocess.TimeoutExpired:
            alive.append(p)
    return done, alive


# ------------------------------------------------------------ offline -----
def port_names_from_log(lines: Iterable[str]) -> dict[str, str]:
    """Parse `# port:` header lines into {port id: client name}.

    Does not consume the stream (header lines are skipped by parse_line
    anyway), so it can scan the whole log.
    """
    mapping = {}
    for line in lines:
        m = _HEADER_PORT_RE.match(line)
        if m:
            port_id, rest = m.group(1), m.group(2)
            client = rest.split(" (", 1)[0] if " (" in rest else rest
            mapping[port_id] = client
    return mapping


def live_port_names() -> dict[str, str]:
    """Fallback: resolve port ids via `aseqdump -l`."""
    try:
        return {pid: client for pid, client, _ in _aseqdump_ports()}
    except Exception:
        return {}


def process_lines(
    lines: Iterable[str],
    names: dict[str, str],
    *,
    app_pats: list[str],
    pedal_pats: list[str],
    raw: bool,
    dir_filter: str | None,
    color: bool = True,
) -> None:
    live = None
    count = 0
    for line in lines:
        ev = parse_line(line)
        if not ev:
            continue
        port, kind, data = ev
        name = names.get(port)
        if name is None:
            if live is None:
                live = live_port_names()
            name = live.get(port) or port
        direction = classify(name, app_pats, pedal_pats)
        if dir_filter and direction != dir_filter:
            continue
        shown = render(port, kind, data, raw=raw)
        if shown is None:
            continue
        count += 1
        _emit(direction, shown, count, color=color)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="trace",
        description="Decode choco MIDI traffic — live (default) or from a log.",
    )
    parser.add_argument(
        "patterns",
        nargs="*",
        default=["WINE midi driver", "SINCO"],
        help="client-name substrings to tap (default: wine + sinco); if the "
        "first looks like an existing log file, that file is analyzed "
        "instead of tapping",
    )
    parser.add_argument(
        "--app",
        nargs="+",
        default=["wine"],
        help="client-name substrings treated as the app (TX)",
    )
    parser.add_argument(
        "--pedal",
        nargs="+",
        default=[],
        help="client-name substrings treated as the pedal (RX)",
    )
    parser.add_argument("--raw", action="store_true", help="show full SysEx hex")
    parser.add_argument(
        "--dir", choices=["app->", "pdl->"], help="only show this direction"
    )
    parser.add_argument(
        "--no-color",
        action="store_true",
        help="disable ANSI colors (auto-used when not a tty)",
    )
    args = parser.parse_args(argv)

    use_color = (not args.no_color) and sys.stdout.isatty()

    kw = {
        "app_pats": [p.lower() for p in args.app],
        "pedal_pats": [p.lower() for p in args.pedal],
        "raw": args.raw,
        "dir_filter": args.dir,
        "color": use_color,
    }

    # If the first positional is an existing file, treat it as a log to
    # analyze; otherwise every positional is a port pattern.
    if args.patterns and os.path.isfile(args.patterns[0]):
        log = args.patterns[0]
        with open(log) as f:
            lines = f.readlines()
        names = port_names_from_log(lines)
        process_lines(lines, names, **kw)
        return 0
    return tap(args.patterns, **kw)


if __name__ == "__main__":
    sys.exit(main())
