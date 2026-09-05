#!/usr/bin/env node
/** Diff consecutive occupancy-step dumps (blob-address-annotated). */
import { readFileSync } from 'node:fs';
import { stdout } from 'node:process';
const path = process.argv[2];
const out = (s) => stdout.write(s + '\n');
const rows = readFileSync(path, 'utf8')
  .split('\n')
  .filter((l) => /^slots: /.test(l))
  .map((l) => {
    const m = /^slots: ([^:]+) : (.+)$/.exec(l);
    return {
      label: m[1].trim(),
      bytes: m[2]
        .trim()
        .split(/\s+/)
        .map((x) => parseInt(x, 16)),
    };
  });
let prev = rows[0].bytes;
out(`${rows[0].label}: (baseline)`);
for (let i = 1; i < rows.length; i++) {
  const { label, bytes } = rows[i];
  const deltas = [];
  for (let b = 106; b < 240; b++) {
    const p = prev[b - 106];
    const c = bytes[b - 106];
    if (p !== c)
      deltas.push(`${b}:${p?.toString(16).padStart(2, '0')}->${c?.toString(16).padStart(2, '0')}`);
  }
  out(`${label}: ${deltas.length ? deltas.join(' ') : '(none)'}`);
  prev = bytes;
}
