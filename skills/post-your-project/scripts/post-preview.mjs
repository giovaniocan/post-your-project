#!/usr/bin/env node
// Builds the preview page for a LinkedIn post draft: the text as it will read,
// where "see more" cuts it, the character count, the images to attach and a
// copy button. It also lints the text, because the things that make a post read
// as generated — stock openers, markdown LinkedIn shows literally, promises the
// README doesn't back — are easy to list and easy to miss on a reread.
//
// Usage: node post-preview.mjs <post.json> <preview.html> [--standalone]
//
// post.json:
// {
//   "project": "Order Tracker",
//   "author": "Ana Souza",                               // optional, shown on the card
//   "posts": [ { "lang": "pt-BR", "file": "/abs/post-pt.txt" },  // or "text": "..."
//              { "lang": "en", "file": "/abs/post-en.txt" } ],
//   "images": [ { "path": "/abs/docs/screenshots/home.png", "alt": "..." } ],
//   "firstComment": "Code: https://github.com/...",      // optional
//   "boldTitle": true,       // optional: the first line becomes Unicode bold, accents kept
//   "limits": { "bodyMin": 900, "bodyMax": 1800, "maxHashtags": 3, "maxEmoji": 2 }  // optional
// }
// Each post may also carry "titleOptions": ["...", "..."], listed beside it.
// Write the title as plain text: the script does the bold conversion, so the
// review sees real words and the copy gets the bold ones.
// "Body" means the text before a line starting with 🧰 (the tech-stack block).
//
// The page is written for the Artifact tool, which adds the document skeleton;
// --standalone adds it here, for opening the file straight in a browser.
// Lint findings print as "post-preview: <lang>: ..." and never stop the build.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findLeaks } from './leaks.mjs';
import { CLICHES, PROMISE_WORDS, matchesOf } from './wording.mjs';

const PREFIX = 'post-preview';
const CHARACTER_LIMIT = 3000;
const LONG_POST = 1500;
// LinkedIn cuts the feed preview at roughly this many characters or three
// lines, whichever comes first. Approximate on purpose: it varies by device.
const FOLD_CHARACTERS = 210;
const FOLD_LINES = 3;
const MAX_HASHTAGS = 5;
const MAX_EMBEDDED_BYTES = 12 * 1024 * 1024;
const LANGUAGE_NAMES = { 'pt-BR': 'Português', pt: 'Português', en: 'English' };
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

const HASHTAG = /#[\p{L}\p{N}_]+/gu;
const URL_PATTERN = /https?:\/\/[^\s<]+/g;
const HAS_URL = /https?:\/\//;
const MARKDOWN = /\*\*[^*\n]+\*\*|__[^_\n]+__|^#{1,6}\s|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)/m;
const MATH_ALPHANUMERICS = /[\u{1D400}-\u{1D7FF}]/u;
const STACK_LINE = /^\s*🧰/mu;
const EMOJI = /\p{Extended_Pictographic}/gu;

// Mathematical Sans-Serif Bold: the "bold" LinkedIn readers see. Accented
// letters have no bold form, so they are split (NFD), the base letter is
// converted and the accent is put back on it.
function toUnicodeBold(text) {
  const bold = [...text.normalize('NFD')].map((character) => {
    const code = character.codePointAt(0);
    if (character >= 'A' && character <= 'Z') return String.fromCodePoint(0x1d5d4 + code - 65);
    if (character >= 'a' && character <= 'z') return String.fromCodePoint(0x1d5ee + code - 97);
    if (character >= '0' && character <= '9') return String.fromCodePoint(0x1d7ec + code - 48);
    return character;
  });
  return bold.join('').normalize('NFC');
}

function withBoldTitle(text) {
  const [title, ...rest] = text.split('\n');
  return [toUnicodeBold(title), ...rest].join('\n');
}

function bodyOf(text) {
  const match = text.match(STACK_LINE);
  return match ? text.slice(0, match.index).trimEnd() : text;
}

function fail(message) {
  console.error(`${PREFIX}: ${message}`);
  process.exit(1);
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`cannot read ${file}: ${String(error.message).split('\n')[0]}`);
  }
}

function loadPosts(config, baseDir) {
  if (!Array.isArray(config.posts) || config.posts.length === 0) fail('config.posts must list at least one post');
  return config.posts.map((post, index) => {
    if (!post.lang) fail(`posts[${index}].lang is required (e.g. "pt-BR" or "en")`);
    const text = post.text ?? (post.file ? readFileSync(path.resolve(baseDir, post.file), 'utf8') : null);
    if (!text || text.trim() === '') fail(`posts[${index}] has no text`);
    const titleOptions = Array.isArray(post.titleOptions) ? post.titleOptions.map(String) : [];
    return { lang: post.lang, text: text.replace(/\r\n/g, '\n').trim(), titleOptions };
  });
}

