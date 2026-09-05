#!/usr/bin/env python3
import re

def page0(path):
    lines = open(path, encoding="utf-8", errors="replace").readlines()
    for ln in lines:
        m = re.search(r"\[open-chocolate\] (RX) [^(]*\(\d+ B\): (f0 [0-9a-f ]+?)device\.ts", ln)
        if not m: continue
        try: b = bytes.fromhex(m.group(2).strip())
        except ValueError: continue
        if len(b)>=20 and b[0]==0xf0 and b[3]==0x0d and b[4]==0x49 and b[9]==0 and b[10]==0 and b[11]==0:
            pl = b[17:-3]
            if pl[108]!=0 or pl[198]!=0:
                return pl
    return None

logs = {
  "diff4": ("usb-capture/console-export-2026-9-5_4-21-39-bank-b-diff4.log", (0,2,27,29)),
  "diff5": ("usb-capture/console-export-2026-9-5_4-23-54-bank-b-diff-5.log", (0,2,26,29)),
  "diff6": ("usb-capture/console-export-2026-9-5_4-25-23-bank-b-diff-6.log", (0,2,27,28)),
}
pages = {}
for k,(p,exp) in logs.items():
    pl = page0(p)
    pages[k] = pl
    if pl:
        print(f"{k} [3]={exp}: bankB 194..240: " + " ".join(f"{pl[i]:02x}" for i in range(194,240)))
    else:
        print(f"{k}: NO PAGE")
print()
for name in ("diff5","diff6"):
    if pages[name] and pages["diff4"]:
        print(f"=== {name} vs diff4 (190..250) ===")
        for i in range(190, 250):
            a = pages["diff4"][i]; b = pages[name][i]
            if a != b:
                print(f"  {i}: diff4={a:02x} {name}={b:02x}")