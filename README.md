# Post Your Project

**English** · [Português](README.pt-BR.md)

> A Claude Code plugin that gets a repository ready to show: a README in English and Brazilian Portuguese written from the actual code, screenshots of the project running, and a LinkedIn post draft.

![The README checker flagging repeated headings, an unignored .env and unsupported claims in a draft](docs/screenshots/check-readme.png)

## About

Ask Claude Code to "make this repo presentable" and this skill takes over. It reads the code before writing a word, runs the project to capture real screenshots, writes both READMEs, and then checks them with scripts, because the failures that matter in a public README are easy to miss on a reread: a feature that isn't there, a command that doesn't run, a key or a phone number that should never have been published.

It started as a personal tool for portfolio projects of a Brazilian developer, which is why the second language is Portuguese.

## Features

- **README from the code** — features, stack and commands come from manifests, routes and scripts; anything it can't trace to a file stays out.
- **Two languages** — `README.md` in English and `README.pt-BR.md` written natively in Portuguese, with a language switcher.
- **Real screenshots** — web apps are captured in headless Chrome while they run; CLIs, scripts and backends get the output of a real run drawn as a terminal window; mobile apps are captured from the simulator.
- **Automated checks** — broken links and images, a License section without a LICENSE, files a command expects that aren't in the repo, a `.env` the README asks for that `.gitignore` doesn't cover, and promise words such as "production-ready" or "scalable", each with its line.
- **Leak checks** — secrets in the text stop the build; personal data and files already exposed in the repo are reported by kind, never by value.
- **Pull request ready to approve** — the README work goes on its own branch, with only the README files, and the skill opens the PR and asks before merging it.
- **LinkedIn post draft** — asks which language each time, writes in your own voice from posts you provide, and opens a private preview with the "see more" fold, the character count and a copy button.

## Screenshots

| Terminal output as an image | LinkedIn post preview |
| --- | --- |
| ![A real run of a Python script rendered as a terminal window](docs/screenshots/terminal-example.png) | ![Preview page for an example post draft, with character count and review notes](docs/screenshots/post-preview.png) |

## Getting started

### Prerequisites

- [Claude Code](https://code.claude.com)
- Node.js (tested with Node 24)
- Google Chrome — or Playwright's Chromium, via `npx playwright install chromium`
- git, and the GitHub CLI (`gh`) when you point it at a GitHub URL
- For mobile screenshots, an iOS simulator (Xcode) or Android emulator

Developed and tested on macOS.

### Installation

In Claude Code:

```
/plugin marketplace add giovaniocan/post-your-project
/plugin install post-your-project@giovaniocan
```

The skill installs its one dependency (`playwright-core`) inside its own folder the first time it takes a screenshot.

### Usage

Open Claude Code in a project, or anywhere with a GitHub URL, and ask in your own words:

- "gera um README em inglês e português com prints do sistema"
- "deixa esse repo bonito pro portfólio"
- "escreve um post pro LinkedIn sobre esse projeto"
- "write a README for github.com/user/repo"

For the LinkedIn post, the skill asks for two or three of your own posts the first time and keeps them in `~/.claude/post-your-project/voice.md`, outside the plugin, so your posts are never shared with it.

## What it won't do

- Invent features, commands or screenshots. When it can't run something, it says so and asks you for the capture.
- Put secrets, IDs, personal or client data in the README, the images or the post.
- Merge the pull request or delete files without asking. Committing the README to a new branch and opening the PR is the one thing it does on its own.
- Post to LinkedIn. You copy the text from the preview and post it yourself.

## Project structure

```
.claude-plugin/          plugin and marketplace manifests
skills/post-your-project/
  SKILL.md               the instructions Claude follows
  references/            README template and LinkedIn writing guide
  scripts/
    capture.mjs          screenshots of a running web app
    terminal.mjs         a real command's output drawn as a terminal window
    check-readme.mjs     checks both READMEs before hand-back
    post-preview.mjs     LinkedIn preview page and text review
    leaks.mjs            secret and personal-data patterns
    wording.mjs          promise words and stock phrases
    browser.mjs          shared headless Chrome launcher
```

## License

Distributed under the MIT License. See [LICENSE](LICENSE).
