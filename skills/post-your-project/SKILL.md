---
name: post-your-project
description: Present a software project publicly — a polished bilingual README (README.md in English plus README.pt-BR.md in Brazilian Portuguese) grounded in the project's actual code, with real screenshots of the running app or its terminal output, and a LinkedIn post about it with a private preview to copy from. Use this whenever the user wants to document, present, showcase, announce or "make presentable" a repository — for GitHub, a portfolio or LinkedIn — even if they mention only one piece of it, e.g. "gera um README pro meu projeto", "faz o readme em inglês e português", "tira prints do sistema pro README", "deixa esse repo bonito pro portfólio", "escreve um post pro LinkedIn sobre esse projeto", "quero divulgar esse projeto no LinkedIn", "write a README for github.com/user/repo". Works on a local folder or a GitHub URL. Not for editing one section of an existing README, internal docs such as ADRs, runbooks, changelogs or API references, or posts that aren't about a project.
---

# Post Your Project — bilingual README, real screenshots, LinkedIn post

Produces, inside the target repository:

- `README.md` — English
- `README.pt-BR.md` — Brazilian Portuguese
- `docs/screenshots/*.png` — captures of the app actually running

And, outside it, a LinkedIn post draft with a private preview page (see
"LinkedIn post" at the end). When the user asks for only one of the two, do
only that one; after a README, offer the post.

`<skill-dir>` below is this skill's base directory, which Claude Code shows as
"Base directory for this skill" when it loads it: `~/.claude/skills/post-your-project`
for a personal install, a folder under `~/.claude/plugins/` when it comes from
the plugin. Its scripts take absolute paths.

A README is often the only file a recruiter or client opens, and they decide in
seconds. Two failures ruin it, and most of this skill exists to avoid them:

1. **Claims the code doesn't back up** — a feature that isn't there, a command
   that doesn't run. One of those and the reader stops trusting the rest.
2. **Screenshots that aren't real, or that leak real data.** A README on GitHub
   is public and stays in git history forever.

## Nothing private goes public

The README, the screenshots and the post are public, and git history and feeds
keep them after any later fix. A leak is worse than any missing feature, so
these rules hold at every step — including while you run the project.

**Never put in the README, an image or the post:**

- Secret values or identifiers: API keys, tokens, passwords, connection
  strings, webhook URLs, service and template IDs. That includes keys the
  vendor calls "public" and keys already committed: far more people read a
  README than the source.
- Personal data of real people, the author included unless they ask for it:
  names, emails, phone numbers, addresses, CPF and other IDs, documents.
- Client data: real records and figures, account names, internal URLs,
  hostnames and IPs.
- Anything read from `.env` files, credential files, local databases or
  folders outside the repo.

When readers need to configure something, name the variable or the file and
tell them to use their own. Never write the value, and never say that the
committed credentials work ("submitting sends a real email through the account
in X") — that invites strangers to abuse them.

**Report what is already exposed.** While building the fact sheet, note what
the public repo already gives away: keys and IDs hard-coded in source,
personal files in folders the app serves (a résumé in `public/` downloads from
the live site), personal data inside images (a phone number on a banner), seed
files that look like real people. Tell the user in the hand-back by file and
kind, never by value. Don't change those files yourself, and don't make one of
them the subject of a screenshot without asking.

**Running it reaches no one.** Before running a test suite, check whether it
calls a real outside service unmocked — email, SMS, payment, chat, webhooks,
an LLM. If it does, run it with that module stubbed through a config kept
outside the repo, and tell the user that the committed suite makes that call.
In the browser, never submit a form that sends something out (an order, a
message, a sign-up): reach the screen after it another way and say how, and
list the service's host under `block` in the capture config so a stray click
can't get through.

## 1. Locate the repository and open a branch

- A local path, or "this project" → use its git root.
- A GitHub URL or `owner/repo` → clone it into the session's scratchpad (or a
  temp dir if there is none): `gh repo clone <owner/repo> <dir>/<repo>`. Tell
  the user where the clone lives.
- Run `git status`. If `README.md` has uncommitted changes, stop and ask —
  overwriting them would destroy work that git cannot bring back. A committed
  README can be replaced; git keeps the old one.

The README goes to the user as a pull request they only have to approve, so
put the work on its own branch before writing anything:

- `git fetch origin` and find the default branch
  (`gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`). A local
  copy is often behind GitHub, and a branch cut from a stale one carries the
  staleness into the PR.