function pngSize(buffer) {
  const isPng = buffer.length > 24 && buffer.toString('ascii', 1, 4) === 'PNG';
  return isPng ? `${buffer.readUInt32BE(16)}×${buffer.readUInt32BE(20)}` : null;
}

function loadImages(config, baseDir) {
  const images = (config.images ?? []).map((image, index) => {
    if (!image.path) fail(`images[${index}].path is required`);
    const file = path.resolve(baseDir, image.path);
    const mime = MIME[path.extname(file).toLowerCase()];
    if (!mime) fail(`images[${index}]: ${path.basename(file)} is not a png, jpg, webp or gif`);
    let buffer;
    try {
      buffer = readFileSync(file);
    } catch (error) {
      fail(`cannot read ${file}: ${String(error.message).split('\n')[0]}`);
    }
    return { name: path.basename(file), alt: image.alt ?? '', size: pngSize(buffer), bytes: buffer.length, src: `data:${mime};base64,${buffer.toString('base64')}` };
  });
  const total = images.reduce((sum, image) => sum + image.bytes, 0);
  if (total > MAX_EMBEDDED_BYTES) fail(`images add up to ${Math.round(total / 1048576)} MB; keep them under 12 MB`);
  return images;
}

function characterCount(text) {
  return [...text].length;
}

function foldIndex(text) {
  let lineBreaks = 0;
  let index = 0;
  for (const character of text) {
    if (index >= FOLD_CHARACTERS) break;
    if (character === '\n') {
      lineBreaks += 1;
      if (lineBreaks >= FOLD_LINES) break;
    }
    index += character.length;
  }
  if (index >= text.length) return text.length;
  // Cut at a word boundary, as the feed does.
  const space = text.lastIndexOf(' ', index);
  return space > FOLD_CHARACTERS / 2 ? space : index;
}

