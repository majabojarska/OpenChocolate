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
            # target — a footswitch (02 5D-family) or the DEVICE mode
            # (02 00).
            info["op"] = "49"
            info["op_name"] = "mode"
            info["off"] = f"{b[10]:02X}"
            if (b[8] << 8) | b[9] == DEVICE_MODE_SELECTOR:
                info["switch"] = "device"
                if len(b) >= 18:
                    info["mode"] = DEVICE_MODE_BYTE_TO_NAME.get(b[17], f"0x{b[17]:02X}")
            else:
                sw = MODE_SWITCH_BYTES.get((b[8] << 8) | b[9], "?")
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