- Clean working tree: `git switch -c docs/readme origin/<default>`.
- Uncommitted work in other files: leave it alone and use a separate worktree,
  `git worktree add <scratchpad>/readme-worktree -b docs/readme origin/<default>`,
  and do every later step there — install, run, write. Switching branches
  under someone's unfinished work is how it gets lost.
- If `docs/readme` already exists, add the date: `docs/readme-<YYYY-MM-DD>`.
- Check that the user can push:
  `gh repo view --json viewerPermission --jq .viewerPermission` must be
  `ADMIN`, `MAINTAIN` or `WRITE`. If it isn't — someone else's repository —
  say so now: the files stay local, or you can fork it if they want a PR from
  their fork.

## 2. Build a fact sheet from the code

Read before writing anything. Sources, roughly in order of trust:

1. **Manifests** — `package.json` (and workspaces), `pyproject.toml`,
   `requirements.txt`, `go.mod`, `Cargo.toml`, `pubspec.yaml`, `*.csproj`,
   `Gemfile`, `composer.json`: name, stack, versions, scripts.
2. **Entry points and routes** — pages/app router, controllers, CLI commands,
   main screens: this is where features come from.
3. **Environment variables** — names only. Take them from `.env.example` or a
   config schema; without those, grep the code (`process.env.`,
   `import.meta.env.`, `os.environ`, `os.Getenv`). Never open `.env`,
   `.env.production` or any file that may hold real values — the code already
   tells you every name you need.
4. **How it really runs** — `docker-compose.yml`, `Makefile`, `.claude/launch.json`,
   CI workflows in `.github/workflows` (which also tell you whether tests exist
   and run).
5. **Existing README and `docs/`** — intent and history. Above all, keep the
   author's account of what the project *is*: if they call it a demo, a
   prototype, a course assignment or a hackathon entry, or say it runs on mock
   data, the new README says so too. Turning a demo into "a complete platform"
   is the most tempting way to break rule 1 above, and anyone who clones the
   repo finds out in a minute.
6. **`LICENSE`**.
7. **`git log --oneline -30`** — what is active, how mature the project is.