function lint(post, { limits, boldTitle }) {
  const notes = [];
  const length = characterCount(post.text);
  const bodyLength = characterCount(bodyOf(post.text));
  // In Portuguese: the same notes show on the preview page, which the user reads.
  if (length > CHARACTER_LIMIT) notes.push(`${length} caracteres — o LinkedIn corta o post em ${CHARACTER_LIMIT}`);
  if (limits.bodyMax && bodyLength > limits.bodyMax) {
    notes.push(`corpo com ${bodyLength} caracteres sem a stack — o combinado é no máximo ${limits.bodyMax}`);
  } else if (limits.bodyMin && bodyLength < limits.bodyMin) {
    notes.push(`corpo com ${bodyLength} caracteres sem a stack — o combinado é no mínimo ${limits.bodyMin}`);
  } else if (!limits.bodyMax && length > LONG_POST && length <= CHARACTER_LIMIT) {
    notes.push(`${length} caracteres é longo para post de projeto; os bons costumam ficar entre 700 e 1.300`);
  }
  if (MARKDOWN.test(post.text)) notes.push('tem markdown (**negrito**, # título, `código` ou [link](url)) — o LinkedIn mostra os símbolos como estão');
  if (MATH_ALPHANUMERICS.test(post.text)) {
    notes.push(boldTitle
      ? 'letras em negrito Unicode no texto — escreva tudo em texto normal; o script converte o título'
      : 'letras "negrito" ou "itálico" em Unicode — leitor de tela e busca não conseguem ler');
  }
  const maxHashtags = limits.maxHashtags ?? MAX_HASHTAGS;
  const hashtags = matchesOf(post.text, HASHTAG);
  if (hashtags.length > maxHashtags) notes.push(`${hashtags.length} hashtags — use no máximo ${maxHashtags}`);
  if (limits.maxEmoji !== undefined) {
    const emoji = matchesOf(bodyOf(post.text), EMOJI).length;
    if (emoji > limits.maxEmoji) notes.push(`${emoji} emojis no corpo — o combinado é no máximo ${limits.maxEmoji}`);
  }
  for (const cliche of new Set(matchesOf(post.text, CLICHES))) notes.push(`frase pronta "${cliche}" — diga a coisa concreta no lugar`);
  for (const word of new Set(matchesOf(post.text, PROMISE_WORDS))) notes.push(`"${word}" — sustente com o README ou tire`);
  if (HAS_URL.test(post.text)) notes.push('link no corpo do post — posts com link externo costumam alcançar menos gente; o lugar de costume é o primeiro comentário');
  // Kind and line only, never the value: see leaks.mjs.
  for (const leak of findLeaks(post.text).filter(({ secret }) => !secret)) {
    notes.push(`linha ${leak.number}: ${leak.kind} — dado pessoal só entra se o autor pediu`);
  }
  return notes;
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function decorate(text) {
  return escapeHtml(text)
    .replace(URL_PATTERN, (url) => `<span class="tag">${url}</span>`)
    .replace(HASHTAG, (tag) => `<span class="tag">${tag}</span>`);
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join('');
}

const formatNumber = new Intl.NumberFormat('pt-BR').format;

function panelHtml(post, index, context) {
  const fold = foldIndex(post.text);
  const before = post.text.slice(0, fold);
  const after = post.text.slice(fold);
  const length = characterCount(post.text);
  const bodyLength = characterCount(bodyOf(post.text));
  const hashtags = matchesOf(post.text, HASHTAG).length;
  const emoji = matchesOf(bodyOf(post.text), EMOJI).length;
  const titleOptions = post.titleOptions.length
    ? `<div class="review">
          <h2>Outras opções de título</h2>
          <ul class="options">${post.titleOptions.map((title) => `<li>${escapeHtml(title)}</li>`).join('')}</ul>
        </div>`
    : '';
  const notes = post.notes.length
    ? `<ul class="notes">${post.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`
    : '<p class="clean">Nenhum alerta na revisão automática.</p>';
  const images = context.images.length
    ? `<div class="media count-${Math.min(context.images.length, 3)}">${context.images
        .map((image) => `<img src="${image.src}" alt="${escapeHtml(image.alt)}">`)
        .join('')}</div>`
    : '';
  const marker = after ? '<span class="fold" title="Até aqui aparece no feed; o resto fica atrás do “ver mais”">ver mais</span>' : '';
  return `
  <section class="panel" id="panel-${index}" role="tabpanel" aria-labelledby="tab-${index}" ${index === 0 ? '' : 'hidden'}>
    <div class="layout">
      <article class="card" lang="${escapeHtml(post.lang)}">
        <header class="author">
          <span class="avatar" aria-hidden="true">${escapeHtml(initials(context.author))}</span>
          <span><strong>${escapeHtml(context.author)}</strong><small>agora · rascunho</small></span>
        </header>
        <div class="text">${decorate(before)}${marker}<span class="rest">${decorate(after)}</span></div>
        ${images}
      </article>
      <aside class="side">
        <button type="button" class="copy primary" data-copy="post-${index}" id="copy-post-${index}">Copiar texto</button>
        <dl class="stats">
          <div><dt>Caracteres</dt><dd><span class="${length > CHARACTER_LIMIT ? 'over' : ''}">${formatNumber(length)}</span> / ${formatNumber(CHARACTER_LIMIT)}</dd></div>
          <div><dt>Corpo sem a stack</dt><dd>${formatNumber(bodyLength)}</dd></div>
          <div><dt>Antes do “ver mais”</dt><dd>${formatNumber(characterCount(before))}</dd></div>
          <div><dt>Hashtags</dt><dd>${hashtags}</dd></div>
          <div><dt>Emojis no corpo</dt><dd>${emoji}</dd></div>
          <div><dt>Imagens</dt><dd>${context.images.length}</dd></div>
        </dl>
        <div class="review">
          <h2>Revisão automática</h2>
          ${notes}
        </div>
        ${titleOptions}
      </aside>
    </div>
  </section>`;
}

function pageHtml(context) {
  const tabs = context.posts.length > 1
    ? `<div class="tabs" role="tablist" aria-label="Idioma do post">${context.posts
        .map((post, index) => `<button type="button" role="tab" id="tab-${index}" aria-controls="panel-${index}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${escapeHtml(LANGUAGE_NAMES[post.lang] ?? post.lang)}</button>`)
        .join('')}</div>`
    : '';
  const comment = context.firstComment
    ? `<section class="extra">
        <h2>Primeiro comentário</h2>
        <p class="hint">Publique o post e, em seguida, comente isto nele.</p>
        <div class="comment">${decorate(context.firstComment)}</div>
        <button type="button" class="copy" data-copy="comment" id="copy-comment">Copiar comentário</button>
      </section>`
    : '';
  const attachments = context.images.length
    ? `<section class="extra">
        <h2>Imagens para anexar, nesta ordem</h2>
        <ol class="files">${context.images.map((image) => `<li><code>${escapeHtml(image.name)}</code>${image.size ? ` <span>${image.size}</span>` : ''}</li>`).join('')}</ol>
      </section>`
    : '';
  // "<" escaped so a post containing "</script>" can't end the data block.
  const data = JSON.stringify({
    ...Object.fromEntries(context.posts.map((post, index) => [`post-${index}`, post.text])),
    comment: context.firstComment ?? '',
  }).replace(/</g, '\\u003c');

  return `<title>${escapeHtml(context.project)} LinkedIn Post</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
  /* Layout: a drafting desk — the post as it will read on the left, the numbers and checks beside it. */
  :root {
    --bg: #f3f4f6; --surface: #ffffff; --fg: #1c1e23; --muted: #5b616d; --line: #dcdfe5;
    --accent: #95560f; --accent-soft: #f5e7d4; --warn: #a3361c; --ok: #2c6a4e;
    --ui: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
    --mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
    --post: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #111317; --surface: #1a1d22; --fg: #e8eaee; --muted: #9ea4af; --line: #2c3038;
      --accent: #e3a35a; --accent-soft: #3a2d1d; --warn: #ef8b6f; --ok: #7bc4a0; color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --bg: #111317; --surface: #1a1d22; --fg: #e8eaee; --muted: #9ea4af; --line: #2c3038;
    --accent: #e3a35a; --accent-soft: #3a2d1d; --warn: #ef8b6f; --ok: #7bc4a0; color-scheme: dark;
  }
  body { background: var(--bg); color: var(--fg); font: 15px/1.5 var(--ui); }
  .wrap { max-width: 1040px; margin: 0 auto; padding-inline: 16px; padding-block: 32px 48px; display: grid; gap: 24px; }
  .head { display: grid; gap: 4px; }
  .eyebrow { margin: 0; font: 500 12px/1.4 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
  h1 { margin: 0; font-size: 28px; font-weight: 600; text-wrap: balance; }
  .sub { margin: 0; color: var(--muted); }
  h2 { margin: 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); }
  .tabs button { font: 500 14px var(--ui); color: var(--muted); background: none; border: 0; padding: 8px 14px; border-bottom: 2px solid transparent; cursor: pointer; }
  .tabs button[aria-selected="true"] { color: var(--fg); border-bottom-color: var(--accent); }
  .layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 24px; align-items: start; }
  @media (max-width: 760px) { .layout { grid-template-columns: minmax(0, 1fr); } }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding-block: 16px; display: grid; gap: 12px; min-width: 0; max-width: 555px; }
  .author { display: flex; gap: 10px; align-items: center; padding-inline: 16px; }
  .author span:last-child { display: grid; }
  .author small { color: var(--muted); font-size: 12px; }
  .avatar { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); font-weight: 600; }
  .text { padding-inline: 16px; font: 14px/1.45 var(--post); white-space: pre-wrap; overflow-wrap: anywhere; }
  .tag { color: var(--accent); font-weight: 500; }
  .fold { display: inline-block; margin-inline: 6px; padding: 0 8px; border: 1px dashed var(--accent); border-radius: 999px; font: 500 11px/18px var(--mono); color: var(--accent); vertical-align: 1px; }
  .rest { color: var(--fg); }
  .media { display: grid; gap: 2px; }
  .media img { width: 100%; height: 100%; object-fit: cover; display: block; background: var(--bg); }
  .media.count-1 img { height: auto; }
  .media.count-2 { grid-template-columns: 1fr 1fr; }
  .media.count-3 { grid-template-columns: 2fr 1fr; grid-template-rows: 1fr 1fr; }
  .media.count-3 img:first-child { grid-row: span 2; }
  .side { display: grid; gap: 16px; min-width: 0; }
  .stats { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .stats div { background: var(--surface); padding: 10px 12px; display: grid; gap: 2px; }
  .stats dt { font-size: 12px; color: var(--muted); }
  .stats dd { margin: 0; font: 500 16px var(--mono); font-variant-numeric: tabular-nums; }
  .over { color: var(--warn); }
  .review { display: grid; gap: 8px; }
  .notes { margin: 0; padding-left: 18px; display: grid; gap: 6px; color: var(--warn); font-size: 14px; }
  .clean { margin: 0; color: var(--ok); font-size: 14px; }
  .options { margin: 0; padding-left: 18px; display: grid; gap: 6px; font-size: 14px; }
  button.copy { font: 500 14px var(--ui); border-radius: 6px; padding: 10px 14px; cursor: pointer; border: 1px solid var(--line); background: var(--surface); color: var(--fg); justify-self: start; }
  button.copy.primary { background: var(--fg); color: var(--bg); border-color: var(--fg); justify-self: stretch; }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .extra { display: grid; gap: 8px; max-width: 555px; }
  .hint { margin: 0; color: var(--muted); font-size: 14px; }
  .comment { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; font: 14px/1.45 var(--post); white-space: pre-wrap; overflow-wrap: anywhere; }
  .files { margin: 0; padding-left: 20px; display: grid; gap: 4px; }
  .files code { font: 13px var(--mono); }
  .files span { color: var(--muted); font: 12px var(--mono); }
  .toast { position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); background: var(--fg); color: var(--bg); padding: 8px 14px; border-radius: 6px; font-size: 14px; }
  @media (prefers-reduced-motion: no-preference) { .toast { transition: opacity .2s; } }
