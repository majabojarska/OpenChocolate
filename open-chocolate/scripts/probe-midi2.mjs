// Probe: grant MIDI while the app's on-mount requestMIDIAccess prompt is
// pending, and check whether the promise resolves without a reload.
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: false,
  args: ['--enable-features=WebMidi'],
});
const ORIGIN = 'http://127.0.0.1:5174';

// Strategy 1: grant after load (prompt appears), no reload
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const resolveState = {};
  page.on('console', (m) => {
    if (m.text().includes('[open-chocolate]')) console.log('  console:', m.text().slice(0, 90));
  });
  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const c = await ctx.newCDPSession(page);
  await c.send('Browser.setPermission', { permission: { name: 'midi' }, setting: 'granted', origin: ORIGIN });
  await c.detach();
  await page.waitForTimeout(800);
  const res = await page
    .evaluate(async () => {
      try {
        const a = await navigator.requestMIDIAccess({ sysex: true });
        return `OK in=${a.inputs.size} out=${a.outputs.size}`;
      } catch (e) {
        return `FAIL ${e.name}`;
      }
    })
    .catch((e) => `EVAL ${e.message}`);
  console.log('grant-after-load (no reload):', res);
  await ctx.close();
}

// Strategy 2: Browser.setPermission with sysex:true descriptor
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const c = await ctx.newCDPSession(page);
  try {
    await c.send('Browser.setPermission', { permission: { name: 'midi', sysex: true }, setting: 'granted', origin: ORIGIN });
    console.log('descriptor {name:midi, sysex:true}: accepted');
  } catch (e) {
    console.log('descriptor {name:midi, sysex:true}: rejected', e.message.slice(0, 80));
  }
  await c.detach();
  await page.waitForTimeout(800);
  const res = await page.evaluate(async () => {
    try {
      const a = await navigator.requestMIDIAccess({ sysex: true });
      return `OK in=${a.inputs.size}`;
    } catch (e) {
      return `FAIL ${e.name}`;
    }
  });
  console.log('grant-with-sysex-descriptor:', res);
  await ctx.close();
}

await browser.close();