#!/usr/bin/env node
// Gets a LinkedIn post ready to publish for someone without the automatic
// mode: the composer opens with the text filled in, and the post's images
// wait in a folder whose path is on the clipboard. The person attaches them
// through LinkedIn's Media button and clicks Publish; nothing here touches
// their account.
//
// Usage: node linkedin-share.mjs <post.json> [--lang pt-BR] [--dry-run]
//
// Reads the same post.json as post-preview.mjs. Why the folder path: in
// testing, LinkedIn's composer took images only through the Media button —
// pasting an image and dragging one both failed. With the folder path on the
// clipboard, the file window jumps straight to it and select-all picks every
// image, in the preview's order, however many there are.
//
// Tested on macOS. Windows and Linux use each system's documented commands;
// whatever can't run is printed for the person to do by hand.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findLeaks } from './leaks.mjs';
import { shareUrl, withBoldTitle } from './linkedin-text.mjs';

const PREFIX = 'linkedin-share';
// Browsers take far longer URLs, but past this LinkedIn may cut the text.
const URL_WARNING_LENGTH = 8000;
const HAS_URL = /https?:\/\//;

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
    project: String(config.project ?? 'post'),
    text: config.boldTitle ? withBoldTitle(plain) : plain,
    images,
    comment,
  };
}

const LEFT_BY_AN_EARLIER_RUN = /^\d+-.+\.(?:png|jpe?g|gif|webp)$/i;

// Downloads/linkedin-posts/<project>: easy to find by hand, one folder per
// project, and stable — the browser's file window reopens where it was last
// used, so posting the same project again lands right in it.
function imageFolder(images, project) {
  const downloads = path.join(os.homedir(), 'Downloads');
  const safeName = project.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '') || 'post';
  const folder = path.join(existsSync(downloads) ? downloads : os.tmpdir(), 'linkedin-posts', safeName);
  mkdirSync(folder, { recursive: true });
  // Clears only the numbered images an earlier run of this project copied
  // here; anything else in the folder stays.
  readdirSync(folder)
    .filter((name) => LEFT_BY_AN_EARLIER_RUN.test(name))
    .forEach((name) => rmSync(path.join(folder, name)));
  // Numbered so select-all keeps the preview's order.
  images.forEach((image, index) => copyFileSync(image, path.join(folder, `${index + 1}-${path.basename(image)}`)));
  return folder;
}

function commandsFor(platform, url) {
  if (platform === 'darwin') return { open: [['open', [url]]], copy: [['pbcopy', []]] };
  if (platform === 'win32') {
    return {
      // rundll32 hands the URL to the default browser without cmd.exe
      // splitting it at every "&".
      open: [['rundll32', ['url.dll,FileProtocolHandler', url]]],
      copy: [['powershell', ['-NoProfile', '-Command', '[Console]::InputEncoding=[Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())']]],
    };
  }
  return {
    open: [['xdg-open', [url]]],
    // Whichever clipboard tool the desktop has; tried in order.
    copy: [['wl-copy', []], ['xclip', ['-selection', 'clipboard']], ['xsel', ['--clipboard', '--input']]],
  };
}

// The file window's own "go to this folder" shortcut, per system.
const JUMP_TO_FOLDER = {
  darwin: '⌘⇧G, ⌘V, Enter',
  win32: 'Ctrl+V into the "File name" box, Enter',
  linux: 'Ctrl+L, Ctrl+V, Enter',
};
const SELECT_ALL = { darwin: '⌘A, Enter', win32: 'click one image, Ctrl+A, Open', linux: 'Ctrl+A, Open' };

function stepsFor(platform, { hasCard, images }) {
  const system = JUMP_TO_FOLDER[platform] ? platform : 'linux';
  return [
    // A link in the text makes LinkedIn add a link-preview card, and a post
    // holds either that card or images.
    ...(hasCard ? ['close the link preview card (its X)'] : []),
    ...(images > 0
      ? [
          'click Media (the photo icon)',
          `in the file window, if it isn't already showing the project's folder: ${JUMP_TO_FOLDER[system]}`,
          `${SELECT_ALL[system]} — all ${images} image(s), in order`,
          'confirm the images (Next / Done)',
        ]
      : []),
    'click Publish',
  ];
}

// Tries each alternative until one runs.
function runFirst(alternatives, input) {
  for (const [program, args] of alternatives) {
    const result = spawnSync(program, args, { input, stdio: [input === undefined ? 'ignore' : 'pipe', 'ignore', 'ignore'] });
    if (!result.error && result.status === 0) return program;
  }
  return null;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const post = loadPost(options);
  const url = shareUrl(post.text);
  if (url.length > URL_WARNING_LENGTH) say(`warning: the link is ${url.length} characters; LinkedIn may cut the end of the text`);

  const commands = commandsFor(process.platform, url);
  const steps = stepsFor(process.platform, { hasCard: HAS_URL.test(post.text), images: post.images.length });

  if (options.dryRun) {
    say(`dry run on ${process.platform}: ${[...post.text].length} characters, link ${url.length} characters, ${post.images.length} image(s)`);
    say(`would open the composer with: ${commands.open.map(([program]) => program).join(' or ')}`);
    if (post.images.length > 0) say(`would put the image folder's path on the clipboard with: ${commands.copy.map(([program]) => program).join(' or ')}`);
    steps.forEach((step, index) => say(`step ${index + 1}: ${step}`));
    return;
  }

  const opened = runFirst(commands.open);
  say(opened ? 'LinkedIn opened with the post filled in' : `open this link by hand: ${url}`);

  if (post.images.length > 0) {
    const folder = imageFolder(post.images, post.project);
    const copied = runFirst(commands.copy, folder);
    say(copied ? `image folder's path copied: ${folder}` : `image folder (copy its path by hand): ${folder}`);
  }

  steps.forEach((step, index) => say(`step ${index + 1}: ${step}`));
  // The clipboard holds the folder path while the post is put together, so a
  // first comment can only be handed over as text.
  if (post.comment) say(`after publishing, comment: ${post.comment}`);
}

main();
