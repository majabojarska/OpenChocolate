#!/usr/bin/env python3
"""Encode known bank messages with every known slot packing and locate the
resulting byte runs in the foot B/C/D *stored* regions (foot-independent
packing check). Free low bits are assumed zero (matches all viewed
captures); a hit is confirmed only if the HI variant encodes to the same
offset. Usage: python3 fmt_search.py (prints candidate hits)."""

from __future__ import annotations

import sys

sys.path.insert(0, ".")
from analyze_captures import find_capture, parse_capture

BA = {"pc": 0, "cc": 1, "noteon": 2, "noteoff": 3}
TA = {"pc": 0, "cc": 2, "noteon": 4, "noteoff": 6}
BB = {"pc": 0, "noteon": 1, "cc": 2, "noteoff": 3}
BBS5 = {"pc": 0, "cc": 1, "noteon": 2, "noteoff": 3}
SLOT1 = {"pc": 0x00, "cc": 0x20, "noteon": 0x40, "noteoff": 0x60}
B2 = {"cc": 0x08, "noteon": 0x10}
B3 = {"pc": 0, "cc": 2, "noteon": 4, "noteoff": 6}


def enc_s8(t, ch, d1, d2):
    return bytes([((ch - 1) << 4), BA[t] << 5, ((d1 & 1) << 6), d1 >> 1, d2])


def enc_s9(t, ch, d1, d2):
    return bytes(
        [
            ((ch - 1) << 2),
            BA[t] << 3,
            ((d1 & 7) << 4),
            (d1 >> 3) | ((d2 & 3) << 5),
            0x40 | (d2 >> 2),
        ]
    )


def enc_s10a(t, ch, d1, d2):
    return bytes(
        [
            ch - 1,
            TA[t],
            ((d1 & 0x1F) << 2),
            (((d2 & 0xF) << 3) | (d1 >> 5)),
            0x10 | (d2 >> 4),
        ]
    )


def enc_fmtc(t, ch, d1, d2):
    c = BB[t]
    return bytes(
        [
            ((ch - 1) << 3),
            ((c & 1) << 5) | (((c >> 1) & 1) << 4),
            ((d1 & 3) << 5),
            (d1 >> 2) | ((d2 & 1) << 6),
            d2 >> 1,
        ]
    )


def enc_fmtg(t, ch, d1, d2):
    c = BB[t]
    return bytes(
        [
            ((ch - 1) << 2),
            ((c & 1) << 4) | (((c >> 1) & 1) << 3),
            ((d1 & 7) << 4),
            (((d2 & 7) << 5) | (d1 >> 3)),
            0x40 | (d2 >> 2),
        ]
    )


def enc_fmtf(t, ch, d1, d2):
    return bytes(
        [
            (((ch - 1) & 7) << 4),
            (((ch - 1) >> 3) | (BBS5[t] << 5)),
            ((d1 & 1) << 6),
            d1 >> 1,
            d2,
        ]
    )


def enc_slot1(t, ch, d1, d2):
    return bytes(
        [
            (((ch - 1) & 7) << 4),
            SLOT1[t] | ((ch - 1) >> 3),
            ((d1 & 1) << 6),
            d1 >> 1,
            d2,
        ]
    )


def enc_s2(t, ch, d1, d2):
    return bytes(
        [
            ((ch - 1) << 2),
            B2[t],
            ((d1 & 0xF) << 4),
            (((d1 >> 3) & 0x1F) | ((d2 & 3) << 5)),
            0x40 | (d2 >> 2),
        ]
    )


def enc_s3(t, ch, d1, d2):
    return bytes(
        [
            ch - 1,
            B3[t],
            ((d1 & 0x3F) << 2),
            (((d1 >> 5) & 7) | ((d2 & 0x1F) << 3)),
            (((d2 >> 5) & 3) << 1),
        ]
    )


def enc_fmtb(t, ch, d1, d2):
    c = (ch - 1) & 0x0F
    code = BB[t]
    return bytes(
        [
            ((c & 1) << 5) | (((c >> 1) & 1) << 6),
            ((c >> 2) & 3) | (((code >> 1) & 1) << 6),
            (code & 1),
            d1,
            ((d2 << 1) & 0x7F),
            ((d2 >> 6) & 1),
        ]
    )


