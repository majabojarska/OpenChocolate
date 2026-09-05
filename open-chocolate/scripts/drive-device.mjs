#!/usr/bin/env node
/**
 * Closed-loop device driver for the M-Vave Chocolate Plus reverse-engineering.
 *
 * Drives the open-chocolate web app in a headed Chromium (via Playwright),
 * clicking through the real UI to configure the device, and capturing every
 * MIDI message the app sends/receives from the browser console (the app logs
 * all SysEx TX/RX as `[open-chocolate] ...`, e.g.
 *   [open-chocolate] TX SINCO:SINCO MIDI 1 28:0 (20 B): f0 00 32 0d 41 ...
 *
 * Usage:
 *   node scripts/drive-device.mjs [--url http://localhost:5173] \
 *       [--out usb-capture/run-1.log] [--timeout 8000] <actions...>
 *
 * Actions (run in order, one browser session):
 *   connect                 click the first detected device's Connect button
 *   set-mode N              set Operating mode to N (3 = Advanced Custom)
 *   bank A|B                open Bank A / Bank B tab (footswitch A)
 *   add <ch> <type> <d1> [d2]   add a message to the current bank
 *   edit <slot> <ch> <type> <d1> [d2]  edit an existing message slot
 *   remove-all              Remove all messages in the current bank
 *   reread                  click Re-read and wait for the read to finish
 *   sleep <ms>              just wait
 *   dump                     print the captured console lines so far
 *
 * type is one of: PC CC NoteON NoteOFF SysEx (blob type values 0..4).
 * channel is 1..16 (the UI is 1-based).
 *
 * The console capture for the whole session is written to --out (default
 * usb-capture/drive-<timestamp>.log), so subsequent runs can be diffed.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);

function arg(name, dflt) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
}
const URL_APP = arg('--url', 'http://localhost:5173');
const OUT = arg('--out', null);
const TIMEOUT_MS = Number(arg('--timeout', '8000'));
// Anything not consumed by a --flag is an action. Each verb consumes a fixed
// number of parameters, so the token list is grouped greedily.
const flagish = new Set(['--url', '--out', '--timeout']);
const VERB_PARAMS = {
  connect: 0,
  'set-mode': 1,
  bank: 1,
  add: 4,
  edit: 5,
  'remove-all': 0,
  reread: 0,
  sleep: 1,
  dump: 0,
};
const ACTIONS = (() => {
  const tokens = args.filter((a, i) => !a.startsWith('--') && !flagish.has(args[i - 1]));
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    const verb = tokens[i];
    const n = VERB_PARAMS[verb] ?? 1;
    out.push(tokens.slice(i, i + 1 + n).join(' '));
    i += 1 + n;
  }
  return out;
})();

const TYPES = { PC: 0, CC: 1, NoteON: 2, NoteOFF: 3, SysEx: 4 };
const TYPE_LABEL = { PC: 'PC', CC: 'CC', NoteON: 'Note ON', NoteOFF: 'Note OFF', SysEx: 'SysEx' };

const lines = [];
const errors = [];

async function waitIdle(page, ms = 300) {
  // Busy overlay covers connect/read/write; wait until it is gone.
  await page
    .waitForSelector('.busy-overlay', { state: 'detached', timeout: TIMEOUT_MS })
    .catch(() => {});
  await page.waitForTimeout(ms);
}

async function clickByText(page, selector, text) {
  const loc = page.locator(selector, { hasText: text }).first();
  await loc.waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  await loc.click();
}

async function ensureBank(page, bank) {
  const bankButton = page.locator('.bank-tabs .seg-btn', { hasText: bank }).first();
  await bankButton.waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  await bankButton.click();
  await page.waitForTimeout(200);
}

/**
 * Fill the open "bank edit" form. The form has selects [Channel, Type, Data1,
 * (Data2)]; for PC the Data2 field is hidden. Select by label - the channel
 * labels are the 1-based numbers, type labels are the MIDI names, and
 * data1/data2 labels are the raw values 0..127.
 */