</style>
<main class="wrap">
  <header class="head">
    <p class="eyebrow">Rascunho para o LinkedIn</p>
    <h1>${escapeHtml(context.project)}</h1>
    <p class="sub">Revise, copie e publique você mesmo. Nada foi postado.</p>
  </header>
  ${tabs}
  ${context.posts.map((post, index) => panelHtml(post, index, context)).join('')}
  ${attachments}
  ${comment}
</main>
<div class="toast" role="status" aria-live="polite" hidden></div>
<script type="application/json" id="post-data">${data}</script>
<script>
  const texts = JSON.parse(document.getElementById('post-data').textContent);
  const toast = document.querySelector('.toast');
  let toastTimer;
  function say(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
  }
  function selectFallback(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (error) { copied = false; }
    area.remove();
    return copied;
  }
  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', () => {
      const text = texts[button.dataset.copy] ?? '';
      const done = () => say(button.dataset.copy === 'comment' ? 'Comentário copiado' : 'Texto copiado');
      const fallback = () => (selectFallback(text) ? done() : say('Não deu para copiar aqui; selecione o texto e copie à mão'));
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    });
  });
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function show(index) {
    tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    });
    tabs[index].focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => show(index));
    tab.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') show((index + 1) % tabs.length);
      if (event.key === 'ArrowLeft') show((index - 1 + tabs.length) % tabs.length);
    });
  });
