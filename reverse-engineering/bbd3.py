#!/usr/bin/env python3
import re

def first_pages(path, n=2):
    lines = open(path, encoding="utf-8", errors="replace").readlines()
    out = []
    for ln in lines:
        m = re.search(r"\[open-chocolate\] (RX) [^(]*\(\d+ B\): (f0 [0-9a-f ]+?)device\.ts", ln)
        if not m: continue
        try: b = bytes.fromhex(m.group(2).strip())
        except ValueError: continue
        if len(b)>=20 and b[0]==0xf0 and b[3]==0x0d and b[4]==0x49:
            addr = b[9]|(b[10]<<7)|(b[11]<<14)
            out.append((addr, b[17:-3]))
            if len(out) >= 4: break
    return out

for name, p in [("diff4","usb-capture/console-export-2026-9-5_4-21-39-bank-b-diff4.log")]:
    ps = first_pages(p)
    print(name, "pages:", [(a, len(pl)) for a, pl in ps])
    for a, pl in ps:
        # print head and the region around 100..230
        print(f"  addr {a}: payload[0..20]=", " ".join(f"{x:02x}" for x in pl[:20]))
        nz = [(i, pl[i]) for i in range(90, 300) if pl[i]]
        print(f"     non-zero 90..300: {[(i, hex(v)) for i,v in nz[:30]]}")