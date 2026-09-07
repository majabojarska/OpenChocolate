#!/usr/bin/env python3
"""Import-capture loop: import each FCP in a dir under MIDI capture.

Saves captures/YYYY-MM-DD/<ts>_camp_<name>.log per file (camp2.capture_path
convention). No read-back, no settle (harvests outgoing page writes only).

Usage: python3 tools/camp_import.py <fcpdir> <name-prefix>
"""

from __future__ import annotations

import glob
import os
import subprocess
import sys
import time

sys.path.insert(0, "tools")
sys.path.insert(0, ".")


def main() -> int:
    fcpdir, prefix = sys.argv[1], sys.argv[2]
    from camp2 import capture_path

    files = sorted(glob.glob(os.path.join(fcpdir, "rand_*.fcp")))
    print(f"{len(files)} FCPs")
    for i, path in enumerate(files):
        name = f"{prefix}_{i:02d}"
        log = capture_path(name)
        code = (
            "from midi import record\n"
            "import subprocess, time\n"
            f'with record("SINCO", "WINE midi driver", log_file="{log}", '
            "tee=False, rescan_after=0):\n"
            "    r = subprocess.run(\n"
            '        ["python3", "choco.py", "import-preset", '
            f'"{os.path.basename(path)[:-4]}"],\n'
            "        capture_output=True, text=True,\n"
            "    )\n"
            '    print("import rc=", r.returncode, flush=True)\n'
            "    time.sleep(3)\n"
        )
        # FCP must be visible in Documents: copy there first
        import shutil

        docs = os.path.expanduser(
            "~/.var/app/com.usebottles.bottles/data/bottles/bottles/"
            "Chocolate/drive_c/users/maja/Documents"
        )
        shutil.copy(path, os.path.join(docs, os.path.basename(path)))
        r = subprocess.run(
            ["python3", "-c", code], capture_output=True, text=True, check=False
        )
        print(
            f"[{i}] {name}: {r.stdout.strip()[-60:] or r.stderr.strip()[-120:]}",
            flush=True,
        )
        if "rc= 0" not in r.stdout and "rc=0" not in r.stdout:
            print(f"  IMPORT FAILED for {path}", file=sys.stderr)
            return 1
        time.sleep(2)
    print("CAMP_IMPORT_DONE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