</script>`;
}

function main() {
  const [configFile, outputFile, ...flags] = process.argv.slice(2);
  if (!configFile || !outputFile) fail('usage: node post-preview.mjs <post.json> <preview.html> [--standalone]');
  if (!outputFile.endsWith('.html')) fail('the preview path must end in .html');
  const unknown = flags.filter((flag) => flag !== '--standalone');
  if (unknown.length > 0) fail(`unknown option ${unknown[0]}`);

  const config = readJson(configFile);
  if (!config.project) fail('config.project is required');
  const baseDir = path.dirname(path.resolve(configFile));
  const options = { limits: config.limits ?? {}, boldTitle: Boolean(config.boldTitle) };
  // Checks run on the plain text: a key in bold Unicode letters would slip past
  // every pattern. The bold version is what the page shows and the copy takes.
  const posts = loadPosts(config, baseDir).map((post) => ({
    ...post,
    plain: post.text,
    text: options.boldTitle ? withBoldTitle(post.text) : post.text,
    notes: lint(post, options),
  }));

  // A secret stops the build instead of becoming a note: the preview page
  // would carry it, and the next step is the user pasting the text in public.
  const secrets = [
    ...posts.flatMap((post) => findLeaks(post.plain).map((leak) => ({ ...leak, where: post.lang }))),
    ...findLeaks(config.firstComment ?? '').map((leak) => ({ ...leak, where: 'first comment' })),
  ].filter(({ secret }) => secret);
  if (secrets.length > 0) {
    fail(`not building the preview: ${secrets.map(({ where, number, kind }) => `${where} line ${number} has ${kind}`).join('; ')} — remove it from the text`);
  }
  const context = {
    project: config.project,
    author: config.author ?? config.project,
    posts,
    images: loadImages(config, baseDir),
    firstComment: config.firstComment?.trim() || null,
  };

  const page = pageHtml(context);
  const html = flags.includes('--standalone')
    ? `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${page}</body></html>`
    : page;
  writeFileSync(path.resolve(outputFile), html);

  for (const post of posts) {
    for (const note of post.notes) console.log(`${PREFIX}: ${post.lang}: ${note}`);
  }
  console.log(`${PREFIX}: wrote ${path.resolve(outputFile)} (${posts.length} post${posts.length > 1 ? 's' : ''}, ${context.images.length} image${context.images.length === 1 ? '' : 's'})`);
}

main();
