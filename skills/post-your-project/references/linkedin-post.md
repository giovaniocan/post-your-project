# LinkedIn post guide

## Author's voice

The author's own posts live in `~/.claude/post-your-project/voice.md`, outside
the skill, so they never ship with it. From them take the rhythm, the length,
how they open and close, their emoji and line-break habits — never the content.
If the author has no posts to share, write plain, first-person and concrete,
with no emoji or one at most.

## What the post is for

One post per project. Most readers see only the part before "see more"; the
post's job is to make them stop there, understand what was built and why it is
interesting, and click through if they want more.

## Grounding — never bends

- "Nothing private goes public" in SKILL.md covers the post exactly as it
  covers the README: no secrets or IDs, no personal or client data, nothing
  read from `.env` files or outside the repo. A feed reaches more strangers
  than a README, and a post can't be pulled back from people who saw it.
- Every fact, number and claim comes from the fact sheet or the README, and
  numbers appear exactly as the captured run printed them.
- If the README says demo, study project, exercise or course work, the post
  says so. It is an honest framing and a common one; readers respect it.
- No promise the README doesn't make. The preview script flags the usual words.
- Never tag people or companies, or mention a collaboration, unless the user
  asked for it.

## Shape

- **Opening** — the part before "see more", about 200 characters or three
  lines: the most concrete interesting thing about the project. A number, a
  before and after, the problem in one sentence. For most readers this is the
  whole post.
- **What it is and why it exists** — two or three short lines.
- **What it does or how** — three to five short lines. "→" or "•" work as
  bullets; markdown doesn't.
- **One thing learned or one decision worth explaining**, specific to this
  project. This is what makes a developer reader stay.
- **Close** — where to find it ("link no primeiro comentário" / "link in the
  first comment"), and a question only if the author would really ask it.
- **Hashtags** — three to five at the end, naming the stack and the topic
  specifically rather than generic ones about technology or innovation.
- Length: usually 700 to 1,300 characters; never over 3,000.

## Form

- Plain text, blank line between paragraphs. LinkedIn shows `**asterisks**`
  and `#` headings as they are.
- No Unicode "bold" letters: screen readers and search can't read them. If
  the author's voice asks for a bold title anyway, keep it to the title, write
  it in plain text and set `boldTitle` — the preview script converts it.
- Emoji only as the author's samples use them.
- The repo link goes in the first comment, and the post says it is there.

## Two languages

When the user asks for both, write each one natively: same facts, numbers and
images, but each with the rhythm and idioms of its own language. A post that
reads translated loses the reader in the first line.

## Avoid

Stock openers and closers (the preview script knows the common ones in both
languages), engagement bait, self-congratulation without substance, and a
question glued onto the end for reach.
