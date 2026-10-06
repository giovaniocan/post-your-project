#!/usr/bin/env node
// Captures README screenshots from a web app that is already running.
//
// Usage: node capture.mjs <config.json>
//
// Config (only baseUrl, outDir and shots are required):
// {
//   "baseUrl": "http://localhost:3000",
//   "outDir": "/abs/path/to/repo/docs/screenshots",
//   "viewport": { "width": 1280, "height": 800 },
//   "deviceScaleFactor": 2,          // 2 keeps text sharp on retina screens and on GitHub
//   "colorScheme": "light",          // or "dark"
//   "waitForServerSeconds": 90,
//   "block": ["emailjs.com", "stripe.com"],  // requests to these hosts are aborted
//   "login": {                       // optional; runs once, the session cookie is reused
//     "path": "/login",
//     "fill": { "input[name=email]": "demo@example.com", "input[name=password]": "demo" },
//     "submit": "button[type=submit]",
//     "waitForPath": "/dashboard"    // optional; otherwise waits for the next page load
//   },
//   "shots": [
//     { "name": "home", "path": "/", "waitFor": "main", "fullPage": false, "delayMs": 800,
//       "viewport": { "width": 390, "height": 844 } },  // viewport per shot is optional
//     { "name": "search-result", "path": "/",
//       "steps": [                                       // optional; run in order after the page
//         { "fill": "input[type=text]", "value": "octocat" },   // loads, before waitFor
//         { "click": "text=Search" },                    // or { "press": "<selector>", "key": "Enter" }
//         { "waitFor": "text=Followers" }
//       ] }
//   ]
// }
//
// Each shot starts from a fresh page load, so what one shot's steps typed is
// gone in the next — but cookies and localStorage carry over, as in a real
// browser (a theme toggled in one shot is still on in the next).
//
// The capture jumps CSS animations to their end so nothing is caught
// mid-transition. A shot can set "animations": "allow" to opt out, for UI that
// reacts to an animation ending: a toast whose progress bar closes it when the
// animation finishes would otherwise vanish before the picture is taken.
//
// Prints one JSON line per shot. finalUrl and status are there so the caller can
// tell a real capture from a redirect to /login or an error page, which would
// otherwise look like a success. With "block", a last line reports how many
// requests were stopped: anything above zero means a page tried to reach a
// service it shouldn't have during a README capture.

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fail as failWith, firstLine, launchBrowser, loadChromium } from './browser.mjs';

const PREFIX = 'capture';
const SHOT_NAME = /^[a-z0-9][a-z0-9-]*$/;
const DEFAULTS = {
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  colorScheme: 'light',
  waitForServerSeconds: 90,
};
const DEFAULT_DELAY_MS = 800;
// Generous because dev servers compile each route on its first request.
const NAVIGATION_TIMEOUT_MS = 60_000;
// Short because the page has already loaded by then; a missing selector is a
// wrong selector, not a slow page.
const SELECTOR_TIMEOUT_MS = 20_000;
const NETWORK_IDLE_TIMEOUT_MS = 10_000;
const SERVER_POLL_INTERVAL_MS = 1_000;
// A full-page capture of a long table came out 36,000 px tall in testing —
// unreadable in a README. Past this height (CSS px) the shot is clipped.
const MAX_FULL_PAGE_HEIGHT = 2_400;
const STEP_ACTIONS = ['fill', 'press', 'click', 'waitFor'];

function fail(message) {
  failWith(PREFIX, message);
}

async function loadConfig(file) {
  if (!file) fail('usage: node capture.mjs <config.json>');

  let raw;
  try {
    raw = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    fail(`cannot read config ${file}: ${firstLine(error)}`);
  }

  if (!raw.baseUrl) fail('config.baseUrl is required');
  // A relative outDir would resolve against wherever the script was launched,
  // which is rarely the repo the images belong to.
  if (!raw.outDir || !path.isAbsolute(raw.outDir)) fail('config.outDir must be an absolute path');
  if (!Array.isArray(raw.shots) || raw.shots.length === 0) fail('config.shots must list at least one shot');

  const badShot = raw.shots.find((shot) => !SHOT_NAME.test(shot?.name ?? ''));
  if (badShot) {
    fail(`shot name "${badShot?.name}" must be lowercase letters, digits and hyphens — it becomes the file name`);
  }
  for (const shot of raw.shots) {
    const problem = stepsProblem(shot.steps);
    if (problem) fail(`shot "${shot.name}": ${problem}`);
    if (shot.animations !== undefined && !['allow', 'disabled'].includes(shot.animations)) {
      fail(`shot "${shot.name}": animations must be "allow" or "disabled"`);
    }
  }

  return { ...DEFAULTS, ...raw };
}

// Checked at load time so a typo in the last shot's steps doesn't surface only
// after every earlier shot has already been captured.
function stepsProblem(steps) {
  if (steps === undefined) return null;
  if (!Array.isArray(steps)) return 'steps must be a list';
  for (const [index, step] of steps.entries()) {
    const actions = STEP_ACTIONS.filter((action) => typeof step?.[action] === 'string');
    if (actions.length !== 1) {
      return `step ${index + 1} needs exactly one of ${STEP_ACTIONS.join(', ')}, set to a selector`;
    }
    if (actions[0] === 'fill' && typeof step.value !== 'string') return `step ${index + 1} (fill) needs a "value"`;
    if (actions[0] === 'press' && typeof step.key !== 'string') return `step ${index + 1} (press) needs a "key"`;
  }
  return null;
}

