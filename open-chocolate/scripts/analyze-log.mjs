#!/usr/bin/env node
/**
 * Parse an open-chocolate console export (or drive-device.mjs output) and dump
 * the read-back pages in a compact form for reverse-engineering.
 *
 *   node scripts/analyze-log.mjs <logfile> [--page0] [--bb] [--diff other.log]
 *
 * --page0  : print page 0's Advanced Custom region with a field annotation
 * --bb     : decode Bank B cells (block +92) for footswitch A using the known
 *            partial codec and print the "raw" cells
 * --diff   : print byte differences of page 0 between this log and another
 */
import fs from 'node:fs';

const [file, ...rest] = process.argv.slice(2);
const P0 = rest.includes('--page0') || rest.includes('--diff');
const BB = rest.includes('--bb');
const diffIdx = rest.indexOf('--diff');
const other = diffIdx >= 0 ? rest[diffIdx + 1] : null;

function parseLog(path) {
  const text = fs.readFileSync(path, 'utf8');
  const pages = new Map();
  // Driver console format: [open-chocolate] TX|RX <port> (NNN B): f0 ... [f7]
  // Pasted-console format adds a trailing " device.ts" - tolerate both.
  for (const line of text.split('\n')) {
    const m = line.match(
      /\[open-chocolate\] (RX|TX) [^(]*?\((\d+) B\): (f0 [0-9a-f ]+?)(?:device\.ts)?\s*$/
    );
    if (!m) continue;
    const bytes = m[3].trim().split(/\s+/).map((h) => parseInt(h, 16));
    if (bytes.length >= 20 && bytes[0] === 0xf0 && bytes[3] === 0x0d && bytes[4] === 0x49) {
      const addr = bytes[9] | (bytes[10] << 7) | (bytes[11] << 14);
      if (!pages.has(addr)) pages.set(addr, bytes.slice(17, -3));
    }
  }
  return pages;
}

function page0Of(pages) {
  for (const [addr, pl] of pages.entries()) if (addr === 0 && pl.length) return pl;
  return pages.values().next().value ?? [];
}

function rcodec(rec) {
  return [
    ((rec[0] >> 4) & 7) | ((rec[1] & 1) << 3),
    (rec[1] >> 5) & 7,
    ((rec[3] & 0x7f) << 1) | ((rec[2] >> 6) & 1),
    rec[4] & 0x7f,
  ];
}
function codec2(rec) {
  return [
    (rec[0] >> 2) & 0xf,
    (rec[1] >> 3) & 7,
    ((rec[3] & 0x1f) << 3) | (rec[2] >> 4),
    (rec[4] << 2) | (rec[3] >> 5),
  ];
}

const pages = parseLog(file);
const p0 = pages.get(0);
console.log(`== ${file}: ${pages.size} pages'`);
if (!p0) {
  console.log('no page0');
} else {
  console.log(`mode${p0[106] >> 2} flag${p0[107].toString(16)}`);
  console.log(`bankA header: ${p0.slice(106, 119).map((x) => x.toString(16).padStart(2, '0')).join(' ')}`);
  if (P0) {
    console.log('bankA cells (5-byte stride from 108):');
    for (let s = 0; s < 3; s++) {
      const rec = p0.slice(108 + (s === 0 ? 0 : 1 + s * 5), 108 + (s === 0 ? 0 : 1 + s * 5) + 5);
      if (rec.length === 5)
        console.log(`  slot${s + 1}@${108 + (s === 0 ? 0 : 1 + s * 5)}: ${rec.map((x) => x.toString(16).padStart(2, '0')).join(' ')} R=${JSON.stringify(rcodec(rec))} C2=${JSON.stringify(codec2(rec))}`);
    }
  }
  if (BB) {
    console.log('bankB cells (6-byte stride from 198):');
    for (let s = 0; s < 4; s++) {
      const off = 198 + s * 6;
      const cell = p0.slice(off, off + 6);
      console.log(`  slot${s + 1}@${off}: ${cell.map((x) => x.toString(16).padStart(2, '0')).join(' ')}`);
    }
  }
  if (P0) {
    console.log('advanced region 100..240:');
    for (let off = 100; off < 240; off += 8)
      console.log(`  ${off}: ${p0.slice(off, off + 8).map((x) => x.toString(16).padStart(2, '0')).join(' ')}`);
  }
}

if (other) {
  const pB = parseLog(other).get(0);
  if (p0 && pB) {
    console.log(`== diff vs ${other}`);
    for (let i = 100; i < 300; i++) {
      const a = p0[i];
      const b = pB[i];
      if (a !== b) console.log(`  ${i}: ${a.toString(16)} -> ${b.toString(16)}`);
    }
  }
}