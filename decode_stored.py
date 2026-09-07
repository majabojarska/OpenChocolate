#!/usr/bin/env python3
"""Decode foot B/C/D *stored* bank regions from the init read-back.

Stored packings reuse the viewed format palette per-slot (see fmt_search6
6-point matches); each (foot, bank, slot) has its own (chunk, offset,
format). Slots marked None are still unsolved (solve_stored.py, needs
round-2 randoms). Viewed foot-A banks use trace.decode_bank_a_slots /
decode_b_slots.
"""

from __future__ import annotations

BA = {0: "pc", 1: "cc", 2: "noteon", 3: "noteoff"}
TA = {0: "pc", 2: "cc", 4: "noteon", 6: "noteoff"}
BB = {0: "pc", 1: "noteon", 2: "cc", 3: "noteoff"}
BBS5 = {0: "pc", 1: "cc", 2: "noteon", 3: "noteoff"}
S5VIEW_T = {0x00: "pc", 0x10: "cc", 0x20: "noteon", 0x30: "noteoff"}


def _mk(ch, t, d1, d2):
    return {"channel": ch, "type": t, "data1": d1, "data2": d2 if t != "pc" else 0}


def dec_s10a(c: bytes, o: int):
    t = TA.get(c[o + 1], "?")
    d1 = (c[o + 2] >> 2) | ((c[o + 3] & 3) << 5)
    d2 = ((c[o + 3] >> 3) & 0x0F) | ((c[o + 4] & 0x0F) << 4)
    return _mk(c[o] + 1, t, d1, d2)


def dec_s8f(c: bytes, o: int):
    t = BA.get(c[o + 1] >> 5, "?")
    ch = (((c[o] >> 4) & 7) | ((c[o + 1] & 1) << 3)) + 1
    return _mk(ch, t, (c[o + 3] << 1) | (c[o + 2] >> 6), c[o + 4])


def dec_s9(c: bytes, o: int):
    t = BA.get(c[o + 1] >> 3, "?")
    return _mk(
        ((c[o] >> 2) & 0x0F) + 1,
        t,
        (c[o + 2] >> 4) | ((c[o + 3] & 0x1F) << 3),
        ((c[o + 4] - 0x40) << 2) | (c[o + 3] >> 5),
    )


def dec_fmtc(c: bytes, o: int):
    t = S5VIEW_T.get(c[o + 1], "?")
    return _mk(
        (c[o] >> 3) + 1,
        t,
        ((c[o + 2] >> 5) & 3) | ((c[o + 3] & 0x1F) << 2),
        (c[o + 4] << 1) | ((c[o + 3] >> 6) & 1),
    )


def dec_fmtg(c: bytes, o: int):
    t = BB.get((((c[o + 1] >> 3) & 1) << 1) | ((c[o + 1] >> 4) & 1), "?")
    return _mk(
        (c[o] >> 2) + 1,
        t,
        ((c[o + 3] & 0x0F) << 3) | ((c[o + 2] >> 4) & 7),
        ((c[o + 4] & 0x1F) << 2) | ((c[o + 3] >> 5) & 3),
    )


def dec_fmtd(c: bytes, o: int):
    t = BBS5.get(c[o + 1] >> 2, "?")
    return _mk(
        (c[o] >> 1) + 1,
        t,
        ((c[o + 2] >> 3) & 0x0F) | ((c[o + 3] & 7) << 4),
        ((c[o + 4] & 0x0F) << 3) | ((c[o + 3] >> 4) & 7),
    )


def dec_fmte(c: bytes, o: int):
    t = BBS5.get(c[o + 2], "?")
    return _mk(
        (((c[o] >> 6) & 1) | (c[o + 1] << 1)) + 1,
        t,
        (c[o + 3] >> 1) | ((c[o + 4] & 1) << 6),
        ((c[o + 4] >> 2) & 0x1F) | ((c[o + 5] & 1) << 5) | (((c[o + 5] >> 1) & 1) << 6),
    )


DECS = {
    "s10a": (dec_s10a, 5),
    "s8f": (dec_s8f, 5),
    "s9": (dec_s9, 5),
    "fmtc": (dec_fmtc, 5),
    "fmtg": (dec_fmtg, 5),
    "fmtd": (dec_fmtd, 5),
    "fmte": (dec_fmte, 6),
}