async function runSteps(page, steps = []) {
  const options = { timeout: SELECTOR_TIMEOUT_MS };
  for (const [index, step] of steps.entries()) {
    try {
      if (step.fill) await page.fill(step.fill, step.value, options);
      else if (step.press) await page.press(step.press, step.key, options);
      else if (step.click) await page.click(step.click, options);
      else await page.waitForSelector(step.waitFor, options);
    } catch (error) {
      // Playwright's own message names neither the step nor the selector, and
      // a bare "page.click: Timeout" leaves you guessing which of five it was.
      const action = STEP_ACTIONS.find((name) => typeof step[name] === 'string');
      throw new Error(`step ${index + 1} (${action} ${step[action]}): ${firstLine(error)}`);
    }
  }
}

async function waitForServer(baseUrl, seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      await fetch(baseUrl, { redirect: 'manual' });
      return;
    } catch {
      // Connection refused: the dev server is still booting, so keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, SERVER_POLL_INTERVAL_MS));
  }
  fail(`${baseUrl} did not answer within ${seconds}s — is the app running?`);
}

async function settle(page, shot) {
  // Dev servers keep a socket open for hot reload, so "network idle" may never
  // arrive. A bounded wait gets the data requests; giving up on it is expected.
  await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {});
  if (shot.waitFor) {
    await page.waitForSelector(shot.waitFor, { timeout: SELECTOR_TIMEOUT_MS });
  }
  // Lets entrance animations and late layout shifts finish before the capture.
  await page.waitForTimeout(shot.delayMs ?? DEFAULT_DELAY_MS);
}

async function logIn(page, baseUrl, login) {
  await page.goto(new URL(login.path ?? '/login', baseUrl).href, { timeout: NAVIGATION_TIMEOUT_MS });
  for (const [selector, value] of Object.entries(login.fill ?? {})) {
    await page.fill(selector, String(value));
  }
  await page.click(login.submit ?? 'button[type=submit]');
  if (login.waitForPath) {
    await page.waitForURL((url) => url.pathname.startsWith(login.waitForPath), {
      timeout: NAVIGATION_TIMEOUT_MS,
    });
  } else {
    await page.waitForLoadState('load');
  }
}

async function screenshotArea(page, viewport, fullPage) {
  if (!fullPage) return { fullPage: false, width: viewport.width, height: viewport.height, clipped: false };
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  if (pageHeight <= MAX_FULL_PAGE_HEIGHT) {
    return { fullPage: true, width: viewport.width, height: pageHeight, clipped: false };
  }
  return {
    fullPage: true,
    clip: { x: 0, y: 0, width: viewport.width, height: MAX_FULL_PAGE_HEIGHT },
    width: viewport.width,
    height: MAX_FULL_PAGE_HEIGHT,
    clipped: true,
  };
}

async function captureShot(page, config, shot) {
  const requested = new URL(shot.path ?? '/', config.baseUrl).href;
  const file = path.join(config.outDir, `${shot.name}.png`);
  const viewport = shot.viewport ?? config.viewport;
  try {
    await page.setViewportSize(viewport);
    const response = await page.goto(requested, { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS });
    const status = response?.status() ?? null;
    // An error page saved into docs/screenshots would end up committed; better
    // to report it and save nothing.
    if (status !== null && status >= 400) {
      return { name: shot.name, ok: false, requested, finalUrl: page.url(), status, error: `HTTP ${status}` };
    }
    await runSteps(page, shot.steps);
    await settle(page, shot);
    const area = await screenshotArea(page, viewport, Boolean(shot.fullPage));
    await page.screenshot({
      path: file,
      fullPage: area.fullPage,
      clip: area.clip,
      animations: shot.animations ?? 'disabled',
      caret: 'hide',
    });
    return {
      name: shot.name,
      ok: true,
      file,
      requested,
      finalUrl: page.url(),
      status,
      title: await page.title(),
      size: `${area.width}x${area.height}`,
      ...(area.clipped && { note: `page is taller than ${MAX_FULL_PAGE_HEIGHT}px; clipped to the top` }),
    };
  } catch (error) {
    return { name: shot.name, ok: false, requested, error: firstLine(error) };
  }
}

async function main() {
  const config = await loadConfig(process.argv[2]);
  const chromium = await loadChromium(PREFIX);
  await waitForServer(config.baseUrl, config.waitForServerSeconds);
  await mkdir(config.outDir, { recursive: true });

  const browser = await launchBrowser(PREFIX, chromium);
  try {
    const context = await browser.newContext({
      viewport: config.viewport,
      deviceScaleFactor: config.deviceScaleFactor,
      colorScheme: config.colorScheme,
    });
    // Pages that send email, take payments or post messages would do it for
    // real from a capture; aborting their hosts is the net under a stray click.
    // Host fragments rather than Playwright globs: a glob's "*" stops at "/",
    // so "*emailjs*" would never match https://api.emailjs.com/api/v1.0/....
    const blocked = [];
    const hosts = config.block ?? [];
    if (hosts.length > 0) {
      await context.route(
        (url) => hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)),
        (route) => {
          blocked.push(route.request().url());
          return route.abort();
        },
      );
    }
    const page = await context.newPage();
    if (config.login) await logIn(page, config.baseUrl, config.login);

    // One shot at a time: they share the page, and with it the login session.
    let failed = 0;
    for (const shot of config.shots) {
      const result = await captureShot(page, config, shot);
      console.log(JSON.stringify(result));
      if (!result.ok) failed += 1;
    }
    if (config.block) console.log(JSON.stringify({ blockedRequests: blocked.length, urls: blocked }));
    console.error(`capture: ${config.shots.length - failed}/${config.shots.length} shots saved to ${config.outDir}`);
    process.exitCode = failed === 0 ? 0 : 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => fail(firstLine(error)));