async function fillEditForm(page, ch, typeName, d1, d2) {
  const form = page.locator('form.bank-edit');
  const sel = form.locator('select');
  await sel.nth(0).selectOption({ label: String(ch) }, { timeout: TIMEOUT_MS });
  await sel.nth(1).selectOption({ label: TYPE_LABEL[typeName] }, { timeout: TIMEOUT_MS });
  await sel.nth(2).selectOption({ label: String(d1) }, { timeout: TIMEOUT_MS });
  if (TYPES[typeName] !== 0)
    await sel.nth(3).selectOption({ label: String(d2) }, { timeout: TIMEOUT_MS });
}

async function addMessage(page, parts) {
  await clickByText(page, '.bank-tools button', 'Add message');
  const [ch, typeName, d1, d2] = [
    Number(parts[1]),
    parts[2],
    Number(parts[3]),
    parts[4] !== undefined ? Number(parts[4]) : 0,
  ];
  await fillEditForm(page, ch, typeName, d1, d2);
  await page.locator('form.bank-edit button[type="submit"]').click();
  await waitIdle(page);
  console.log(`[driver] added ${typeName} ch${ch} d1=${d1} d2=${d2}`);
}

async function editMessage(page, parts) {
  const slot = Number(parts[1]);
  const [ch, typeName, d1, d2] = [
    Number(parts[2]),
    parts[3],
    Number(parts[4]),
    parts[5] !== undefined ? Number(parts[5]) : 0,
  ];
  const row = page.locator('.bank-row').nth(slot - 1);
  await row.waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  await row.locator('button', { hasText: 'Edit' }).click();
  await fillEditForm(page, ch, typeName, d1, d2);
  await page.locator('form.bank-edit button[type="submit"]').click();
  await waitIdle(page);
  console.log(`[driver] edited slot ${slot} -> ${typeName} ch${ch} d1=${d1} d2=${d2}`);
}

async function runAction(page, action) {
  const parts = action.trim().split(/\s+/);
  const cmd = parts[0];
  switch (cmd) {
    case 'connect': {
      const row = page.locator('.device-row').first();
      await row.waitFor({ state: 'visible', timeout: TIMEOUT_MS });
      const connectBtn = row.locator('button', { hasText: 'Connect' });
      await connectBtn.waitFor({ state: 'visible', timeout: TIMEOUT_MS });
      await connectBtn.click();
      await page
        .locator('.device-row button:has-text("Disconnect")')
        .waitFor({ state: 'visible', timeout: TIMEOUT_MS });
      await waitIdle(page);
      console.log('[driver] connected');
      break;
    }
    case 'set-mode': {
      // Operating mode select is the first <select> in the Configuration card.
      const modeSelect = page
        .locator('section.card:has(h2:has-text("Configuration")) select.control')
        .first();
      await modeSelect.waitFor({ state: 'visible', timeout: TIMEOUT_MS });
      await modeSelect.selectOption({ value: parts[1] });
      await waitIdle(page);
      console.log(`[driver] mode set to ${parts[1]}`);
      break;
    }
    case 'bank': {
      await ensureBank(page, parts[1]);
      console.log(`[driver] bank ${parts[1]}`);
      break;
    }
    case 'add':
      await addMessage(page, parts);
      break;
    case 'edit':
      await editMessage(page, parts);
      break;
    case 'remove-all': {
      await clickByText(page, '.bank-tools button', 'Remove all');
      await waitIdle(page);
      console.log('[driver] removed all');
      break;
    }
    case 'reread': {
      await clickByText(page, '.card-head button', 'Re-read');
      await waitIdle(page, 500);
      console.log('[driver] re-read');
      break;
    }
    case 'sleep': {
      await page.waitForTimeout(Number(parts[1]));
      break;
    }
    case 'dump': {
      console.log(`[driver] captured ${lines.length} console lines`);
      break;
    }
    default:
      console.error(`[driver] unknown action: ${cmd}`);
  }
}

