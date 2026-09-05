// Debug the exact driver MIDI flow: goto -> grantPermissions -> reload -> verify,
// printing each step so we can see where it diverges from probe-midi.mjs.
import { chromium } from 'playwright';

const ORIGIN = 'http://127.0.0.1:5174';
const browser = await chromium.launch({ headless: false, args: ['--enable-features=WebMidi'] });
const ctx = await browser.newContext();
const page = await ctx.newPage();
const anon = {};
page.on('console', (m) => {
  if (m.text().includes('[open-chocolate]')) console.log('  console:', m.text().slice(0, 80));
});

console.log('1. goto');
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);

console.log('2. grantPermissions');
let c;
try {
  c = await ctx.newCDPSession(page);
  await c.send('Browser.grantPermissions', { permissions: ['midi'], origin: ORIGIN });
  console.log('   grantPermissions OK');
} catch (e) {
  console.log('   grantPermissions ERR', e.message.slice(0, 80));
}

console.log('3. reload');
try {
  await page.reload({ waitUntil: 'domcontentloaded' });
  console.log('   reload OK');
} catch (e) {
  console.log('   reload ERR', e.message.slice(0, 80));
}
await page.waitForTimeout(1000);

console.log('4. evaluate requestMIDIAccess(sysex)');
try {
  const r = await page.evaluate(async () => {
    try {
      const a = await navigator.requestMIDIAccess({ sysex: true });
      return { ok: true, in: a.inputs.size, out: a.outputs.size };
    } catch (e) {
      return { ok: false, name: e.name, msg: e.message };
    }
  });
  console.log('   ->', JSON.stringify(r));
} catch (e) {
  console.log('   evaluate ERR', e.message.slice(0, 80));
}
await c?.detach().catch(() => {});
await browser.close();