# (foot, bank, slot) -> (chunk addr, offset, format). None = unsolved.
# fmtd offsets point at the ch byte (0x01 flag lives at off-1).
HOMES: dict[tuple[str, str, int], tuple[tuple[int, int, int], int, str] | None] = {
    ("B", "a", 1): ((0, 0, 0), 585, "fmtd"),
    ("B", "a", 2): ((0, 0, 0), 590, "fmte"),
    ("B", "a", 3): ((0, 0, 0), 596, "s8f"),
    ("B", "a", 4): ((0, 0, 0), 602, "s9"),
    ("B", "a", 5): ((0, 0, 0), 608, "s10a"),
    ("B", "a", 6): None,
    ("B", "a", 7): ((0, 0, 0), 619, "fmtc"),
    ("B", "a", 8): ((0, 0, 0), 625, "fmtd"),
    ("B", "a", 9): ((0, 0, 0), 630, "fmte"),
    ("B", "a", 10): ((0, 0, 0), 636, "s8f"),
    ("B", "b", 1): ((0, 0, 0), 676, "s8f"),
    ("B", "b", 2): ((0, 0, 0), 682, "s9"),
    ("B", "b", 3): ((0, 0, 0), 688, "s10a"),
    ("B", "b", 4): None,
    ("B", "b", 5): ((0, 0, 0), 699, "fmtc"),
    ("B", "b", 6): ((0, 0, 0), 705, "fmtd"),
    ("B", "b", 7): ((0, 0, 0), 710, "fmte"),
    ("B", "b", 8): ((0, 0, 0), 716, "s8f"),
    ("B", "b", 9): ((0, 0, 0), 722, "s9"),
    ("B", "b", 10): None,
    ("C", "a", 1): None,
    ("C", "a", 2): ((0, 0, 0), 1067, "fmtc"),
    ("C", "a", 3): ((0, 0, 0), 1073, "fmtd"),
    ("C", "a", 4): ((0, 0, 0), 1078, "fmte"),
    ("C", "a", 5): ((0, 0, 0), 1084, "s8f"),
    ("C", "a", 6): ((0, 0, 0), 1090, "s9"),
    ("C", "a", 7): ((0, 0, 0), 1096, "s10a"),
    ("C", "a", 8): None,
    ("C", "a", 9): ((0, 0, 0), 1107, "fmtc"),
    ("C", "a", 10): None,
    ("C", "b", 1): ((113, 7, 0), 0, "s10a"),
    ("C", "b", 2): None,
    ("C", "b", 3): ((113, 7, 0), 11, "fmtc"),
    ("C", "b", 4): ((113, 7, 0), 17, "fmtd"),
    ("C", "b", 5): ((113, 7, 0), 22, "fmte"),
    ("C", "b", 6): ((113, 7, 0), 28, "s8f"),
    ("C", "b", 7): ((113, 7, 0), 34, "s9"),
    ("C", "b", 8): ((113, 7, 0), 40, "s10a"),
    ("C", "b", 9): None,
    ("C", "b", 10): ((113, 7, 0), 51, "fmtc"),
    ("D", "a", 1): ((113, 7, 0), 385, "fmtd"),
    ("D", "a", 2): ((113, 7, 0), 390, "fmte"),
    ("D", "a", 3): ((113, 7, 0), 396, "s8f"),
    ("D", "a", 4): ((113, 7, 0), 402, "s9"),
    ("D", "a", 5): ((113, 7, 0), 408, "s10a"),
    ("D", "a", 6): None,
    ("D", "a", 7): ((113, 7, 0), 419, "fmtc"),
    ("D", "a", 8): ((113, 7, 0), 425, "fmtd"),
    ("D", "a", 9): ((113, 7, 0), 430, "fmte"),
    ("D", "a", 10): ((113, 7, 0), 436, "s8f"),
    ("D", "b", 1): ((113, 7, 0), 476, "s8f"),
    ("D", "b", 2): ((113, 7, 0), 482, "s9"),
    ("D", "b", 3): ((113, 7, 0), 488, "s10a"),
    ("D", "b", 4): None,
    ("D", "b", 5): ((113, 7, 0), 499, "fmtc"),
    ("D", "b", 6): ((113, 7, 0), 505, "fmtd"),
    ("D", "b", 7): ((113, 7, 0), 510, "fmte"),
    ("D", "b", 8): ((113, 7, 0), 516, "s8f"),
    ("D", "b", 9): ((113, 7, 0), 522, "s9"),
    ("D", "b", 10): None,
}


