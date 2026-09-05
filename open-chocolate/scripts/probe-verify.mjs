// Verify probe plumbing: connect to the device via the app UI first, then
// send a KNOWN-GOOD clear (fsD bank A, addr 1345, K=0x400 - captured
// bit-perfect from the official app) to confirm we receive the 01 08 ACK.
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

// Connect via the app UI (full init: discovery + 24 reads + state).
await page.locator('.device-row button:has-text("Connect")').first().click();
await page.locator('.device-row button:has-text("Disconnect")').waitFor({ timeout: 20000 });
await page.waitForTimeout(1000);
console.log('connected');

// Build the known-good fsD bank-A clear (addr 1345) exactly as captured.
const addr = 1345;
const D = [0x00, 0x32, 0x09, 0x41, 0x05, 0x00, 0x00, 0x02,
  addr & 0x7f, (addr >> 7) & 0x7f, (addr >> 14) & 0x7f, 0,
  0x00, 0x0a, ...Array(93).fill(0)];
const sum = D.reduce((a, b) => a + b, 0);
const X = 0x400 - sum;
const msg = [0xf0, ...D, X & 0x7f, (X >> 7) & 0x7f, 0xf7];
console.log('known-good fsD clear ck:', (X & 0x7f).toString(16), ((X >> 7) & 0x7f).toString(16), '(expect 28 06)');

const res = await page.evaluate(async (msgArray) => {
  const a = await navigator.requestMIDIAccess({ sysex: true });
  const ins = [...a.inputs.values()].filter((i) => i.name && i.name.includes('SINCO'));
  const outs = [...a.outputs.values()].filter((o) => o.name && o.name.includes('SINCO'));
  const rx = [];
  const input = ins[0];
  if (input) {
    await input.open().catch(() => {});
    input.onmidimessage = (e) => {
      const b = [...new Uint8Array(e.data)];
      if (b.length) rx.push(b);
    };
  }
  const out = outs[0];
  if (!out) return { ins, outs, error: 'no SINCO output' };
  out.send(Uint8Array.from(msgArray));
  await new Promise((r) => setTimeout(r, 2000));
  return { ins, outs, rx };
}, msg.map(Number));
console.log(JSON.stringify(res, null, 2));
await context.close();