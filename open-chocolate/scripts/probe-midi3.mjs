// Probe: does a BROWSER-level CDP grant of 'midi' pre-empt the app's Web MIDI
// permission prompt (so the app's on-mount requestMIDIAccess({sysex:true})
// succeeds without showing a popup)?
import { chromium } from 'playwright';

const ORIGIN = 'http://127.0.0.1:5174';

const browser = await chromium.launch({ headless: false, args: ['--enable-features=WebMidi'] });

// Browser-level CDP session - grants apply to all contexts/origins.
const bsession = await browser.newBrowserCDPSession();
let grantErr = null;
try {
  await bsession.send('Browser.setPermission', {
    permission: { name: 'midi' },
    setting: 'granted',
    origin: ORIGIN,
  });
} catch (e) {
  grantErr = 'browser setPermission: ' + e.message.slice(0, 80);
}
try {
  await bsession.send('Browser.grantPermissions', { permissions: ['midi'], origin: ORIGIN });
} catch (e) {
  grantErr = (grantErr ? grantErr + ' | ' : '') + 'browser grantPermissions: ' + e.message.slice(0, 80);
}
console.log('browser-level grants:', grantErr ?? 'OK');

// Now load the app fresh and see if the startup MIDI request succeeds.
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('[open-chocolate]')) console.log('  console:', t.slice(0, 100));
});
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const res = await page
  .evaluate(async () => {
    try {
      const a = await navigator.requestMIDIAccess({ sysex: true });
      return `OK in=${a.inputs.size} out=${a.outputs.size}`;
    } catch (e) {
      return `FAIL ${e.name}: ${e.message}`;
    }
  })
  .catch((e) => `EVAL ${e.message}`);
console.log('app-page MIDI after browser-level grant:', res);

await ctx.close();
await bsession.detach().catch(() => {});
await browser.close();