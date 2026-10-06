// Shared by capture.mjs and terminal.mjs: both drive the same headless Chrome
// and should fail the same way when it isn't available.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function fail(prefix, message) {
  console.error(`${prefix}: ${message}`);
  process.exit(1);
}

export function firstLine(error) {
  return String(error?.message ?? error).split('\n')[0];
}

export async function loadChromium(prefix) {
  try {
    const { chromium } = await import('playwright-core');
    return chromium;
  } catch {
    const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
    fail(prefix, `playwright-core is not installed. Run: npm install --prefix "${scriptsDir}"`);
  }
}

export async function launchBrowser(prefix, chromium) {
  // The installed Google Chrome first: it spares a ~150 MB browser download.
  try {
    return await chromium.launch({ channel: 'chrome' });
  } catch (chromeError) {
    try {
      return await chromium.launch();
    } catch {
      fail(
        prefix,
        `could not start Chrome (${firstLine(chromeError)}). ` +
          'Install Google Chrome, or run: npx playwright install chromium',
      );
    }
  }
}