def enc_fmtd(t, ch, d1, d2):
    c = (ch - 1) & 0x0F
    return bytes(
        [
            0x01,
            ((c & 0x0F) << 1),
            (BBS5[t] << 2),
            ((d1 & 0x0F) << 3),
            (((d1 >> 4) & 7) | ((d2 & 7) << 4)),
            (0x20 | (d2 >> 3)),
        ]
    )


def enc_fmte(t, ch, d1, d2):
    c = (ch - 1) & 0x0F
    return bytes(
        [
            ((c & 1) << 6),
            (c >> 1),
            BBS5[t],
            ((d1 << 1) & 0x7F),
            (((d2 & 0x1F) << 2) | (d1 >> 6)),
            (0x08 | ((d2 >> 5) & 1) | (((d2 >> 6) & 1) << 1)),
        ]
    )


def enc_s5view(t, ch, d1, d2):
    return bytes(
        [
            ((ch - 1) << 3),
            {"pc": 0x00, "cc": 0x10, "noteon": 0x20, "noteoff": 0x30}[t],
            ((d1 & 3) << 5),
            (((d1 >> 2) & 0x3F) | ((d2 & 1) << 6)),
            (d2 >> 1),
        ]
    )


def enc_s6view(t, ch, d1, d2):
    return bytes(
        [
            ((ch - 1) << 1),
            {"pc": 0x00, "cc": 0x04, "noteon": 0x08, "noteoff": 0x0C}[t],
            ((d1 & 0x0F) << 3),
            (
                ((d1 >> 4) & 7)
                | ((d2 & 1) << 4)
                | (((d2 >> 6) & 1) << 5)
                | (((d2 >> 2) & 1) << 6)
            ),
            ((d2 >> 1) & 0x0F),
        ]
    )


def enc_s7view(t, ch, d1, d2):
    return bytes(
        [
            (((ch - 1) & 1) << 6),
            (((ch - 1) >> 1) & 7),
            {"pc": 0x00, "cc": 0x01, "noteon": 0x02, "noteoff": 0x03}[t],
            ((d1 & 0x3F) << 1),
            (((d1 >> 6) & 1) | ((d2 & 0x1F) << 2)),
            ((d2 >> 5) & 3),
        ]
    )


def enc_s2view(t, ch, d1, d2):
    return bytes(
        [
            ((ch - 1) << 2),
            {"pc": 0x00, "cc": 0x08, "noteon": 0x10, "noteoff": 0x18}[t],
            ((d1 & 0x0F) << 4),
            (((d1 >> 3) & 0x1F) | ((d2 & 3) << 5)),
            (0x40 | (d2 >> 2)),
        ]
    )


def enc_s3view(t, ch, d1, d2):
    return bytes(
        [
            ch - 1,
            B3[t],
            ((d1 & 0x3F) << 2),
            (((d1 >> 5) & 7) | ((d2 & 0x1F) << 3)),
            (((d2 >> 5) & 3) << 1),
        ]
    )


FMTS = {
    "s8": enc_s8,
    "s9": enc_s9,
    "s10a": enc_s10a,
    "fmtc": enc_fmtc,
    "fmtg": enc_fmtg,
    "fmtf": enc_fmtf,
    "slot1": enc_slot1,
    "s2": enc_s2,
    "s3": enc_s3,
    "fmtb": enc_fmtb,
    "fmtd": enc_fmtd,
    "fmte": enc_fmte,
    "s5view": enc_s5view,
    "s6view": enc_s6view,
    "s7view": enc_s7view,
    "s2view": enc_s2view,
    "s3view": enc_s3view,
}

BASE_A = [
    ("cc", 4, 17, 55),
    ("noteon", 6, 31, 99),
    ("noteoff", 8, 55, 77),
    ("pc", 3, 44, 0),
    ("cc", 5, 13, 66),
    ("noteon", 7, 21, 100),
    ("cc", 9, 33, 96),
    ("cc", 2, 66, 22),
    ("cc", 4, 77, 1),
    ("cc", 6, 100, 96),
]