Write the fact sheet in your working notes (not in the repo): one-line pitch,
audience, features (each with the file that proves it), stack, run commands,
env vars, tests, license, the gaps, and what is already exposed (see "Nothing
private goes public"). If you cannot tell what the project is
*for*, ask the user that one question; derive everything else yourself.

For a monorepo, write one root README that presents the apps and how they fit
together, then per-app run instructions.

## 3. Capture screenshots

Aim for 2–5 images that show what the project *does*, not one per page: the
main screen, the core flow, and one thing that is distinctive about it.

### Web apps

1. Find how it starts: `.claude/launch.json`, package scripts (`dev`, `start`,
   `dev:all`), compose file, Makefile, existing README. Install dependencies
   respecting the lockfile (`npm ci`, `pnpm install --frozen-lockfile`, …),
   and always into the project or a throwaway environment — for Python, a venv
   in the scratchpad — never globally on the user's machine.
2. Start it in the background, check first that the port is free
   (`lsof -iTCP:<port> -sTCP:LISTEN`) and keep the PIDs of what you start. The
   user often has other servers running; you will need to stop yours and only
   yours. If it needs a database or a
   mock API, start them the way the project does (its compose file, its mock
   script). If it needs third-party secrets you don't have, don't invent them:
   capture what renders without them and tell the user what was left out.
3. If pages require login, use only credentials from the project's own seed or
   fixture files, or a test account you create locally. Never the user's real
   credentials.
4. First use only: `npm install --prefix <skill-dir>/scripts`. It installs
   `playwright-core` and drives the installed Google Chrome, so there is no
   browser download.
5. Write a config file **outside the repo** (scratchpad) and run
   `node <skill-dir>/scripts/capture.mjs <config.json>`. The format is
   documented at the top of the script; a typical one:

   ```json
   {
     "baseUrl": "http://localhost:3000",
     "outDir": "/abs/path/to/repo/docs/screenshots",
     "shots": [
       { "name": "dashboard", "path": "/", "waitFor": "main" },
       { "name": "order-details", "path": "/orders/1", "fullPage": true }
     ]
   }
   ```

   For `waitFor`, wait for something that only appears once the data has
   rendered — `main` and `body` are there while skeleton loaders still show.
   The easy way is a text selector taken from the real screen: a column header
   or card title that comes with the data, such as `"text=Receita do mês"`.
   Read it off the component's source rather than guessing CSS class names.
   Use `fullPage` only for pages about a screen or two long; the script clips
   anything taller and says so. Add a `login` block when needed. The script
   prints one JSON line per shot (final URL, HTTP status, size) and saves
   nothing for a page that answered 4xx/5xx.

   When the screen worth showing only appears after the user does something —
   a search result, an open modal, a toggled theme — give the shot `steps`
   (`fill`, `press`, `click`, `waitFor`), run in order after the page loads.
   A step never submits something that goes out (an order, a message, a
   sign-up); that rule from "Nothing private goes public" holds for steps too.
   When the app shows real people's data — a search over a public API, say —
   type in an account that exists for demos (GitHub's `octocat`) rather than a
   person's. Elements can hide at phone width (a button that is
   `display: none` below some breakpoint), so a step that works on desktop can
   time out on a mobile shot: check the component's media queries. If a toast
   is gone from the image although `waitFor` saw it, it closes when its
   progress-bar animation ends — set `"animations": "allow"` on that shot.
6. Stop what you started, by the PIDs you kept (or with TaskStop if you used
   the Bash tool's background mode), then confirm with `lsof` that the ports are
   free. Never `pkill node` or `killall` by name: that also kills the user's own
   servers and other sessions.

### Mobile apps

Expo, React Native, Flutter: run it on a simulator and capture with
`xcrun simctl io booted screenshot docs/screenshots/<name>.png` (iOS) or
`adb exec-out screencap -p > docs/screenshots/<name>.png` (Android).

### Projects without a screen — CLIs, scripts, scrapers, backends

Their screen is the terminal, so the picture is the output of a real run,
drawn as a terminal window:

1. Run the real command and keep what it prints, dependencies installed as in
   the web steps above:
   `FORCE_COLOR=1 <command> 2>&1 | tee <scratchpad>/output.txt`.
   `FORCE_COLOR` keeps colors in tools that drop them when piped; output
   without colors is fine too.
2. Cut it to the block that shows the result, into a second file. Whole
   output is rarely the picture: `2>&1` also brings in library warnings,
   deprecation notices, debug logs and setup chatter, and a reader of the
   README wants the result, not the noise around it. When the program prints
   intermediate steps and then a final summary or dashboard, the summary is
   the picture; the steps can go in "Sample output" if they help. Keep a
   contiguous block of lines; never change a word or a number inside it.
3. Render the cut file:
   `node <skill-dir>/scripts/terminal.mjs <scratchpad>/result.txt docs/screenshots/<name>.png --command "<command>"`.
   Add `--chrome` for a window bar with the three dots. The script draws the
   text exactly as captured, with its colors. If the README also shows the
   output as text ("Sample output"), it is the same cut of the same run, so
   image and text can't disagree.

What to run depends on the kind of project:

- **CLI or script**: the command a user would run first, with arguments that
  show its main result.
- **Scraper or bot**: one real run, in the narrowest mode it has (dry run, a
  single item, one page) when one exists. If it writes a file (CSV, JSON), a
  few real lines of it make a good sample. If its result lives in an external
  service — a spreadsheet, a database, a chat — ask the user for a screenshot
  of it; don't sign in to their accounts.
- **Backend or API**: start it. If it serves interactive docs (Swagger or
  Scalar at `/docs`, `/api-docs`, `/swagger`), capture that page with
  `capture.mjs` — it is the best picture a backend has. Then call one or two
  endpoints with `curl -s` and render the command and its real response with
  `terminal.mjs`.
- **Library**: a short, real usage example with its output.

When the architecture is the interesting part — a backend, a pipeline, a bot —
add a Mermaid diagram. Every box and arrow comes from the code: its modules,
queues, databases, external APIs and schedule, not what such systems usually
have. Only GitHub draws ` ```mermaid ` blocks; editor previews, the desktop
app's file pane and npm show them as raw code, and a user who opens the README
there sees a broken section. So skip the diagram for a simple app whose flow
the About section already tells — a frontend with a few pages, a single
script — and when you do add one, tell the user it renders on GitHub only.

### When running it needs credentials

Many scripts call a paid API (OpenAI, Gemini) or need a token. Don't go looking
for keys, and don't open `.env` files. Unless the user already told you how to
run it, ask, offering two ways:

- they run the command themselves and save the output
  (`<command> 2>&1 | tee output.txt`), and you render it; or
- they let you run it in their own checkout, where the program reads its own
  config — tell them it calls a paid API on their account.

If neither works and the author already committed a real capture (an image of
the output in the repo), keep it and say so. Otherwise leave the picture out.

### Can't run it at all

Say so, leave screenshots out and ask the user for them. Never draw a UI or type
out a terminal output yourself and present it as a capture.

### Look at every image before using it

Open each PNG with the Read tool and check two things:

- **Is it the screen you meant?** Not an error page, a blank page, a spinner,
  the framework's error overlay, or a redirect to `/login`. Compare the
  script's `finalUrl` with the path you asked for, and check the reported
  `size`: a README shows images at about 900 px wide, so anything much taller
  than wide turns into an unreadable strip.
- **Is anything on it private?** Read every piece of text on it, including
  text inside photos and banners. Seed, mock or fixture data that is plainly
  made up (`db.json`, `seed.ts`, fixtures) is fine. Anything on the list in
  "Nothing private goes public" is not, even when it comes from a file already
  committed — a phone number on a banner, a real customer in a seed file: show
  the user and let them decide. Data from outside the repo — a local database
  copied from production, a client's real records, a logged-in account,
  tokens, internal URLs — never goes in: recapture with the repo's seed data.
  Test data you type yourself is obviously fake ("Padaria Exemplo",
  `test@example.com`). Don't blur or edit images yourself — a half-hidden email
  is still a leak.

## 4. Write `README.md` (English)

Read `references/readme-template.md` for the section structure and what goes
in each section. The principles behind it:

- Every feature and every command traces back to the fact sheet. If you didn't
  see it in the code, it doesn't go in.
- Commands are copied from real scripts — preferably the ones you actually ran
  in step 3.
- Show what it does and put a screenshot near the top; that is where the reader
  decides whether to keep going.
- Plain, concrete language: no hype adjectives, no emoji in headings.
- When the code is written in Portuguese, its domain words still need real
  English: *academia* is a gym, *aluno* a student, *catraca* a turnstile,
  *laço* a loop. Identifiers stay as they are, in code font.
- Images use repo-relative paths (`docs/screenshots/home.png`) so GitHub
  renders them.
- Leave out sections that would be empty or padded. No License section without
  a `LICENSE` file.
- No value from the list in "Nothing private goes public", not even inside a
  code block or an example command: placeholders such as `<your-api-key>`.
- When the old README has things you can't derive — credits, acknowledgments,
  deployment notes, real badges — carry them over.

## 5. Write `README.pt-BR.md`

Adapt instead of translating word by word: write it the way a Brazilian
developer would. Keep in English the terms Brazilian developers say in English
(deploy, build, commit, pull request, endpoint, frontend, backend). Same
sections in the same order, same images, same commands — code and commands are
never translated. The Portuguese section names are in the template.

Both files open with the language switcher shown in the template, so each
reader can jump to the other version.

## 6. Check before handing back

Writing is where the two failures from the top creep in, so check both files
before reporting. In a test run of this skill, a README that "followed" every
rule above still shipped a License section for a LICENSE that didn't exist and
called a mock-data demo "full-featured" with "real-time analytics".

1. Run `node <skill-dir>/scripts/check-readme.mjs <repo>` and fix every
   problem it reports: links and images pointing at missing files, a license
   section without a LICENSE, a missing language switcher, a repeated heading,
   the two files drifting apart (different images or number of sections), and
   a README that tells readers to create a `.env` the repo doesn't ignore. Fix
   that last one by adding the file to `.gitignore` (create it if there is
   none) — otherwise the README's own instructions lead readers to commit
   their key.
   It also prints a warning for each promise word — *production, scalable,
   thousands, real-time, ideal, complete…* — with its line. For each one, name
   the code that backs it or rewrite the sentence — "not for production use" can
   stay, a promise the code doesn't show can't. Run it
   again until there are no problems and every remaining warning is one you can
   justify.
2. Then reread the English file line by line against the fact sheet, looking
   for what a script can't see:
   - Every feature: can you name the route or component that implements it,
     and is it built rather than a placeholder screen?
   - Claims about the outside world — "free tier available", "works with any
     LLM" — that the code can't confirm come out.
   - Is the data described as what it is? A list built in a loop is synthetic,
     a JSON file in the repo is seed data — neither is "real".
   - Does the About section say what the author's README said the project is
     (demo, prototype, course work)?
   - Is every sentence about this project? Notes and caveats are welcome when
     the code or the old README backs them; a remark you can't trace to either
     comes out.
   - Is the English file English throughout, apart from code identifiers?
3. Fix, then reread the Portuguese file for the same things.

## 7. Open the pull request

The user asked for the README to arrive as a pull request ready to approve, so
do this without asking first — it touches nothing but the new branch:

1. Stage only what the README work produced: `git add README.md
   README.pt-BR.md docs/screenshots/`, plus `.gitignore` if you changed it.
   Never `git add -A`: the working copy may hold the user's unrelated work, and
   a stray `.env` must never ride along. Confirm with `git status` that nothing
   else is staged.
2. Commit with a Conventional Commit message in English (`docs: bilingual
   README with screenshots`) and a body saying what was replaced and why.
3. `git push -u origin <branch>`, then `gh pr create --base <default>` with a
   summary — the files, the screenshots, what the old README got wrong,
   anything already exposed in the repo (by kind, never the value) — and a
   test plan with a box for the user to open the rendered README.
4. Images the check script listed as no longer used are not deleted in this
   PR. Ask; if the user agrees, remove them in a second commit on the same
   branch.

Merging is the user's call. Ask in the hand-back, and merge only on a clear
yes, with `gh pr merge <number> --squash --delete-branch` (or `--merge` if
the repository doesn't allow squash). Then say it is merged and link the
README on the default branch. Without a yes, the PR stays open.

## 8. Hand back

Report in the user's language:

- The PR link, and the question: may I merge it into `<default>`?
- Files in the PR — and say so explicitly if `README.md` was replaced or
  `.gitignore` was touched.
- Images the check script listed as no longer used by the README: offer to
  delete them, but don't do it yourself — they may be used elsewhere (the
  repo's social preview, other docs).
- The screenshots, one line each on what they show.
- What you verified by running it versus what you took from reading the code.
  Only claim what you did in this session: if you rendered output the user
  captured, or reused an image already in the repo, say exactly that.
- What is left for the user: a missing LICENSE, features you weren't sure
  about, screens you couldn't capture and why.
- What is already exposed in the repo, and anything you ran that reaches an
  outside service (a test that sends a real email, say), by file and kind —
  never the value itself.

Then offer the LinkedIn post; once the PR is merged, the post can link
straight to the README.

---

## LinkedIn post

A post is read in a feed by people who didn't ask for it — recruiters, other
developers, possible clients — and they give it two seconds. It holds the same
line as the README: nothing the code doesn't back.

1. **Facts.** Reuse the fact sheet if you wrote the README in this session.
   Otherwise build it as in step 2; an existing README is a source, not proof,
   so check its claims against the code like any other.
2. **Ask which language**, every time: Portuguese, English, or both. Both means
   two separate texts, each written natively — not one post in two languages,
   and not a translation of the other.
3. **Read the author's voice, then the rules.** The voice lives outside the
   skill, in `~/.claude/post-your-project/voice.md`, so nobody's posts ship with
   it. If that file doesn't exist, ask the user for two or three of their own
   posts and, with their OK, save them there as written. Then read
   `references/linkedin-post.md` for the writing rules. Where the voice and the
   rules differ, the voice wins; grounding never bends.
4. **Pick the images**: one to three from `docs/screenshots/`, hero first. If
   the project has none yet, capture them as in step 3.
5. **Write** each text to its own file in the scratchpad, and a first comment
   with the repo link (the text says where the link is).
6. **Build the preview**: write a `post.json` next to the texts (format at the
   top of the script; `author` is the user's name from `git config user.name`)
   and run `node <skill-dir>/scripts/post-preview.mjs post.json preview.html`.
   It prints review notes — stock phrases, markdown, promise words, length,
   hashtags, a link in the body, personal data. Fix each one, or keep it only
   when you can say why (a "complete history" that is literally the complete
   history), and rebuild. A secret in the text or the first comment stops the
   build: take it out, per "Nothing private goes public".
7. **Publish the preview** with the Artifact tool (it is private until the user
   shares it): `file_path` the preview, `icon` "post", and a one-sentence
   `description`. Publishing the same file again later updates the same page.
   Without the Artifact tool, rebuild with `--standalone` and open the file
   locally.
8. **Hand back** the preview link, which language(s), what the review flagged
   and what you did about it. Never post to LinkedIn, and don't offer to: the
   user copies the text and posts it themselves.
