#!/usr/bin/env node
// Gets a LinkedIn post ready to publish for someone with no scheduler
// connected: the composer opens with the text filled in, the file manager
// shows the image to drag into it, and the first comment waits on the
// clipboard. The person still clicks Publish; nothing here touches their
// account.
//
// Usage: node linkedin-share.mjs <post.json> [--lang pt-BR] [--dry-run]
//
// Reads the same post.json as post-preview.mjs. The share link carries text
// only, and pasting an image into the composer didn't work in testing — hence
// the file manager. --dry-run prints the plan without opening anything.
//
// Tested on macOS. Windows and Linux use each system's documented commands;
// whatever can't run is printed for the person to do by hand.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findLeaks } from './leaks.mjs';
import { shareUrl, withBoldTitle } from './linkedin-text.mjs';

const PREFIX = 'linkedin-share';
// Browsers take far longer URLs, but past this LinkedIn may cut the text.
const URL_WARNING_LENGTH = 8000;

function fail(message) {
  console.error(`${PREFIX}: ${message}`);
  process.exit(1);
}

function say(message) {
  console.log(`${PREFIX}: ${message}`);
}

function parseArgs(argv) {
  const [configFile, ...rest] = argv;
  if (!configFile) fail('usage: node linkedin-share.mjs <post.json> [--lang pt-BR] [--dry-run]');
  const options = { configFile, lang: null, dryRun: false };
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--dry-run') options.dryRun = true;
    else if (rest[i] === '--lang' && rest[i + 1]) options.lang = rest[++i];
    else fail(`unknown option ${rest[i]}`);
  }
  return options;
}

function loadPost(options) {
  let config;
  try {
    config = JSON.parse(readFileSync(options.configFile, 'utf8'));
  } catch (error) {
    fail(`cannot read ${options.configFile}: ${String(error.message).split('\n')[0]}`);
  }
  const baseDir = path.dirname(path.resolve(options.configFile));
  const posts = config.posts ?? [];
  const post = options.lang ? posts.find((candidate) => candidate.lang === options.lang) : posts[0];
  if (!post) fail(options.lang ? `no post with lang "${options.lang}"` : 'config.posts is empty');

  const plain = (post.text ?? readFileSync(path.resolve(baseDir, post.file), 'utf8')).replace(/\r\n/g, '\n').trim();
  const comment = config.firstComment?.trim() ?? '';
  // Same rule as the preview: a secret never leaves the machine, and the
  // check runs on the plain text, before any bold letters hide it.
  const secrets = [...findLeaks(plain), ...findLeaks(comment)].filter(({ secret }) => secret);
  if (secrets.length > 0) fail(`not opening LinkedIn: the text has ${secrets.map(({ kind }) => kind).join(', ')} — remove it first`);

  const images = (config.images ?? []).map((image) => path.resolve(baseDir, image.path));
  const missing = images.find((image) => !existsSync(image));
  if (missing) fail(`image not found: ${missing}`);

  return {
    text: config.boldTitle ? withBoldTitle(plain) : plain,
    images,
    comment,
  };
}

// With one image the file manager highlights it. With several, numbered
// copies in a fresh folder keep the order the preview shows.
function imageTarget(images) {
  if (images.length <= 1) return { file: images[0] ?? null, folder: null };
  const folder = mkdtempSync(path.join(os.tmpdir(), 'linkedin-post-'));
  images.forEach((image, index) => copyFileSync(image, path.join(folder, `${index + 1}-${path.basename(image)}`)));
  return { file: null, folder };
}

function commandsFor(platform, url, target) {
  const reveal = target.file ?? target.folder;
  if (platform === 'darwin') {
    return {
      open: [['open', [url]]],
      reveal: reveal ? [['open', target.file ? ['-R', target.file] : [target.folder]]] : [],
      copy: [['pbcopy', []]],
    };
  }
  if (platform === 'win32') {
    return {
      // rundll32 hands the URL to the default browser without cmd.exe
      // splitting it at every "&".
      open: [['rundll32', ['url.dll,FileProtocolHandler', url]]],
      reveal: reveal ? [['explorer', [target.file ? `/select,${target.file}` : target.folder]]] : [],
      copy: [['powershell', ['-NoProfile', '-Command', '[Console]::InputEncoding=[Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())']]],
    };
  }
  return {
    open: [['xdg-open', [url]]],
    reveal: reveal ? [['xdg-open', [target.folder ?? path.dirname(target.file)]]] : [],
    // Whichever clipboard tool the desktop has; tried in order.
    copy: [['wl-copy', []], ['xclip', ['-selection', 'clipboard']], ['xsel', ['--clipboard', '--input']]],
  };
}

// Tries each alternative until one runs. explorer.exe exits with 1 even when
// it worked, so only a missing program counts as failure there.
function runFirst(alternatives, input) {
  for (const [program, args] of alternatives) {
    const result = spawnSync(program, args, { input, stdio: [input === undefined ? 'ignore' : 'pipe', 'ignore', 'ignore'] });
    const ran = !result.error && (result.status === 0 || program === 'explorer');
    if (ran) return program;
  }
  return null;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const post = loadPost(options);
  const url = shareUrl(post.text);
  if (url.length > URL_WARNING_LENGTH) say(`warning: the link is ${url.length} characters; LinkedIn may cut the end of the text`);

  const target = options.dryRun ? { file: post.images[0] ?? null, folder: null } : imageTarget(post.images);
  const commands = commandsFor(process.platform, url, target);

  if (options.dryRun) {
    say(`dry run on ${process.platform}: ${[...post.text].length} characters, link ${url.length} characters`);
    say(`would open: ${commands.open.map(([program]) => program).join(' or ')}`);
    say(`would reveal: ${target.file ?? 'no image'} (${post.images.length} image(s))`);
    say(post.comment
      ? `would copy the first comment with: ${commands.copy.map(([program]) => program).join(' or ')}`
      : 'no first comment — the link is in the body, nothing to copy');
    return;
  }

  const opened = runFirst(commands.open);
  say(opened ? 'LinkedIn opened with the post filled in' : `open this link by hand: ${url}`);

  if (commands.reveal.length > 0) {
    const revealed = runFirst(commands.reveal);
    const where = target.file ?? target.folder;
    say(revealed ? `showing ${where} — drag it into the post` : `attach this image by hand: ${where}`);
  }

  if (post.comment) {
    const copied = runFirst(commands.copy, post.comment);
    say(copied ? 'first comment copied — paste it under the post once it is published' : `first comment to paste by hand: ${post.comment}`);
  }
}

main();
