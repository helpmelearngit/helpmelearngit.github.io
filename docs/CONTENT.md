# Writing lessons

Each module is one file in `src/lessons/modules/<id>.ts` exporting `const module: Module` (see `src/lessons/types.ts`).
Helpers for `setup` and `check` live in `src/lessons/helpers.ts`. Read `basics.ts` as the reference implementation.

## The running scenario

The learner co-owns **Sunrise Bakery** with **Maya** (teammate, handle `maya`). **Sam** (`sam`) reviews code.
The repo is `~/sunrise-bakery` with small text files: `README.md`, `menu.md`, `hours.txt`, `recipes/*.md`.
Keep files 2–6 lines so diffs and conflicts stay readable. Module 6 (forks) uses the open-source repo `octo-org/bread-lab`.
The learner's GitHub handle is `w.user.handle` (they picked it when creating a profile); use `you` in prose.

## Article style

Audience: a curious beginner or a developer who has copy-pasted git commands without understanding them.
Simple words, short paragraphs, concrete examples. 500–900 words. Explain *why* before *how*.

Structure every article like this:

1. **Hook** – the real-world problem this concept solves (1–2 short paragraphs, scenario from the bakery).
2. **Mental model** – one picture (a `figure` block) or table. Name the moving parts.
3. **The commands** – each with a realistic terminal example (`bash` fence, `$ ` prompts, real output).
4. **Why it matters** – a `**Why**` callout connecting to the next lesson or to daily work.
5. **Gotchas** – 2–3 common mistakes as a `**Warning**` callout or a short list.
6. **Up next** – one sentence bridging to the next lesson.

Markdown features the renderer understands:

- Headings `##` and `###` only (the page supplies the `#`).
- Callouts: a blockquote whose first line is `**Note**`, `**Tip**`, `**Why**`, `**Warning**` or `**Danger**` followed by text.
- Figures: a fenced block with language `figure`. Monospace ASCII art. A final line starting with `caption:` becomes the caption.
- Tables (GFM), inline code, bold, lists, `bash` fences.

Use `git switch` (not `checkout`) for branches, `git restore` for files, and mention the old command once.

## Tasks

3–7 per lesson, strictly sequential, each one atomic (one command or one edit). `text` is one imperative sentence in markdown.
`hint` gives the exact command. `check` must be a pure predicate that never throws (use helpers; they swallow errors).
Checks should accept any reasonable way of achieving the state, not one exact command (e.g. `git switch -c` or `git checkout -b`).
When a task involves editing a file, tell the learner to use the editor pane or `echo`, and check content loosely (`fileHas`).

## Setup

Use `seedRepo(w, 'sunrise-bakery', [...commits])` for history, `seedBranch` for side branches, `writeFiles` for uncommitted
work, `createHubRepo` / `hubCommit` / `forkRepo` / `openPR` / `createIssue` for the GitHub side. End setup with `w.cwd`
inside the repo unless the lesson is about `cd` or `clone`. Setup must be deterministic.

For scripted teammate actions after the learner does something, use `onTick(w, ctx)` with `ctx.once('key', () => ...)`.

## Takeaways

2–4 bullets, each one sentence, the thing to remember.

## Engine cheat sheet

Shell: `pwd ls [-a] cd mkdir [-p] touch cat echo (> and >>) head tail rm [-r] mv cp tree clear code <file>`. No variable expansion.

Git: `init clone status add rm mv commit log show diff branch switch checkout merge rebase reset restore revert cherry-pick stash tag remote fetch pull push reflog blame config clean ls-files rev-parse merge-base`.
Not supported: interactive rebase, bisect, submodules, worktrees, hooks.

Behaviors mirror modern git: `switch` refuses to clobber edits, `branch -d` refuses unmerged branches, `push` without upstream prints the
`--set-upstream` hint, non-fast-forward pushes are rejected, `pull` on divergent branches demands `--rebase`/`--no-rebase`/`pull.rebase`,
conflicts write `<<<<<<<` markers, adjacent-line edits conflict.

Remote URLs: `https://github.com/<owner>/<name>.git`. The learner's handle is `w.user.handle`; repos they own are `${w.user.handle}/<name>`.
Write `{you}` in `hubHome` and "you" in prose.

Run `npx vitest run src/lessons` after editing a module: it walks every lesson's `solution` and asserts all task checks pass in order.