const outPath = OUT ?? path.join('usb-capture', `drive-${Date.now()}.log`);

// Persistent profile so the Web MIDI permission (granted once manually in the
// browser's own UI) persists across runs - an ephemeral context re-prompts
// every time, and Playwright cannot click Chrome's permission bubble.
const USER_DATA_DIR = path.join(os.tmpdir(), 'open-chocolate-drive-profile');
const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
  headless: false,
  args: ['--enable-features=WebMidi'],
});
const page = context.pages()[0] ?? (await context.newPage());

page.on('console', (msg) => {
  const text = msg.text();
  if (text.includes('[open-chocolate]')) {
    lines.push(text);
    console.log(text);
  }
});
page.on('pageerror', (err) => errors.push(String(err)));

// Origin without a trailing slash; Chromium's permission origin must match
// window.location.origin exactly.
const ORIGIN = new URL(URL_APP).origin;

// Proven recipe (probe-midi.mjs): CDP Browser.grantPermissions(['midi'])
// unlocked Web MIDI (incl. sysex) for this Chrome-for-Testing 153 - but only
// after a page RELOAD. setPermission({name:'midi'}) also works. Playwright's
// grantPermissions(['midi']) is NOT reliable here, so use CDP.
async function grantMidi() {
  const client = await context.newCDPSession(page);
  try {
    await client.send('Browser.grantPermissions', {
      permissions: ['midi'],
      origin: ORIGIN,
    });
    try {
      await client.send('Browser.setPermission', {
        permission: { name: 'midi' },
        setting: 'granted',
        origin: ORIGIN,
      });
    } catch (e) {
      /* fallback may be redundant - fine */
    }
  } finally {
    await client.detach().catch(() => {});
  }
}

async function checkMidi(timeoutMs = 2500) {
  // Race with a timeout: a pending permission prompt never settles the
  // requestMIDIAccess promise, so we must not block on it.
  return Promise.race([
    page.evaluate(async () => {
      try {
        const a = await navigator.requestMIDIAccess({ sysex: true });
        return { ok: true, in: a.inputs.size, out: a.outputs.size };
      } catch {
        return { ok: false };
      }
    }),
    new Promise((resolve) => setTimeout(() => resolve({ ok: false }), timeoutMs)),
  ]);
}

// Navigate first (a blank-page pre-grant does not survive navigation here),
// then grant, then RELOAD - this is the recipe that avoids the prompt.
await page.goto(URL_APP, { waitUntil: 'domcontentloaded' });
await grantMidi().catch((e) => console.error('[driver] grant failed:', e.message));
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(1000);
// Wait up to 30s for MIDI: on the very first run the permission popup needs a
// manual Allow (granted by the human); afterwards it is already granted.
let midi = await checkMidi(30000);
if (!midi.ok) {
  await grantMidi().catch(() => {});
  midi = await checkMidi(15000);
}
if (!midi.ok) {
  console.error('[driver] Web MIDI not granted after waiting; aborting.');
  process.exit(2);
}
console.log(`[driver] Web MIDI OK (inputs=${midi.in}, outputs=${midi.out})`);
await page.waitForTimeout(1200); // let the initial scan settle

for (const action of ACTIONS) {
  try {
    await runAction(page, action);
  } catch (err) {
    errors.push(`action "${action}": ${err instanceof Error ? err.message : String(err)}`);
    console.error(
      `[driver] action failed: ${action} -> ${err instanceof Error ? err.message : err}`
    );
  }
}

await context.close();

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, lines.join('\n') + (lines.length ? '\n' : ''));
console.log(`[driver] wrote ${lines.length} console lines -> ${outPath}`);
if (errors.length) {
  console.error(`[driver] ${errors.length} errors:`);
  for (const e of errors) console.error('  ' + e);
}