def dec_bits(c: bytes, base: int, spec) -> dict | None:
    """Generic scattered-bits decoder for solved stored slots.

    spec = (ch_poss, d1_poss, d2_poss, type_bits, type_table) with positions
    as (byte offset from base, bit) per value bit, type_table mapping code
    tuples to types. Unlisted codes decode as '?'."""
    chp, d1p, d2p, tbit, ttable = spec

    def get(poss):
        v = 0
        for k, (o, b) in enumerate(poss):
            v |= ((c[base + o] >> b) & 1) << k
        return v

    code = tuple((c[base + o] >> b) & 1 for o, b in tbit)
    t = ttable.get(code, "?")
    return _mk(get(chp) + 1, t, get(d1p), get(d2p))


# Solved-by-solver stored slots: (foot, bank, slot) -> (base, spec).
# From solve_stored.py over 10 samples each (BASE + HI + 8 randoms), zero
# dissenters. ch/d1/d2 as position lists, types as empirical code tables.
# Solved-by-solver stored slots: (foot, bank, slot) -> (base, spec) with
# spec = (ch_poss, d1_poss, d2_poss, type_bits, type_table). From
# solve_stored.py over 10 samples each (BASE + HI + 8 randoms), zero
# dissenters. Positions are (byte offset from base, bit) per value bit;
# type_table maps code tuples to types (unlisted -> '?').
STORED_BITS: dict[tuple[str, str, int], tuple] = {
    ("B", "a", 6): (
        (0, 0, 0),
        613,
        (
            [(0, 5), (0, 6), (1, 0), (1, 1)],
            [(3, 0), (3, 1), (3, 2), (3, 3), (3, 4), (3, 5), (3, 6)],
            [(4, 1), (4, 2), (4, 3), (4, 4), (4, 5), (4, 6), (5, 0)],
            [(1, 6), (2, 0)],
            {(0, 0): "pc", (1, 0): "cc", (0, 1): "noteon", (1, 1): "noteoff"},
        ),
    ),
    ("B", "b", 4): (
        (0, 0, 0),
        693,
        (
            [(0, 5), (0, 6), (1, 0), (1, 1)],
            [(3, 0), (3, 1), (3, 2), (3, 3), (3, 4), (3, 5), (3, 6)],
            [(4, 1), (4, 2), (4, 3), (4, 4), (4, 5), (4, 6), (5, 0)],
            [(1, 6), (2, 0)],
            {(0, 0): "pc", (1, 0): "cc", (0, 1): "noteon", (1, 1): "noteoff"},
        ),
    ),
    ("B", "b", 10): (
        (0, 0, 0),
        727,
        (
            [(1, 0), (1, 1), (1, 2), (1, 3)],
            [(3, 2), (3, 3), (3, 4), (3, 5), (3, 6), (4, 0), (4, 1)],
            [(4, 3), (4, 4), (4, 5), (4, 6), (5, 0), (5, 1), (5, 2)],
            [(2, 1), (2, 2)],
            {(0, 0): "pc", (1, 0): "cc", (0, 1): "noteon", (1, 1): "noteoff"},
        ),
    ),
    ("C", "a", 1): (
        (0, 0, 0),
        1055,
        (
            [(6, 5), (6, 6), (7, 0), (7, 1)],
            [(9, 0), (9, 1), (9, 2), (9, 3), (9, 4), (9, 5), (9, 6)],
            [(10, 1), (10, 2), (10, 3), (10, 4), (10, 5), (10, 6), (9, 2)],
            [(7, 6), (8, 0)],
            {(0, 0): "pc", (1, 0): "cc", (1, 1): "noteoff"},
        ),
    ),
    # NOTE C-A s10: ch-b3 and d2-b3 share +3:4 in this fit (they agreed on
    # all 10 samples); one of them is a correlated stand-in. Future
    # spot-checks arbitrate; the fit is exact on all evidence to date.
    ("C", "a", 10): (
        (0, 0, 0),
        1110,
        (
            [(3, 1), (3, 2), (3, 3), (3, 4)],
            [(5, 3), (1, 5), (4, 2), (5, 6), (6, 0), (6, 1), (6, 2)],
            [(6, 4), (6, 5), (0, 5), (3, 4), (7, 1), (7, 2), (7, 3)],
            [(3, 3), (4, 2), (4, 3), (5, 5)],
            {
                (1, 0, 0, 0): "pc",
                (1, 1, 0, 1): "cc",
                (0, 0, 1, 0): "noteon",
                (0, 1, 1, 1): "noteoff",
            },
        ),
    ),
    ("C", "a", 8): (
        (0, 0, 0),
        1101,
        (
            [(0, 5), (0, 6), (1, 0), (1, 1)],
            [(3, 0), (3, 1), (3, 2), (3, 3), (3, 4), (3, 5), (3, 6)],
            [(4, 1), (4, 2), (4, 3), (4, 4), (4, 5), (4, 6), (5, 0)],
            [(1, 6), (2, 0)],
            {(1, 0): "cc", (0, 1): "noteon", (1, 1): "noteoff"},
        ),
    ),
    ("C", "b", 2): (
        (113, 7, 0),
        5,
        (
            [(0, 5), (0, 6), (1, 0), (1, 1)],
            [(3, 0), (3, 1), (3, 2), (3, 3), (3, 4), (3, 5), (3, 6)],
            [(4, 1), (4, 2), (4, 3), (4, 4), (4, 5), (4, 6), (5, 0)],
            [(1, 6), (2, 0)],
            {(0, 0): "pc", (1, 0): "cc", (0, 1): "noteon", (1, 1): "noteoff"},
        ),
    ),
    ("C", "b", 9): (
        (113, 7, 0),
        45,
        (
            [(0, 5), (0, 6), (1, 0), (1, 1)],
            [(3, 0), (3, 1), (3, 2), (3, 3), (3, 4), (3, 5), (3, 6)],
            [(4, 1), (4, 2), (4, 3), (4, 4), (4, 5), (4, 6), (5, 0)],
            [(1, 6), (2, 0)],
            {(0, 0): "pc", (1, 0): "cc", (0, 1): "noteon", (1, 1): "noteoff"},
        ),
    ),
    ("D", "a", 6): (
        (113, 7, 0),
        413,
        (
            [(0, 5), (0, 6), (1, 0), (1, 1)],
            [(3, 0), (3, 1), (3, 2), (3, 3), (3, 4), (3, 5), (3, 6)],
            [(4, 1), (4, 2), (4, 3), (4, 4), (4, 5), (4, 6), (5, 0)],
            [(1, 6), (2, 0)],
            {(0, 0): "pc", (1, 0): "cc", (0, 1): "noteon", (1, 1): "noteoff"},
        ),
    ),
    ("D", "b", 4): (
        (113, 7, 0),
        493,
        (
            [(0, 5), (0, 6), (1, 0), (1, 1)],
            [(3, 0), (3, 1), (3, 2), (3, 3), (3, 4), (3, 5), (3, 6)],
            [(4, 1), (4, 2), (4, 3), (4, 4), (4, 5), (4, 6), (5, 0)],
            [(1, 6), (2, 0)],
            {(0, 0): "pc", (1, 0): "cc", (0, 1): "noteon", (1, 1): "noteoff"},
        ),
    ),
    ("D", "b", 10): (
        (113, 7, 0),
        527,
        (
            [(1, 0), (1, 1), (1, 2), (1, 3)],
            [(3, 2), (3, 3), (3, 4), (3, 5), (3, 6), (4, 0), (4, 1)],
            [(4, 3), (4, 4), (4, 5), (4, 6), (5, 0), (5, 1), (5, 2)],
            [(2, 1), (2, 2)],
            {(0, 0): "pc", (1, 0): "cc", (0, 1): "noteon", (1, 1): "noteoff"},
        ),
    ),
}


def decode_home(chunks: dict, foot: str, bank: str) -> list[dict | None]:
    """Decode the 10 stored slots of one home; None for unsolved slots."""
    out = []
    for i in range(1, 11):
        if (foot, bank, i) in STORED_BITS:
            addr, base, spec = STORED_BITS[(foot, bank, i)]
            chunk = chunks.get(addr, b"")
            out.append(dec_bits(chunk, base, spec) if len(chunk) >= base + 8 else None)
            continue
        spec = HOMES[(foot, bank, i)]
        if spec is None:
            out.append(None)
            continue
        addr, off, fmt = spec
        dec, _ = DECS[fmt]
        chunk = chunks.get(addr, b"")
        if len(chunk) < off + 6:
            out.append(None)
            continue
        out.append(dec(chunk, off))
    return out
