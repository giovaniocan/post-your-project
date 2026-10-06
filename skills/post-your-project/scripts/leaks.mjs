// What must never reach a public README or post, as patterns a script can see.
// Shared by check-readme.mjs and anything else that writes public text.
//
// Matches are reported by line and kind only: echoing the value would copy it
// into one more log.
//
// Secrets are problems — a token in a README is never right. Personal and
// internal data are warnings: an author may want their own email in the
// contact line, but that is theirs to decide, not ours to assume.

import { execFileSync } from 'node:child_process';

const SECRETS = [
  ['a private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['an AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['a GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['an OpenAI or Anthropic key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/],
  ['a Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['a Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['a Stripe live key', /\b[sr]k_live_[A-Za-z0-9]{16,}/],
  ['a JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];

const PERSONAL = [
  // Not right after ":" or "/": that is the password in a URL, reported below.
  ['an email address', /(?<![\w.%+:/-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g],
  ['a phone number', /(?:\+55\s?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g],
  ['a CPF', /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g],
  ['an IP address', /\b(?:\d{1,3}\.){3}\d{1,3}\b/g],
  // The lookbehind keeps `.env.local` from reading as a host named "env.local".
  ['an internal hostname', /(?<![.\w-])[\w-]+(?:\.[\w-]+)*\.(?:internal|local|corp|lan|intranet)\b/gi],
  ['a URL with a password', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]+@/gi],
];

// Addresses that are public by design and safe in any README.
const HARMLESS = /^(?:git@(?:github|gitlab|bitbucket)\.(?:com|org)|[^@]+@(?:example\.(?:com|org|net)|users\.noreply\.github\.com)|127\.0\.0\.1|0\.0\.0\.0)$/i;

export function findLeaks(text) {
  return text.split('\n').flatMap((line, index) => {
    const number = index + 1;
    const secrets = SECRETS.filter(([, pattern]) => pattern.test(line)).map(([kind]) => ({
      number,
      kind,
      secret: true,
    }));
    const personal = PERSONAL.flatMap(([kind, pattern]) =>
      [...line.matchAll(pattern)]
        .filter((match) => !HARMLESS.test(match[0]))
        .map(() => ({ number, kind, secret: false })),
    );
    return [...secrets, ...personal];
  });
}

// Folders whose files a web app serves to anyone who knows the path.
const SERVED_DIR = /(?:^|\/)(?:public|static|assets|www|wwwroot)\//;
const DOCUMENT = /\.(?:pdf|docx?|xlsx?|odt|ods|csv|sql|sqlite3?|db|zip|rar|7z)$/i;
const SECRET_FILE = /(?:^|\/)(?:\.env(?:\.[\w-]+)?|id_[rd]sa|[^/]+\.(?:pem|key|p12|pfx|jks|keystore))$/i;
const EXAMPLE_FILE = /\.(?:example|sample|template|dist)$/i;

// Files already in the public repo that the user should know about. Listed,
// never opened: a committed .env is read by name only.
export function exposedFiles(repo) {
  let tracked;
  try {
    tracked = execFileSync('git', ['-C', repo, 'ls-files'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return [];
  }
  return tracked
    .split('\n')
    .filter(Boolean)
    .flatMap((file) => {
      if (SECRET_FILE.test(file) && !EXAMPLE_FILE.test(file)) {
        return [`${file} is committed and may hold credentials — tell the user; don't open it`];
      }
      if (SERVED_DIR.test(file) && DOCUMENT.test(file)) {
        return [`${file} sits in a folder the app serves, so anyone can download it — ask the user whether it should be public`];
      }
      return [];
    });
}
