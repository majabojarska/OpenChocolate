#!/usr/bin/env node
/**
 * Final full-bank Bank A decode from a dump-clean.txt blob map.
 * Usage: node scripts/check-banka-model.mjs /tmp/dump-clean.txt
 */
import { readFileSync } from 'node:fs';
import { stdout } from 'node:process';
const out = (s) => stdout.write(s + '\n');

const path = process.argv[2] || '/tmp/dump-clean.txt';
const m = {};
for (const line of readFileSync(path, 'utf8').split('\n')) {
  const mm = /^(\d+)=([0-9a-f]{2}|\?\?)$/.exec(line.trim());
  if (mm) m[+mm[1]] = mm[2] === '??' ? undefined : parseInt(mm[2], 16);
}
const B = (b) => m[b];

const P = [107, 113, 118, 124, 130, 136, 141, 147, 153, 158, 164, 170, 176, 181, 187, 193];
const M = [0x08, 0x02, 0x40, 0x10, 0x04, 0x01, 0x20];
const mark = (i) => M[i % 7];
const LEN = (i) => (mark(i) <= 0x08 ? 6 : 7);

function dec(m, c) {
  switch (m) {
    case 0x08:
      return {
        ch: ((c[0] >> 4) & 7) | ((c[1] & 1) << 3),
        type: ((c[1] >> 5) & 3) | ((c[2] & 1) << 2),
        d1: ((c[3] & 0x7f) << 1) | ((c[2] >> 6) & 1),
        d2: c[4] & 0x7f,
      };
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
    case 0x01:
      // 5 content bytes [1..5]: b1=ch<<1, b2=type<<2, b3=(d1&0xf)<<3,
      // b4=((d2&7)<<4)|(d1>>4), and b5 is the NEXT slot's marker byte whose
      // low 3 bits carry d2 bits 3..5 (marker-OR). In a full bank:
      //   d1 = ((b4&0xf)<<4)|((b3>>3)&0xf); d2 = (b4>>4) | ((b5&7)<<3)
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

const want = (i) =>
  i % 5 === 0
    ? { ch: i, type: i % 5, d1: 10 + i, d2: 0 }
    : { ch: i, type: i % 5, d1: 10 + i, d2: 30 + i };

let ok = 0,
  bad = 0;
for (let i = 0; i < 16; i++) {
  const m = mark(i);
  const L = LEN(i);
  const c = [];
  for (let j = 1; j < L; j++) {
    const v = B(P[i] + j);
    if (v === undefined) {
      console.log('FAIL', i, 'missing blob', P[i] + j);
      bad++;
      continue;
    }
    c.push(v);
  }
  if (c.length < L - 1) continue;
  const d = dec(m, c);
  const w = want(i);
  const match = d && d.ch === w.ch && d.type === w.type && d.d1 === w.d1 && d.d2 === w.d2;
  if (match) ok++;
  else {
    bad++;
    console.log(
      'FAIL',
      i,
      'm' + m.toString(16).padStart(2, '0'),
      'raw',
      c.map((x) => x.toString(16).padStart(2, '0')).join(' '),
      'dec',
      JSON.stringify(d),
      'want',
      JSON.stringify(w)
    );
  }
}
console.log('BankA', ok + '/16 exact,', bad, 'fail');
