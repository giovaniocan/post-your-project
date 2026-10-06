#!/usr/bin/env node
// Checks the README pair this skill generates for the mistakes a reread tends
// to miss: a link to a file that doesn't exist (a License section pointing at a
// LICENSE nobody wrote), an image path typo that GitHub shows as a broken icon,
// and the two languages drifting apart.
//
// It also lists every promise word (production, scalable, real-time…) with its
// line. Those are warnings, not errors — "not for production use" is a fine
// sentence — but in test runs the claims that slipped past a careful reread
// were always these words, so each one has to be backed by the code or go.
//
// Leaks are checked on the whole text, code blocks included, since a token in
// an example command is still a token. A secret is a problem; personal or
// internal data (an email, a phone number, an IP) is a warning the user
// settles. Lines are reported, values never.
//
// Repo-level checks ride along. A README that tells readers to create a
// `.env` in a repo whose .gitignore doesn't cover it walks them into
// committing their key — that is a problem. Images the previous README used and
// the new one doesn't are listed as warnings: they may be orphans, or used
// elsewhere (social preview, other docs), so the user decides. So are files the
// public repo already exposes — a committed .env, a résumé under public/.
//
// Usage: node check-readme.mjs <repo-dir>
// Exit 1 when there are problems (one per line); warnings alone keep exit 0.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { exposedFiles, findLeaks } from './leaks.mjs';
import { PROMISE_WORDS } from './wording.mjs';

