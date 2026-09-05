#!/usr/bin/env python3
"""midi.py: MIDI traffic recorder for the choco CLI.

Context manager that runs `aseqdump` on ALSA sequencer ports while a
choco action sequence executes. Received MIDI is streamed live to the
console (prefixed per port) and teed to a timestamped log file for later
protocol analysis.

Usage:
    from midi import record
    from choco import switch, add, remove_all

    with record("WINE midi driver"):
        switch("A")
        add()

Later, when the pedal is in scope, just add its client-name pattern:
    with record("WINE midi driver", "SINCO"):
        ...
"""

from __future__ import annotations

import contextlib
import datetime as dt
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from collections.abc import Sequence

EncodedPort = tuple[str, str, str]  # (port id "N:M", client name, port name)

DEFAULT_PATTERNS = ("WINE midi driver",)

CAPTURES_DIR = "captures"  # recordings live under captures/<MM_DD>/

_LINE_RE = re.compile(r"^\s*(\d+:\d+)\s+(.*)\s{2,}(.*)$")


def list_ports() -> list[EncodedPort]:
    """Parse `aseqdump -l`: (port id, client name, port name) triples."""
    proc = subprocess.run(
        ["aseqdump", "-l"], capture_output=True, text=True, check=False
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"aseqdump -l failed: {proc.stderr.strip() or proc.stdout.strip()}"
        )
    ports = []
    for line in proc.stdout.splitlines():
        m = _LINE_RE.match(line)
        if m:
            ports.append((m.group(1), m.group(2).strip(), m.group(3).strip()))
    return ports


def resolve_ports(patterns: Sequence[str]) -> list[EncodedPort]:
    """Ports whose client name contains any pattern (case-insensitive)."""
    pats = [p.lower() for p in patterns if p]
    if not pats:
        return []
    return [port for port in list_ports() if any(p in port[1].lower() for p in pats)]


def _pump(proc: subprocess.Popen, port: str, log, tee: bool, counts: list[int]) -> None:
    """Forward aseqdump's lines to the log file and (optionally) console."""
    label = f"{port}"
    for line in proc.stdout:
        counts[0] += 1
        log.write(line)
        log.flush()
        if tee:
            print(f"[{label}] {line}", end="", flush=True)
    proc.stdout.close()


def default_log_path() -> str:
    """Default capture path: captures/<MM_DD>/midi_<YYYYmmdd_HHMMSS>.log."""
    now = dt.datetime.now().astimezone()
    return os.path.join(
        CAPTURES_DIR, now.strftime("%m_%d"), f"midi_{now:%Y%m%d_%H%M%S}.log"
    )


def _spawn_tap(
    port_id, client, log, tee, counts, stdbuf, procs, threads, header_written=False
):
    """Start aseqdump for one port, pumping into `log`."""
    if not header_written:
        log.write(f"# port: {port_id} {client}\n")
    cmd = (["stdbuf", "-oL"] if stdbuf else []) + ["aseqdump", "-p", port_id]
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
    )
    procs.append(proc)
    t = threading.Thread(
        target=_pump,
        args=(proc, f"{port_id} {client}", log, tee, counts),
        daemon=True,
    )
    t.start()
    threads.append(t)


@contextlib.contextmanager
def record(
    *patterns: str,
    log_file: str | None = None,
    tee: bool = True,
    wait_for: float = 0.0,
    rescan_after: float = 2.0,
):
    """Run `aseqdump` on all ports matching `patterns` for the duration of
    the `with` block.

    Streams each event live (one line per port, prefixed) and tees it to
    `log_file` (default: `captures/<MM_DD>/midi_<timestamp>.log`). If no
    port matches the patterns, raises RuntimeError listing what's available.

    `rescan_after`: after this many seconds, re-resolve the patterns and
    tap any NEW matching ports (e.g. the app's Wine MIDI port only appears
    once the app itself starts). Set to 0/None to disable.
    """
    ports = resolve_ports(patterns or DEFAULT_PATTERNS)
    if not ports:
        available = "\n".join(f"  {p[0]:>6}  {p[1]}" for p in list_ports())
        raise RuntimeError(
            "no ALSA sequencer port matched "
            f"patterns {patterns or DEFAULT_PATTERNS!r}\navailable:\n{available}"
        )

    if log_file is None:
        log_file = default_log_path()
    os.makedirs(os.path.dirname(log_file) or ".", exist_ok=True)

    stdbuf = shutil.which("stdbuf")  # line-buffer aseqdump's piped stdout
    counts = [0]

    procs: list[subprocess.Popen] = []
    threads: list[threading.Thread] = []

    print(
        f"recording {len(ports)} port(s): "
        f"{', '.join(f'{p[1]} ({p[0]})' for p in ports)} -> {log_file}"
    )

    try:
        with open(log_file, "w") as log:
            # Header so downstream tools (trace.py) can map port ids ->
            # client names and derive direction per event.
            log.write(
                f"# choco midi capture "
                f"{dt.datetime.now().astimezone():%Y-%m-%d %H:%M:%S}\n"
            )
            log.writelines(
                f"# port: {port_id} {client} ({port_name})\n"
                for port_id, client, port_name in ports
            )
            log.write(
                "# cmd: " + " | ".join(f"aseqdump -p {p[0]}" for p in ports) + "\n"
            )
            log.write("--\n")
            for port_id, client, _port_name in ports:
                _spawn_tap(port_id, client, log, tee, counts, stdbuf, procs, threads)

            if rescan_after:
                # Poll for late-appearing ports (e.g. the app's Wine MIDI
                # port shows up only once the app launches). Resolve after a
                # short delay, then every 0.5s until quiet passes find
                # nothing new, bounded by rescan_after total.
                deadline = time.time() + rescan_after
                seen = {p[0] for p in ports}
                quiet = 0
                while time.time() < deadline:
                    new = resolve_ports(patterns or DEFAULT_PATTERNS)
                    added = False
                    for port_id, client, port_name in new:
                        if port_id not in seen:
                            ports.append((port_id, client, port_name))
                            seen.add(port_id)
                            log.write(
                                f"# port+late: {port_id} {client} ({port_name})\n"
                            )
                            log.flush()
                            _spawn_tap(
                                port_id,
                                client,
                                log,
                                tee,
                                counts,
                                stdbuf,
                                procs,
                                threads,
                            )
                            print(f"  late-tapped port: {client} ({port_id})")
                            added = True
                    if added:
                        quiet = 0
                    else:
                        quiet += 1
                        if quiet >= 3:
                            break
                    time.sleep(0.5)

            if wait_for:
                time.sleep(wait_for)

            yield {"log_file": log_file, "ports": ports}

            for proc in procs:
                proc.terminate()
            for proc in procs:
                proc.wait(timeout=5)
            for t in threads:
                t.join(timeout=2)

    finally:
        for proc in procs:
            if proc.poll() is None:
                proc.kill()

    print(f"recorded {counts[0]} event line(s) to {log_file}")


if __name__ == "__main__":
    ports = resolve_ports(DEFAULT_PATTERNS)
    if not ports:
        print(f"no ports matched {DEFAULT_PATTERNS!r}; available:", file=sys.stderr)
        for p in list_ports():
            print(f"  {p[0]:>6}  {p[1]}", file=sys.stderr)
        sys.exit(1)
    print(f"matched: {', '.join(f'{c} ({pid})' for pid, c, _ in ports)}")
