// Live-test candidate 09 41 05 clear constants for footswitch A. Connects to
// the device via the app UI first, then sends each candidate and watches ACKs.
import { chromium } from 'playwright';

const URL_APP = 'http://127.0.0.1:5174/';
const USER_DATA_DIR = '/tmp/open-chocolate-drive-profile';
const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
  headless: false,
  args: ['--enable-features=WebMidi'],
});
const page = context.pages()[0] ?? (await context.newPage());
const ORIGIN = new URL(URL_APP).origin;
async function grant() {
  const c = await context.newCDPSession(page);
  await c.send('Browser.grantPermissions', { permissions: ['midi'], origin: ORIGIN }).catch(() => {});
  await c.detach();
}
await page.goto(URL_APP, { waitUntil: 'domcontentloaded' });
await grant();
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

// Connect via the app UI first (required for the device to answer).
await page.locator('.device-row button:has-text("Connect")').first().click();
await page.locator('.device-row button:has-text("Disconnect")').waitFor({ timeout: 20000 });
await page.waitForTimeout(800);
console.log('connected');

const candidates = [
  ['A-bankA-0x400', 94, 0x400],
  ['A-bankA-0x3b0', 94, 0x3b0],
  ['A-bankA-0x28a', 94, 0x28a],
  ['A-bankA-0x18b', 94, 0x18b],
  ['A-bankA-0x38b', 94, 0x38b],
  ['A-bankA-0x350', 94, 0x350],
  ['A-bankA-0x2b0', 94, 0x2b0],
  ['A-bankA-0x2c5', 94, 0x2c5],
  ['A-bankB-0x3b0', 174, 0x3b0],
  ['A-bankB-0x400', 174, 0x400],
  ['A-bankB-0x18b', 174, 0x18b],
  ['A-bankB-0x28a', 174, 0x28a],
];

const res = await page.evaluate(async (cands) => {
  const a = await navigator.requestMIDIAccess({ sysex: true });
  const input = [...a.inputs.values()].find((i) => i.name && i.name.includes('SINCO'));
  const output = [...a.outputs.values()].find((o) => o.name && o.name.includes('SINCO'));
  if (!output) return { error: 'no SINCO output' };
  await input?.open().catch(() => {});
  let ackCount = 0;
  input.onmidimessage = (e) => {
    const b = [...new Uint8Array(e.data)];
    if (b[0] === 0xf0 && b[3] === 0x01 && b[4] === 0x08) ackCount++;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const results = {};
  for (const [k, addr, K] of cands) {
    const D = [0x00, 0x32, 0x09, 0x41, 0x05, 0x00, 0x00, 0x02,
      addr & 0x7f, (addr >> 7) & 0x7f, (addr >> 14) & 0x7f, 0,
      0x00, 0x0a, ...Array(93).fill(0)];
    const sum = D.reduce((x, y) => x + y, 0);
    const X = K - sum;
    const msg = [0xf0, ...D, X & 0x7f, (X >> 7) & 0x7f, 0xf7];
    const before = ackCount;
    output.send(Uint8Array.from(msg));
    await wait(500);
    results[k] = ackCount > before;
  }
  return results;
}, candidates);
console.log(JSON.stringify(res, null, 2));

// Restore: reread so the app's config is in sync after the clears.
await page.locator('.card-head button:has-text("Re-read")').first().click();
await page.waitForTimeout(5000);
await context.close();