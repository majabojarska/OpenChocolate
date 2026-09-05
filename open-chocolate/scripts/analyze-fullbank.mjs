#!/usr/bin/env node
/**
 * Ground-truth full-bank decode of Bank A slots 0..15 (12/2 working, rest
 * partial). Uses the fixed position map + single-field-delta-derived codecs.
 * Run: node scripts/analyze-fullbank.mjs
 */
import { readFileSync } from 'node:fs';
import { stdout } from 'node:process';
const out = (s) => stdout.write(s + '\n');

// fixed positions (single-slot walk, confirmed by full-bank deltas)
const P = [107, 113, 118, 124, 130, 136, 141, 147, 153, 158, 164, 170, 176, 181, 187, 193];
const MARK_BY_IDX = [0x08, 0x02, 0x40, 0x10, 0x04, 0x01, 0x20];
const mark = (i) => MARK_BY_IDX[i % 7];
const len = (i) => (mark(i) <= 0x08 ? 6 : 7);

// decoders from the deltas (content = after mark)
const dec02 = (r) => ({
  ch: (r[0] >> 2) & 0xf,
  type: (r[1] >> 3) & 7,
  d1: ((r[3] & 0x1f) << 3) | ((r[2] >> 4) & 7),
  d2: ((r[4] & 0x1f) << 2) | ((r[3] >> 5) & 3),
});
const dec04 = (r) => ({
  ch: (r[0] >> 3) & 0xf,
  type: (r[1] >> 4) & 7,
  d1: ((r[3] & 0x3f) << 2) | ((r[2] >> 5) & 3),
  d2: ((r[4] << 1) & 0x7e) | ((r[3] >> 6) & 1),
});
const dec08 = (r) => ({
  ch: ((r[0] >> 4) & 7) | ((r[1] & 1) << 3),
  type: ((r[1] >> 5) & 3) | ((r[2] & 1) << 2),
  d1: ((r[3] & 0x7f) << 1) | ((r[2] >> 6) & 1),
  d2: r[4] & 0x7f,
});
const dec01 = (r) => ({
  ch: (r[0] >> 1) & 0x7f,
  type: (r[1] >> 2) & 7,
  d1: ((r[3] & 0xf) << 4) | ((r[2] >> 3) & 0xf),
  d2: ((r[4] & 0x7f) << 3) | ((r[3] >> 4) & 7),
});
// 0x10-family: from deltas (slot 3: type→126, d1→128, d2→129)
// slot3 full cell [124]=10 [125]=60 [126]=40 [127]=01 [128]=0d [129]=42
//   ch bits in 125 (60=2<<5? no—marker lineage). 125:60: ch=3 -> 3<<5=60 ✓
//   type bits: 126:40, type=3 -> 40 = 3<<6?? no. Use 128 (d1=13=0d literal)
//  => type stored at 126 low 2 bits? 40 = 0b1000000. Hmm.
// slot13 (marker 0x20): [181]=20 [182]=40 [183]=06 [184]=03 [185]=2e [186]=2c
//   ch=13: 182:40 = 13<<2? no (52=0x34). type=3 at 184:03 ✓ ; d1=23 at 185:2e (23<<1=46=0x2e ✓); d2=43 at 186:2c (43>>1? 43=0x2b, >>1=21≠0x2c)
// slot9 (0x40): [158]=40 [159]=00 [160]=09 [161]=08 [162]=4c [163]=38
//   ch=9: 160:09 literal ✓ ; type=4: 161:08 (4<<1=8 ✓) ; d1=19: 162:4c (19<<2=76=0x4c ✓) ; d2=39: 163:38 (39<<3=312 masked 0x38? 39=0x27, <<3=0x138 &0x7f=0x38 ✓)
//   => 0x40: [b1]=ch literal, [b2]=type<<1, [b3]=d1<<2, [b4]=d2<<3 (masked)
// slot6 (0x20): [141]=20 [142]=00 [143]=03 [144]=01 [145]=20 [146]=10
//   ch=6: 142:00 (ch bit0? 6&1=0 at bit6? 142 is 0) ; type=1: 144:01 ✓ ; d1=16: 145:20 (16<<1=32=0x20 ✓) ; d2=36: 146:10 (36<<2=144 &0x7f=0x10 ✓)
//   => 0x20: [b1]=ch<<6? (ch bit0 at bit6, ch>>1 at lower bits... store ch<<1 masked into b1+b2)
const dec10 = (r) => ({
  ch: (r[0] >> 1) & 0xf,
  type: (r[1] >> 6) & 1, // placeholder
  d1: r[2] & 0x7f,
  d2: (r[3] & 0x7f) >> 1,
});
const dec20 = (r) => ({
  ch: (r[0] >> 1) & 0xf,
  type: r[1] & 0x7, // placeholder
  d1: r[2] << 1,
  d2: (r[3] & 0x7f) >> 2,
});
const dec40 = (r) => ({
  ch: r[0] & 0xf,
  type: (r[1] >> 1) & 7,
  d1: (r[2] << 2) & 0x7f,
  d2: (r[3] << 3) & 0x7f,
});
const DEC = {
  0x02: dec02,
  0x04: dec04,
  0x08: dec08,
  0x01: dec01,
  0x10: dec10,
  0x20: dec20,
  0x40: dec40,
};

function main() {
  const path = process.argv[2] || '/tmp/fullbank.out';
  const lines = readFileSync(path, 'utf8').split('\n');
  const baseLine = lines.find((l) => l.startsWith('full bank baseline'));
  if (!baseLine) throw new Error('no baseline in ' + path);
  const full = baseLine.split(': ').slice(1).join(': ').trim().split(/\s+/).map(Number);
  let ok = 0,
    partial = 0,
    bad = 0;
  for (let i = 0; i < 16; i++) {
    const m = mark(i);
    const L = len(i);
    const cell = full.slice(P[i] - 106, P[i] - 106 + L);
    const content = cell.slice(1);
    // mask the NEXT slot's mark OR'd into the last content byte
    if (i < 15) {
      const last = content.length - 1;
      content[last] &= ~mark(i + 1) & 0x7f;
    }
    const d = DEC[m](content);
    const w = { ch: i, type: i % 5, d1: 10 + i, d2: i % 5 === 0 ? 0 : 30 + i };
    if (m === 0x10 || m === 0x20 || m === 0x40) {
      // partial: don't fully trust dec10/20/40 yet
      partial++;
      out(
        `slot ${String(i).padStart(2)}: PARTIAL mark=${m.toString(16)} raw=${content.map((b) => b.toString(16).padStart(2, '0')).join(' ')} dec=${JSON.stringify(d)}`
      );
      continue;
    }
    const match = d.ch === w.ch && d.type === w.type && d.d1 === w.d1 && d.d2 === w.d2;
    if (match) {
      ok++;
      out(`slot ${String(i).padStart(2)}: OK   ${JSON.stringify(d)}`);
    } else {
      bad++;
      out(
        `slot ${String(i).padStart(2)}: FAIL want ${JSON.stringify(w)} got ${JSON.stringify(d)} raw=${content.map((b) => b.toString(16).padStart(2, '0')).join(' ')}`
      );
    }
  }
  out(`== ${ok} exact, ${partial} partial (10/20/40), ${bad} fail`);
}
main();