const FILES = { en: 'README.md', pt: 'README.pt-BR.md' };
const FENCED_BLOCK = /^(```|~~~)[\s\S]*?^\1/gm;
const INLINE_CODE = /`[^`\n]*`/g;
const MARKDOWN_TARGET = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const HTML_SRC = /<img[^>]+src=["']([^"']+)["']/gi;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;
const EXTERNAL = /^(https?:|mailto:|#)/i;
const LICENSE_HEADING = /^##\s+(license|licen[çc]a)\b/im;
const LICENSE_FILES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING'];
const HEADING = /^#{1,6}\s+(.+?)\s*#*$/;
const SHELL_BLOCK = /^(```|~~~)[ \t]*(?:bash|sh|shell|zsh|console)[ \t]*\n([\s\S]*?)^\1/gm;
const FILE_LIKE = /^(?:\.\/)?[\w.-][\w./-]*\.(?:py|js|mjs|cjs|ts|sh|example|sample|txt|toml|ya?ml|json|cfg|ini)$/;
const WRITES_NEXT = new Set(['>', '>>', 'tee', 'touch']);
const FENCE = /^\s*(```|~~~)/;
const SECRET_FILE = /(?:^|[\s>])(\.env(?:\.local)?)(?=\s|$)/gm;

function proseOf(markdown) {
  // Paths inside code blocks are commands and examples, not links to check.
  return markdown.replace(FENCED_BLOCK, '').replace(INLINE_CODE, '');
}

function targetsOf(prose) {
  const fromMarkdown = [...prose.matchAll(MARKDOWN_TARGET)].map((match) => match[1]);
  const fromHtml = [...prose.matchAll(HTML_SRC)].map((match) => match[1]);
  return [...fromMarkdown, ...fromHtml]
    .filter((target) => !EXTERNAL.test(target))
    .map((target) => decodeURI(target.split('#')[0].split('?')[0]).replace(/^\.\//, ''))
    .filter(Boolean);
}

function git(repo, args) {
  try {
    const out = execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return { status: 0, out };
  } catch (error) {
    return { status: error.status ?? -1, out: '' };
  }
}

function unignoredSecretFiles(repo, markdowns) {
  const files = new Set(
    markdowns.flatMap((markdown) =>
      [...markdown.matchAll(SHELL_BLOCK)].flatMap((block) => [...block[2].matchAll(SECRET_FILE)].map((m) => m[1])),
    ),
  );
  // check-ignore exits 0 when ignored, 1 when not; anything else means no git
  // repo, which says nothing either way.
  return [...files].filter((file) => git(repo, ['check-ignore', '-q', file]).status === 1);
}

function orphanedImages(repo, currentImages) {
  // "./" keeps the path relative to the folder, so a README inside a monorepo
  // app is compared with its own previous version, not the root one.
  const previous = git(repo, ['show', 'HEAD:./README.md']);
  if (previous.status !== 0) return [];
  const before = targetsOf(proseOf(previous.out)).filter((target) => IMAGE_EXT.test(target));
  return [...new Set(before)].filter((image) => !currentImages.has(image) && existsSync(path.join(repo, image)));
}

function sectionCount(prose) {
  return prose.split('\n').filter((line) => /^##\s/.test(line)).length;
}

// Prose lines with their original line numbers, so warnings can point at them.
function proseLines(markdown) {
  let inFence = false;
  return markdown.split('\n').flatMap((text, index) => {
    if (FENCE.test(text)) {
      inFence = !inFence;
      return [];
    }
    return inFence ? [] : [{ number: index + 1, text: text.replace(INLINE_CODE, '') }];
  });
}

function duplicateHeadings(lines) {
  const seen = new Map();
  for (const { number, text } of lines) {
    const match = text.match(HEADING);
    if (!match) continue;
    const key = match[1].toLowerCase();
    seen.set(key, [...(seen.get(key) ?? []), number]);
  }
  return [...seen.entries()].filter(([, numbers]) => numbers.length > 1);
}

// Files that the install/run commands expect to find, e.g. `cp .env.example .env`
// or `pip install -r requirements.txt`. A test run invented a `.env.example`
// that the repo never had; nothing else in the check looks inside code blocks.
function missingCommandFiles(repo, markdown) {
  const missing = new Set();
  for (const block of markdown.matchAll(SHELL_BLOCK)) {
    let cwd = '';
    const created = new Set();
    const commands = block[2]
      .split('\n')
      .map((line) => line.replace(/^\s*\$\s*/, '').replace(/\s#.*$/, ''))
      .flatMap((line) => line.split(/&&|;/));
    for (const command of commands) {
      const tokens = command.trim().split(/\s+/).filter(Boolean);
      if (tokens[0] === 'cd' && tokens[1]) {
        // "cd <repo>" right after the clone is the repo root, not a folder inside it.
        const target = path.join(cwd, tokens[1]);
        cwd = existsSync(path.join(repo, target)) ? target : '';
        continue;
      }
      tokens.forEach((token, i) => {
        if (!FILE_LIKE.test(token)) return;
        const file = path.join(cwd, token.replace(/^\.\//, ''));
        const isDestination = ['cp', 'mv'].includes(tokens[0]) && i === tokens.length - 1;
        if (WRITES_NEXT.has(tokens[i - 1]) || isDestination) {
          created.add(file);
        } else if (!created.has(file) && !existsSync(path.join(repo, file))) {
          missing.add(file);
        }
      });
    }
  }
  return [...missing];
}

function promiseWords(lines) {
  return lines.flatMap(({ number, text }) =>
    [...text.matchAll(PROMISE_WORDS)].map((match) => ({ number, word: match[1], text: text.trim() })),
  );
}

function inspect(repo, file) {
  const markdown = readFileSync(path.join(repo, file), 'utf8');
  const prose = proseOf(markdown);
  const targets = targetsOf(prose);
  const lines = proseLines(markdown);
  return {
    file,
    raw: markdown,
    targets,
    images: new Set(targets.filter((target) => IMAGE_EXT.test(target))),
    sections: sectionCount(prose),
    duplicates: duplicateHeadings(lines),
    claims: promiseWords(lines),
    commandFiles: missingCommandFiles(repo, markdown),
    leaks: findLeaks(markdown),
  };
}

function warningsFor(docs) {
  return docs.flatMap((doc) =>
    doc.claims.map(({ number, word, text }) => {
      const excerpt = text.length > 90 ? `${text.slice(0, 87)}...` : text;
      return `${doc.file}:${number} "${word}" — back it with the code or remove it: ${excerpt}`;
    }),
  );
}

function check(repo) {
  const missingFiles = Object.values(FILES).filter((file) => !existsSync(path.join(repo, file)));
  if (missingFiles.length > 0) {
    return { problems: missingFiles.map((file) => `${file} does not exist`), warnings: [] };
  }

  const en = inspect(repo, FILES.en);
  const pt = inspect(repo, FILES.pt);
  const problems = [];

  for (const doc of [en, pt]) {
    for (const [heading, numbers] of doc.duplicates) {
      problems.push(`${doc.file} repeats the heading "${heading}" (lines ${numbers.join(', ')})`);
    }
    for (const file of doc.commandFiles) {
      problems.push(`${doc.file} has a command that uses ${file}, which is not in the repo`);
    }
    for (const { number, kind } of doc.leaks.filter((leak) => leak.secret)) {
      problems.push(`${doc.file}:${number} has what looks like ${kind} — remove it; values never go in a README`);
    }
  }

  if (!en.raw.includes(`(${FILES.pt})`)) problems.push(`${FILES.en} has no language switcher linking to ${FILES.pt}`);
  if (!pt.raw.includes(`(${FILES.en})`)) problems.push(`${FILES.pt} has no language switcher linking to ${FILES.en}`);

  for (const doc of [en, pt]) {
    for (const target of new Set(doc.targets)) {
      if (!existsSync(path.join(repo, target))) problems.push(`${doc.file} links to ${target}, which does not exist`);
    }
  }

  // Checked apart from links because the usual slip is prose — "See LICENSE
  // for details" — which no link check would catch.
  const hasLicenseFile = LICENSE_FILES.some((file) => existsSync(path.join(repo, file)));
  for (const doc of [en, pt]) {
    if (LICENSE_HEADING.test(proseOf(doc.raw)) && !hasLicenseFile) {
      problems.push(`${doc.file} has a license section but the repo has no LICENSE file`);
    }
  }

  for (const image of en.images) {
    if (!pt.images.has(image)) problems.push(`${image} is in ${FILES.en} but not in ${FILES.pt}`);
  }
  for (const image of pt.images) {
    if (!en.images.has(image)) problems.push(`${image} is in ${FILES.pt} but not in ${FILES.en}`);
  }

  if (en.sections !== pt.sections) {
    problems.push(`${FILES.en} has ${en.sections} "##" sections and ${FILES.pt} has ${pt.sections}; they should mirror each other`);
  }

  for (const file of unignoredSecretFiles(repo, [en.raw, pt.raw])) {
    problems.push(`the README tells readers to create ${file}, but .gitignore doesn't cover it — add it to .gitignore`);
  }

  const orphans = orphanedImages(repo, new Set([...en.images, ...pt.images])).map(
    (image) => `${image} was used by the previous README and nothing uses it now — ask the user whether to delete it`,
  );

  const personal = [en, pt].flatMap((doc) =>
    doc.leaks
      .filter((leak) => !leak.secret)
      .map(({ number, kind }) => `${doc.file}:${number} has what looks like ${kind} — remove it unless the user asked for it there`),
  );

  return { problems, warnings: [...personal, ...warningsFor([en, pt]), ...orphans, ...exposedFiles(repo)] };
}

const repo = process.argv[2];
if (!repo) {
  console.error('usage: node check-readme.mjs <repo-dir>');
  process.exit(1);
}

const { problems, warnings } = check(path.resolve(repo));
problems.forEach((problem) => console.log(`check-readme: ${problem}`));
warnings.forEach((warning) => console.log(`check-readme: warning: ${warning}`));
if (problems.length > 0) {
  process.exitCode = 1;
} else {
  console.log(`check-readme: ok${warnings.length > 0 ? ` — ${warnings.length} warning(s) to review above` : ''}`);
}
