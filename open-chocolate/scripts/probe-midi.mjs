// Probe: find a recipe that lets requestMIDIAccess({sysex:true}) succeed in
// this Chromium. Tries several grant strategies and reports which work.
import { chromium } from 'playwright';
import process from 'node:process';

const browser = await chromium.launch({ headless: false, args: ['--enable-features=WebMidi'] });

async function tryStrategy(label, prep) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto('http://127.0.0.1:5174/', { waitUntil: 'domcontentloaded' });
    await prep(ctx, page);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(800).catch(() => {});
    const res = await page
      .evaluate(async () => {
        try {
          const a = await navigator.requestMIDIAccess({ sysex: true });
          return `OK inputs=${a.inputs.size} outputs=${a.outputs.size}`;
        } catch (e) {
          return `FAIL ${e.name}: ${e.message}`;
        }
      })
      .catch((e) => `EVAL-ERR ${e.message}`);
    console.log(`${label}: ${res}`);
  } catch (e) {
    console.log(`${label}: SETUP ERR ${e.message}`);
  } finally {
    await ctx.close().catch(() => {});
  }
}

await tryStrategy('grantPermissions midi', async (ctx) => ctx.grantPermissions(['midi']));
await tryStrategy('grantPermissions midi origin', async (ctx) =>
  ctx.grantPermissions(['midi'], { origin: 'http://127.0.0.1:5174' })
);
await tryStrategy('cdp midi origin', async (ctx, page) => {
  const c = await ctx.newCDPSession(page);
  await c.send('Browser.setPermission', {
    permission: { name: 'midi' },
    setting: 'granted',
    origin: 'http://127.0.0.1:5174',
  });
  await c.detach();
});
await tryStrategy('cdp midiSysex origin', async (ctx, page) => {
  const c = await ctx.newCDPSession(page);
  try {
    await c.send('Browser.setPermission', {
      permission: { name: 'midiSysex' },
      setting: 'granted',
      origin: 'http://127.0.0.1:5174',
    });
  } catch (e) {
    console.log('  (midiSysex descriptor rejected)');
  }
  await c.detach();
});
await tryStrategy('cdp Browser.grantPermissions', async (ctx, page) => {
  const c = await ctx.newCDPSession(page);
  try {
    await c.send('Browser.grantPermissions', {
      permissions: ['midi'],
      origin: 'http://127.0.0.1:5174',
    });
  } catch (e) {
    console.log('  (Browser.grantPermissions failed)');
  }
  await c.detach();
});

await browser.close();