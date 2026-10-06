#!/usr/bin/env node
// Renders the captured output of a real run as a terminal-style PNG for a
// README — the "screenshot" of projects whose screen is a terminal: CLIs,
// scripts, scrapers, backends.
//
// Usage:
//   node terminal.mjs <output.txt> <image.png> [--command "python main.py"]
//                     [--chrome] [--title "my-tool"] [--columns 100]
//
//   <output.txt>  what the program printed in a real run (ANSI colors are kept)
//   --command     shows "$ <command>" as the first line, so readers see how to get it
//   --chrome      adds a window title bar with the three macOS dots
//   --title       text in that bar (defaults to the command)
//   --columns     wrap width in characters (default 100)
//
// The text is drawn exactly as captured. This script never edits, reorders or
// "cleans up" output: a README image that shows numbers the program didn't
// print is a fabricated screenshot.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fail as failWith, firstLine, launchBrowser, loadChromium } from './browser.mjs';

const PREFIX = 'terminal';
const DEFAULT_COLUMNS = 100;
const MAX_LINES_WARNING = 60;
const DEVICE_SCALE_FACTOR = 2;

// GitHub's dark theme palette: the image sits on github.com, so matching it
// keeps the colors from clashing with the page around it.
const THEME = {
  background: '#0d1117',
  bar: '#161b22',
  border: '#30363d',
  foreground: '#e6edf3',
  muted: '#8b949e',
  prompt: '#7ee787',
};
const ANSI_16 = [
  '#484f58', '#ff7b72', '#3fb950', '#d29922', '#58a6ff', '#bc8cff', '#39c5cf', '#b1bac4',
  '#6e7681', '#ffa198', '#56d364', '#e3b341', '#79c0ff', '#d2a8ff', '#56d4dd', '#ffffff',
];

