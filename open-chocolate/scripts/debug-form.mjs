#!/usr/bin/env node
// Debug: dump the Add-message edit form HTML so the select options can be matched.
import { chromium } from 'playwright';
import os from 'node:os';
import path from 'node:path';

const URL_APP = process.env.URL || 'http://127.0.0.1:5174/';
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

// connect
await page.locator('.device-row button:has-text("Connect")').first().click();
await page.locator('.device-row button:has-text("Disconnect")').waitFor({ timeout: 15000 });
await page.waitForTimeout(1000);

// open Bank B + Add message
await page.locator('.bank-tabs .seg-btn', { hasText: 'Bank B' }).first().click();
await page.waitForTimeout(200);
const addBtn = page.locator('.bank-tools button', { hasText: 'Add message' }).first();
await addBtn.waitFor({ state: 'visible', timeout: 8000 });
await addBtn.click();
await page.waitForTimeout(500);

const html = await page.locator('form.bank-edit').first().innerHTML();
console.log(html.slice(0, 3000));
await context.close();