#!/usr/bin/env python3
"""Generate .FCP preset files from a structured device representation.

Format map (reverse-engineered 2026-09-07, see REVERSED_PROTOCOL_SPEC.md):
- 23646 bytes total; fixed template + per-foot regions + global bytes.
- Foot regions at 95 + 417*k (A=95, B=512, C=929, D=1346), each 417 bytes:
  bank A records at +0, bank B records at +80 (16 x 5 bytes each):
  [ch-1, type(0=pc,1=cc,2=noteon,3=noteoff), d1, d2, flag]
  flag = 01 iff another slot follows (i < count-1), 00 for the last
  slot (rec15 byte always 01); import reads while-01-plus-one, cap 16.
- Per-foot mode byte at region_start - 2 (A@93, B@510, C@927, D@1344).
  NOTE: @93 also mirrors the VIEWED foot's mode; footswitch mode may be
  effectively global (see spec). Values 0x00-0x04 (single1, double1,
  press, long1, stepshortlong).
- Global bytes: @0 device mode (0x00-0x0C), @1 TRS mode (0=expr,1=midi),
  @23642 polarity (0=normal,1=reversed).
- Everything else: copied verbatim from a template export.

Usage: python3 tools/gen_fcp.py spec.json out.fcp [template.fcp]
Spec JSON: {device_mode, trs_mode, polarity, feet: {A: {mode, bank_a:
[[ch,type,d1,d2]...], bank_b: [...]}, ...}} (type as pc/cc/noteon/noteoff
string; d2 defaults 0; omit d2 for pc).
"""

from __future__ import annotations

import json
import os
import sys

FOOT_ORDER = ["A", "B", "C", "D"]
FOOT_BASE = {"A": 95, "B": 512, "C": 929, "D": 1346}
REGION_STRIDE = 417
BANK_B_OFF = 80
MAX_SLOTS = 16

DEVICE_MODES = {
    "program_change_a": 0x00,
    "program_change_b": 0x01,
    "custom": 0x02,
    "advanced_custom": 0x03,
    "manufacturer_control": 0x04,
    "touch_screen_android": 0x05,
    "video_control": 0x06,
    "keyboard_a": 0x07,
    "keyboard_b": 0x08,
    "multimedia_keyboard": 0x09,
    "custom_keyboard": 0x0A,
    "mix": 0x0B,
    "speaker": 0x0C,
}
FOOT_MODES = {
    "single_step_single_bank": 0x00,
    "single_step_double_bank": 0x01,
    "press_down_release_double_bank": 0x02,
    "long_step_single_bank": 0x03,
    "step_short_or_long_double_bank": 0x04,
}
TYPES = {"pc": 0, "cc": 1, "noteon": 2, "noteoff": 3}
TRS_MODES = {"expression_pedal": 0, "trs_midi": 1}


def encode_bank(records: list[list], data: bytearray, off: int) -> None:
    """Write up to 16 [ch,type,d1,d2] slot records at data[off:off+80]."""
    if len(records) > MAX_SLOTS:
        raise ValueError(f"{len(records)} slots exceeds {MAX_SLOTS}")
    n = len(records)
    for i, (ch, ty, d1, d2) in enumerate(records):
        if not 1 <= ch <= 16:
            raise ValueError(f"slot {i + 1}: channel {ch}")
        if ty not in TYPES:
            raise ValueError(f"slot {i + 1}: type {ty}")
        if not 0 <= d1 <= 127:
            raise ValueError(f"slot {i + 1}: data1 {d1}")
        if not 0 <= (d2 or 0) <= 127:
            raise ValueError(f"slot {i + 1}: data2 {d2}")
        o = off + i * 5
        data[o] = ch - 1
        data[o + 1] = TYPES[ty]
        data[o + 2] = d1
        data[o + 3] = d2 or 0
        data[o + 4] = 0x01 if i < n - 1 or n == MAX_SLOTS else 0x00
    for i in range(n, MAX_SLOTS):
        o = off + i * 5
        data[o : o + 5] = [0, 0, 0, 0, 0]
    data[off + 15 * 5 + 4] = 0x01  # rec15 byte always 01 (observed)


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: gen_fcp.py spec.json out.fcp [template.fcp]", file=sys.stderr)
        return 2
    spec = json.load(open(sys.argv[1]))
    template = (
        sys.argv[3]
        if len(sys.argv) > 3
        else os.path.expanduser(
            "~/.var/app/com.usebottles.bottles/data/bottles/bottles/"
            "Chocolate/drive_c/users/maja/Documents/fcp_anchor.fcp"
        )
    )
    data = bytearray(open(template, "rb").read())
    if len(data) != 23646:
        print(f"template {len(data)} bytes, expected 23646", file=sys.stderr)
        return 1
    try:
        data[0] = DEVICE_MODES[spec["device_mode"]]
        data[1] = TRS_MODES[spec["trs_mode"]]
        data[23642] = 1 if spec["polarity"] else 0
        for foot in FOOT_ORDER:
            f = spec["feet"][foot]
            base = FOOT_BASE[foot]
            data[base - 2] = FOOT_MODES[f["mode"]]
            encode_bank(f.get("bank_a", []), data, base)
            encode_bank(f.get("bank_b", []), data, base + BANK_B_OFF)
    except KeyError as e:
        print(f"spec error: unknown name {e}", file=sys.stderr)
        return 1
    except ValueError as e:
        print(f"spec error: {e}", file=sys.stderr)
        return 1
    open(sys.argv[2], "wb").write(bytes(data))
    print(f"wrote {sys.argv[2]} ({len(data)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