const SGR = /\x1b\[([0-9;]*)m/g;
const OTHER_CSI = /\x1b\[[0-9;?]*[A-Za-ln-z]/g;
const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

function fail(message) {
  failWith(PREFIX, message);
}

function parseArgs(argv) {
  const [input, output, ...rest] = argv;
  if (!input || !output) {
    fail('usage: node terminal.mjs <output.txt> <image.png> [--command "..."] [--chrome] [--title "..."] [--columns N]');
  }
  if (!output.endsWith('.png')) fail('the image path must end in .png');

  const options = { input, output: path.resolve(output), command: null, chrome: false, title: null, columns: DEFAULT_COLUMNS };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    if (flag === '--chrome') {
      options.chrome = true;
    } else if (['--command', '--title', '--columns'].includes(flag)) {
      const value = rest[i + 1];
      if (value === undefined) fail(`${flag} needs a value`);
      options[flag.slice(2)] = flag === '--columns' ? Number(value) : value;
      i += 1;
    } else {
      fail(`unknown option ${flag}`);
    }
  }
  if (!Number.isInteger(options.columns) || options.columns < 20) fail('--columns must be an integer of at least 20');
  return options;
}

function color256(n) {
  if (n < 16) return ANSI_16[n];
  if (n >= 232) {
    const level = 8 + (n - 232) * 10;
    return `rgb(${level},${level},${level})`;
  }
  const index = n - 16;
  const scale = (value) => (value === 0 ? 0 : 55 + value * 40);
  return `rgb(${scale(Math.floor(index / 36))},${scale(Math.floor(index / 6) % 6)},${scale(index % 6)})`;
}

function extendedColor(codes, i) {
  // 38;5;n (256 colors) or 38;2;r;g;b (truecolor); returns the color and how many codes it used.
  if (codes[i + 1] === 5) return { color: color256(codes[i + 2] ?? 0), used: 3 };
  if (codes[i + 1] === 2) return { color: `rgb(${codes[i + 2] ?? 0},${codes[i + 3] ?? 0},${codes[i + 4] ?? 0})`, used: 5 };
  return { color: null, used: 1 };
}

const PLAIN = Object.freeze({ fg: null, bg: null, bold: false, dim: false, italic: false, underline: false });

function applySgr(state, rawCodes) {
  const codes = rawCodes === '' ? [0] : rawCodes.split(';').map(Number);
  let next = state;
  for (let i = 0; i < codes.length; i += 1) {
    const code = codes[i];
    if (code === 0) next = PLAIN;
    else if (code === 1) next = { ...next, bold: true };
    else if (code === 2) next = { ...next, dim: true };
    else if (code === 3) next = { ...next, italic: true };
    else if (code === 4) next = { ...next, underline: true };
    else if (code === 22) next = { ...next, bold: false, dim: false };
    else if (code === 23) next = { ...next, italic: false };
    else if (code === 24) next = { ...next, underline: false };
    else if (code >= 30 && code <= 37) next = { ...next, fg: ANSI_16[code - 30] };
    else if (code >= 90 && code <= 97) next = { ...next, fg: ANSI_16[code - 90 + 8] };
    else if (code === 39) next = { ...next, fg: null };
    else if (code >= 40 && code <= 47) next = { ...next, bg: ANSI_16[code - 40] };
    else if (code >= 100 && code <= 107) next = { ...next, bg: ANSI_16[code - 100 + 8] };
    else if (code === 49) next = { ...next, bg: null };
    else if (code === 38 || code === 48) {
      const { color, used } = extendedColor(codes, i);
      next = code === 38 ? { ...next, fg: color } : { ...next, bg: color };
      i += used - 1;
    }
  }
  return next;
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function styled(text, state) {
  const rules = [
    state.fg && `color:${state.fg}`,
    state.bg && `background:${state.bg}`,
    state.bold && 'font-weight:700',
    state.dim && 'opacity:.6',
    state.italic && 'font-style:italic',
    state.underline && 'text-decoration:underline',
  ].filter(Boolean);
  const html = escapeHtml(text);
  return rules.length === 0 ? html : `<span style="${rules.join(';')}">${html}</span>`;
}

function normalize(raw) {
  // A progress bar redraws its line with \r; a terminal shows only the last
  // redraw, so the image does too.
  return raw
    .replace(/\r\n/g, '\n')
    .replace(OSC, '')
    .replace(OTHER_CSI, '')
    .split('\n')
    .map((line) => line.slice(line.lastIndexOf('\r') + 1))
    .join('\n')
    .replace(/\n+$/, '');
}

function ansiToHtml(text) {
  let state = PLAIN;
  let html = '';
  let cursor = 0;
  for (const match of text.matchAll(SGR)) {
    html += styled(text.slice(cursor, match.index), state);
    state = applySgr(state, match[1]);
    cursor = match.index + match[0].length;
  }
  return html + styled(text.slice(cursor), state);
}

function pageHtml(body, options) {
  const title = options.title ?? options.command ?? '';
  const bar = options.chrome
    ? `<div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><span class="title">${escapeHtml(title)}</span></div>`
    : '';
  const prompt = options.command
    ? `<span class="prompt">$</span> ${escapeHtml(options.command)}\n\n`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; padding: 16px; background: transparent; }
    .term { display: inline-block; background: ${THEME.background}; border: 1px solid ${THEME.border}; border-radius: 10px; overflow: hidden; }
    .bar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: ${THEME.bar}; border-bottom: 1px solid ${THEME.border}; }
    .dot { width: 12px; height: 12px; border-radius: 50%; }
    .title { flex: 1; text-align: center; margin-right: 52px; color: ${THEME.muted}; font: 12px -apple-system, "Segoe UI", sans-serif; }
    pre { margin: 0; padding: 18px 22px; max-width: ${options.columns}ch; color: ${THEME.foreground};
          font: 13.5px/1.5 Menlo, "DejaVu Sans Mono", Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
    .prompt { color: ${THEME.prompt}; }
  </style></head><body><div class="term">${bar}<pre>${prompt}${body}</pre></div></body></html>`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  let raw;
  try {
    raw = await readFile(options.input, 'utf8');
  } catch (error) {
    fail(`cannot read ${options.input}: ${firstLine(error)}`);
  }
  const text = normalize(raw);
  if (text.trim() === '') fail(`${options.input} is empty — capture the program's output first`);

  const chromium = await loadChromium(PREFIX);
  const browser = await launchBrowser(PREFIX, chromium);
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    });
    await page.setContent(pageHtml(ansiToHtml(text), options));
    await page.evaluate(() => document.fonts.ready);
    const term = page.locator('.term');
    await term.screenshot({ path: options.output, omitBackground: true });
    const box = await term.boundingBox();

    const lines = text.split('\n').length;
    console.log(JSON.stringify({
      file: options.output,
      size: `${Math.round(box.width)}x${Math.round(box.height)}`,
      lines,
      ...(lines > MAX_LINES_WARNING && {
        note: `${lines} lines is a lot for one image; consider rendering only the part that shows the result`,
      }),
    }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => fail(firstLine(error)));