HI_A = [
    ("cc", 4, 17, 55),
    ("noteon", 6, 31, 99),
    ("noteoff", 8, 55, 77),
    ("pc", 3, 44, 0),
    ("cc", 5, 127, 127),
    ("noteon", 7, 127, 127),
    ("cc", 16, 127, 127),
    ("cc", 2, 66, 22),
    ("cc", 4, 77, 1),
    ("cc", 6, 100, 96),
]

BASE_B = [
    ("cc", 3, 11, 33),
    ("cc", 5, 22, 44),
    ("noteon", 7, 33, 55),
    ("noteoff", 9, 44, 66),
    ("cc", 11, 55, 77),
    ("pc", 13, 66, 0),
    ("noteon", 15, 77, 99),
    ("cc", 16, 88, 111),
    ("noteoff", 2, 99, 123),
    ("pc", 4, 111, 0),
]

HI_B = [
    ("cc", 3, 11, 33),
    ("cc", 16, 127, 127),
    ("noteon", 7, 33, 55),
    ("noteoff", 9, 44, 66),
    ("cc", 11, 55, 77),
    ("pc", 13, 66, 0),
    ("noteon", 16, 127, 127),
    ("cc", 16, 88, 111),
    ("noteoff", 2, 99, 123),
    ("pc", 4, 111, 0),
]


def payloads(path):
    out = {}
    for b in parse_capture(path):
        if len(b) >= 12 and b[3] == 0x0D and b[4] == 0x49:
            p = b[12:-1]
            if p[:5] == bytes([0, 0x10, 0x7E, 0, 0]):
                p = p[5:]
            out[(b[9], b[10], b[11])] = p
    return out


# stored homes: (foot, bank) -> (chunk addr, search lo, search hi)
HOMES = {
    ("B", "a"): ((0, 0, 0), 590, 700),
    ("B", "b"): ((0, 0, 0), 670, 780),
    ("C", "a"): ((0, 0, 0), 1070, 1155),
    ("C", "b"): ((113, 7, 0), 0, 110),
    ("D", "a"): ((113, 7, 0), 395, 500),
    ("D", "b"): ((113, 7, 0), 470, 575),
}


def main() -> None:
    caps = {}
    for foot in "BCD":
        for bank in ("a", "b"):
            sfx = {"a": "base", "b": "base"}[bank]
            caps[(foot, bank, "base")] = payloads(
                find_capture(f"camp_f{foot}_{bank}_{sfx}.log")
            )
            sfx = "hi"
            caps[(foot, bank, "hi")] = payloads(
                find_capture(f"camp_f{foot}_{bank}_{sfx}.log")
            )
    for (foot, bank), (addr, lo, hi_off) in HOMES.items():
        base_msgs = BASE_A if bank == "a" else BASE_B
        hi_msgs = HI_A if bank == "a" else HI_B
        chunk_b = caps[(foot, bank, "base")][addr]
        chunk_h = caps[(foot, bank, "hi")][addr]
        print(f"== foot {foot} bank {bank.upper()} stored home {addr}[{lo}:{hi_off}]")
        for i, msg in enumerate(base_msgs):
            for fname, enc in FMTS.items():
                try:
                    pat = enc(*msg)
                except KeyError:
                    continue
                seg = chunk_b[lo:hi_off]
                j = seg.find(pat)
                if j < 0:
                    continue
                off = lo + j
                # confirm: HI message must encode to same offset
                try:
                    pat_h = enc(*hi_msgs[i])
                except KeyError:
                    continue
                same = chunk_h[off : off + len(pat_h)] == pat_h
                flag = (
                    "CONFIRMED"
                    if same and hi_msgs[i] != msg
                    else ("same-val" if hi_msgs[i] == msg else "HI-DIFFERS")
                )
                print(f"  slot{i + 1} {msg}: {fname} @{off} [{flag}]")


if __name__ == "__main__":
    main()
