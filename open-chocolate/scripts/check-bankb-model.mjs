#!/usr/bin/env node
/** Decode the full-bank Bank B cells (6B at 194+s*6) with the 7 family codecs. */
import { readFileSync } from 'node:fs';
import { stdout } from 'node:process';
const out = (s) => stdout.write(s + '\n');
const path = process.argv[2] || '/tmp/dump-clean.txt';
const m = {};
for (const line of readFileSync(path, 'utf8').split('\n')) {
  const mm = /^(\d+)=([0-9a-f]{2}|\?\?)$/.exec(line.trim());
  if (mm) m[+mm[1]] = mm[2] === '??' ? undefined : parseInt(mm[2], 16);
}
const B = (b) => (m[b] === undefined ? 0 : m[b]);

function decB(mark, c) {
  switch (mark) {
    case 0x02:
      return {
        ch: (c[0] >> 2) & 0xf,
        type: (c[1] >> 3) & 7,
        d1: ((c[3] & 0x1f) << 3) | ((c[2] >> 4) & 7),
        d2: ((c[4] & 0x1f) << 2) | ((c[3] >> 5) & 3),
      };
    case 0x04:
      return {
        ch: (c[0] >> 3) & 0xf,
        type: (c[1] >> 4) & 7,
        d1: ((c[3] & 0x3f) << 2) | ((c[2] >> 5) & 3),
        d2: ((c[4] << 1) & 0x7e) | ((c[3] >> 6) & 1),
      };
    case 0x08:
      return {
        ch: ((c[0] >> 4) & 7) | ((c[1] & 1) << 3),
        type: ((c[1] >> 5) & 3) | ((c[2] & 1) << 2),
        d1: ((c[3] & 0x7f) << 1) | ((c[2] >> 6) & 1),
        d2: c[4] & 0x7f,
      };
    case 0x01:
      return {
        ch: (c[0] >> 1) & 0x7f,
        type: (c[1] >> 2) & 7,
        d1: ((c[3] & 0xf) << 4) | ((c[2] >> 3) & 0xf),
        d2: ((c[3] >> 4) & 7) | (((c[4] ?? 0) & 7) << 3),
      };
    case 0x10:
      return {
        ch: (c[0] & 0x20 ? 1 : 0) | ((c[0] & 0x40 ? 1 : 0) << 1) | ((c[1] & 3) << 2),
        type: ((c[1] >> 6) & 1) | ((c[2] & 3) << 1),
        d1: c[3] & 0x7f,
        d2: ((c[5] & 1) << 6) | (c[4] >> 1),
      };
    case 0x20:
      return {
        ch: ((c[0] >> 6) & 1) | ((c[1] << 1) & 0x7e),
        type: c[2] & 7,
        d1: ((c[3] >> 1) & 0x3f) | ((c[4] & 1) << 6),
        d2: ((c[5] & 3) << 5) | (c[4] >> 2),
      };
    case 0x40:
      return {
        ch: c[1] & 0xf,
        type: (c[2] >> 1) & 7,
        d1: ((c[3] >> 2) & 0x1f) | ((c[4] & 3) << 5),
        d2: ((c[5] & 7) << 4) | (c[4] >> 3),
      };
  }
}

for (let s = 0; s < 6; s++) {
  const off = 194 + s * 6;
  const mk = B(off);
  const c = [];
  for (let j = 1; j < 6; j++) c.push(B(off + j));
  const d = decB(mk, c);
  const want = { ch: (s + 1) % 16, type: 1, d1: 11 + s, d2: 22 + s };
  const match =
    d && d.ch === want.ch && d.type === want.type && d.d1 === want.d1 && d.d2 === want.d2;
  out(
    `cell ${s} mark=${mk.toString(16).padStart(2, '0')} raw=${c.map((x) => x.toString(16).padStart(2, '0')).join(' ')} ` +
      `${d ? `dec={${d.ch},${d.type},${d.d1},${d.d2}}` : '(no dec)'} want={${want.ch},${want.type},${want.d1},${want.d2}} ${match ? 'OK' : 'FAIL'}`
  );
}
