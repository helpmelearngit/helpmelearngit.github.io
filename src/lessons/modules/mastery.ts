import type { Module } from '../types'
import type { World } from '../../engine/world'
import { resolve } from '../../engine/repo'
import { seedRepo, seedBranch, writeFiles, repo, ran, fileHas, fileExists, untracked, clean, committedFile, inIndex, isDetached, branch, branchExists, hasCommit, head, commitCount, type SeedCommit } from '../helpers'

const REPO = 'sunrise-bakery'
const MAYA = 'Maya Chen <maya@example.com>'
const README_TYPO = '# Sunrise Bakery\n\nFresh bread, every mornng since 2019.\n'
const README = README_TYPO.replace('mornng', 'morning')
const menu = (items: string[]) => '# Menu\n\n' + items.map((i) => `- ${i}`).join('\n') + '\n'
const M1 = ['Sourdough loaf — $7', 'Croissant — $3.50', 'Baguette — $4']
const M2 = [...M1, 'Cinnamon roll — $4']
const M3 = [...M2, 'Almond croissant — $4.50']
const M4 = M3.map((i) => i.replace('$3.50', '$4.25'))
const M5 = [...M4, 'Rye loaf — $6.50']
const M6 = M5.map((i) => i.replace('Baguette — $4', 'Baguette — $3.75'))

/** The bakery after the collaboration track: 12 commits by you and Maya, tag v1.0 in the middle. */
const BASELINE: SeedCommit[] = [
  { msg: 'Add project README', files: { 'README.md': README_TYPO } },
  { msg: 'Add menu and opening hours', files: { 'menu.md': menu(M1), 'hours.txt': 'Mon-Fri 7am-3pm\nSat 8am-1pm\n' } },
  { msg: 'Add cinnamon roll to menu', files: { 'menu.md': menu(M2) }, author: MAYA },
  { msg: 'Add sourdough recipe', files: { 'recipes/sourdough.md': '# Sourdough\n\n24 hour cold ferment.\nBake at 240C for 40 minutes.\n' } },
  { msg: 'Extend Saturday hours to 2pm', files: { 'hours.txt': 'Mon-Fri 7am-3pm\nSat 8am-2pm\n' }, author: MAYA },
  { msg: 'Add almond croissant to menu', files: { 'menu.md': menu(M3) } },
  { msg: 'Add ciabatta recipe', files: { 'recipes/ciabatta.md': '# Ciabatta\n\nHigh hydration, 80% water.\nBake at 230C for 25 minutes.\n' }, author: MAYA },
  { msg: 'Raise croissant price to cover butter cost', files: { 'menu.md': menu(M4) } },
  { msg: 'Add Sunday closure to hours', files: { 'hours.txt': 'Mon-Fri 7am-3pm\nSat 8am-2pm\nSun closed\n' } },
  { msg: 'Fix typo in README', files: { 'README.md': README }, author: MAYA },
  { msg: 'Add rye loaf to menu', files: { 'menu.md': menu(M5) }, author: MAYA },
  { msg: 'Lower baguette price for lunch deal', files: { 'menu.md': menu(M6) }, author: MAYA },
]
const V1_INDEX = 5
const PRICE_DEPTH = BASELINE.length - 1 - BASELINE.findIndex((c) => /croissant price/.test(c.msg))

function seed(w: World, extra: SeedCommit[] = []) {
  const all = [...BASELINE, ...extra]
  // ponytail: seedRepo shares one mutable tree object across the commits of a single call, so every snapshot in
  // that call ends up identical (blame/show/v1.0:menu.md all collapse). One call per commit keeps each tree distinct.
  for (const c of all) seedRepo(w, REPO, [c])
  const r = repo(w, REPO)!
  r.refs['refs/tags/v1.0'] = resolve(w, r, `HEAD~${all.length - 1 - V1_INDEX}`)
}
const tagHash = (w: World) => repo(w, REPO)?.refs['refs/tags/v1.0'] ?? null
const statusRuns = (w: World) => w.history.filter((c) => /^git\s+status/.test(c)).length
/** Solution step that stands in for saving a file in the editor pane. */
const edit = (path: string, content: string) => (w: World) => writeFiles(w, REPO, { [path]: content })
/** Did the learner `git show` a commit whose message matches `re`? */
const showed = (w: World, re: RegExp) => w.history.some((c) => {
  const m = c.match(/^git\s+show\s+(?:-\S+\s+)*([^\s:]+)\s*(?:--.*)?$/)
  if (!m) return false
  try { const r = repo(w, REPO)!; return re.test(w.commit(resolve(w, r, m[1])).message) } catch { return false }
})
const cfg = (w: World, key: string) => w.config[key] ?? repo(w, REPO)?.config[key]

const gitignore = `
Maya ran the new website build script this morning. It worked, and now \`git status\` lists \`build/site.html\`, a fresh \`debug.log\` and a \`.DS_Store\` file that macOS drops into every folder it looks at. None of these belong in history: the build is generated from files already committed, the log changes on every run, and \`.DS_Store\` is desktop clutter. Yet every \`git status\` from now on will nag about them, and sooner or later someone types \`git add .\` and commits the lot.

Worse, someone already did. A few commits back, \`debug.log\` went in under the message *Add debug log (oops)*. This lesson cleans up both problems.

## Three kinds of files

Git sorts every file in your working tree into one of three groups:

| Kind | Git's attitude | Shows in \`git status\`? |
|---|---|---|
| **Tracked** | In the last commit or the staging area. Git watches it. | Only when it changed |
| **Untracked** | On disk, never added. Git keeps pointing at it. | Every time |
| **Ignored** | Untracked *and* matched by \`.gitignore\`. Git pretends it is not there. | Never |

\`.gitignore\` is a plain text file at the root of the repository, one pattern per line. It moves files from the middle row to the bottom row. It has no say over the top row, and that is the gotcha this lesson is built around.

\`\`\`figure
 .gitignore               working tree
 ┌─────────────┐          build/site.html ── build/ ────▶ ignored
 │ *.log       │          .DS_Store       ── .DS_Store ─▶ ignored
 │ build/      │          NOTES.md        ── (no match) ▶ untracked
 │ .DS_Store   │          debug.log       ── *.log ─────▶ still TRACKED
 └─────────────┘                             (it is in the last commit)
caption: Patterns silence untracked files. A file Git already tracks stays tracked until you tell Git to forget it.
\`\`\`

## Writing the patterns

Open \`.gitignore\` in the editor pane (\`code .gitignore\`) and type three lines:

\`\`\`
*.log
build/
.DS_Store
\`\`\`

The pattern language is small:

- \`*.log\` matches any file ending in \`.log\`, in any folder.
- \`build/\` with the trailing slash means "a folder called build, and everything inside it".
- \`.DS_Store\` is an exact name, matched in every folder.
- \`notes/*.txt\` contains a slash, so it is anchored to the repository root.
- \`!keep.log\` with a leading \`!\` un-ignores something an earlier line matched.
- Lines starting with \`#\` are comments.

Save, run \`git status\`, and most of the noise is gone:

\`\`\`bash
$ git status
On branch main

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   debug.log

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	.gitignore

no changes added to commit (use "git add" and/or "git commit -a")
\`\`\`

\`build/\` and \`.DS_Store\` vanished. \`.gitignore\` itself appears as untracked, which is right: it belongs in the repository so Maya gets the same rules when she pulls. But \`debug.log\` is still there, flagged as modified. \`*.log\` did nothing for it.

## Un-tracking a file without deleting it

A file is tracked because it sits in the staging area and the last commit, not because of anything in \`.gitignore\`. To stop tracking it, remove it from the staging area and keep the copy on disk:

\`\`\`bash
$ git rm --cached debug.log
rm 'debug.log'
$ git status
On branch main

Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
	deleted:    debug.log

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	.gitignore
\`\`\`

\`--cached\` is the important half. Plain \`git rm debug.log\` deletes the file from disk as well. With \`--cached\`, the file stays where it is and Git records "deleted" for the next commit. Because the file is now untracked and matches \`*.log\`, \`git status\` no longer lists it. Commit the rule and the removal together:

\`\`\`bash
$ git add .gitignore
$ git commit -m "Ignore logs, build output and OS files"
[main 01eeb7f] Ignore logs, build output and OS files
 2 files changed, 3 insertions(+), 2 deletions(-)
 delete mode 100644 debug.log
 create mode 100644 .gitignore
$ git status
On branch main

nothing to commit, working tree clean
$ ls
build/  debug.log  hours.txt  menu.md  README.md  recipes/
\`\`\`

The log file is still on disk and Git will never mention it again.

> **Why**
> A clean \`git status\` is a tool. When it shows only the files you meant to change, you read it in one glance before every commit. When it is cluttered with build output and logs, you stop reading it, and that is the day an API key in \`.env\` slips into a public repository.

## Gotchas

- \`.gitignore\` does not touch tracked files. If a pattern "does not work", the file is probably already committed: \`git rm --cached\` it.
- Commit \`.gitignore\`. It is part of the project, not a personal setting.
- Trying to \`git add\` an ignored file prints *The following paths are ignored by one of your .gitignore files*. That is the rule working. \`git add -f\` overrides it if you truly mean it.
- The removal is only the newest commit. Earlier commits still contain \`debug.log\`; if it held a secret, rotate the secret.

## Up next

With the noise gone, history is readable again. Next you use it to answer a question nobody remembers the answer to.
`

const archaeology = `
Maya reads the menu over your shoulder. "Why is the croissant $4.25? It was $3.50 at launch." You do not remember. That is fine: the repository remembers, and this lesson is about asking it the right way.

## Six questions, six commands

Every "why is this like this?" breaks into smaller questions, and Git has a command for each:

| Question | Command |
|---|---|
| Who last touched each line of this file? | \`git blame menu.md\` |
| What else did that commit change, and what did the message say? | \`git show <commit>\` |
| When did this text appear or disappear? | \`git log -S "4.25"\` |
| Which commits talk about a topic? | \`git log --grep=price\` |
| What is the history of one file? | \`git log --oneline -- hours.txt\` |
| What did a file look like at a release? | \`git show v1.0:menu.md\` |

They chain: blame gives you a hash, show explains the hash, log confirms the story.

## Start at the line: git blame

\`\`\`bash
$ git blame menu.md
1b6145f (You          2026-10-05 09:06:25  1) # Menu
1b6145f (You          2026-10-05 09:06:25  2)
1b6145f (You          2026-10-05 09:06:25  3) - Sourdough loaf — $7
0f54992 (You          2026-10-05 09:36:01  4) - Croissant — $4.25
14deb6c (Maya Chen    2026-10-05 09:56:28  5) - Baguette — $3.75
0cdf80d (Maya Chen    2026-10-05 09:10:20  6) - Cinnamon roll — $4
0e9b133 (You          2026-10-05 09:25:44  7) - Almond croissant — $4.50
14b9342 (Maya Chen    2026-10-05 09:50:17  8) - Rye loaf — $6.50
\`\`\`

Every line of the file is prefixed with the commit that last changed it, who made it, and when. The croissant line points at a commit by you. Blame does not say *why*; it says *where to look*.

## Read the commit: git show

\`\`\`bash
$ git show 0f54992
commit 0f549920fe55d0139dc97f3f573719469a8b240a
Author: You <you@example.com>
Date:   Mon Oct 5 09:36:01 2026 +0000

    Raise croissant price to cover butter cost

diff --git a/menu.md b/menu.md
--- a/menu.md
+++ b/menu.md
@@ -1,7 +1,7 @@
 # Menu

 - Sourdough loaf — $7
-- Croissant — $3.50
+- Croissant — $4.25
 - Baguette — $4
 - Cinnamon roll — $4
 - Almond croissant — $4.50
\`\`\`

There is the answer, written by past-you who knew that one day someone would ask. This is the payoff for every good commit message in Module 1.

\`git show\` takes any revision: a short hash, \`HEAD~${PRICE_DEPTH}\`, a tag. Put a colon and a path after it and it prints that one file as it was at that commit, without touching your working tree:

\`\`\`bash
$ git show v1.0:menu.md
# Menu

- Sourdough loaf — $7
- Croissant — $3.50
- Baguette — $4
- Cinnamon roll — $4
- Almond croissant — $4.50
\`\`\`

Maya was right about the launch price.

## Search history: -S and --grep

Sometimes you have no line to blame, only a piece of text. \`git log -S\` (the "pickaxe") lists commits where the number of times a string appears changed, which is exactly "when did 4.25 arrive?":

\`\`\`bash
$ git log --oneline -S "4.25"
0f54992 Raise croissant price to cover butter cost
\`\`\`

\`--grep\` searches commit messages instead of file contents:

\`\`\`bash
$ git log --oneline --grep=price
14deb6c (HEAD -> main) Lower baguette price for lunch deal
0f54992 Raise croissant price to cover butter cost
\`\`\`

Other filters stack the same way: \`--author=maya\`, \`-n 3\`, \`--stat\` to see which files each commit touched, \`-p\` for full diffs.

## One file's history

\`\`\`bash
$ git log --oneline -- hours.txt
0a7b39d Add Sunday closure to hours
02ac403 Extend Saturday hours to 2pm
1b6145f Add menu and opening hours
\`\`\`

The \`--\` tells Git that what follows is a path, not a branch or tag name. Without it, Git tries to read \`hours.txt\` as a revision and complains. Get in the habit of typing it.

> **Why**
> Archaeology is the reason you were asked to write *Raise croissant price to cover butter cost* instead of *Update menu*. Every clear message you commit is an answer you will not have to reconstruct six months from now. And when a bug appears, \`blame\` and \`-S\` take you from "something broke" to "this commit broke it" in minutes.

## Gotchas

- Blame shows the *last* touch, not the origin. A commit that re-indents a file takes the blame for every line. Real Git has \`git blame -w\` to ignore whitespace changes.
- \`-S\` matches literal text and counts occurrences. A commit that only *moves* a line does not show up.
- \`git log hours.txt\` without \`--\` works in real Git only when no branch has that name. Use \`--\` and never think about it again.

## Up next

You can read history fluently. Next, a few minutes of setup that make every day with Git smoother.
`

const config = `
Every commit you have made in this course carries a name and an email. On a real machine, Git does not guess them. The first time you commit it stops and asks, or worse, it fills in your computer's login name and you end up with commits by \`sid@MacBook-Pro.local\` on a public project forever. Five minutes with \`git config\` fixes that, and a few more lines make Git feel like a tool shaped to your hands.

## Three layers of settings

\`\`\`figure
 system   /etc/gitconfig    every user on this machine     (rare; needs admin)
 global   ~/.gitconfig      you, in every repository       ← name, email, aliases
 local    .git/config       this repository only           ← remotes, upstreams
                                                              overrides global
caption: Git reads all three and the most specific layer wins. Almost everything you set by hand goes in global.
\`\`\`

\`git config --global\` writes to \`~/.gitconfig\` in your home folder. \`git config --local\` (the default when you are inside a repository) writes to \`.git/config\`. Open \`~/.gitconfig\` in any text editor and you will see it is just sections and key = value lines; you can edit it directly.

## Who you are

\`\`\`bash
$ git config --global user.name "Sunrise Baker"
$ git config --global user.email baker@sunrise.example
$ git config user.name
Sunrise Baker
\`\`\`

Give a key and a value to set; give only the key to read it back. Quote values containing spaces. The email is what GitHub uses to link commits to your profile, so use the address on your account.

Use \`--local\` for the rare project where you need a different identity, such as a work email on your employer's repositories while the global one stays personal.

## Aliases

An alias is a short name for a longer command. The one most Git users carry everywhere is a compact graph of all branches:

\`\`\`bash
$ git config --global alias.lg "log --oneline --graph --all"
$ git lg
* 1e02304 (maya/focaccia) Add focaccia recipe
* 14deb6c (HEAD -> main) Lower baguette price for lunch deal
* 14b9342 Add rye loaf to menu
* 0e583ad Fix typo in README
...
\`\`\`

Git sees \`lg\`, looks up \`alias.lg\`, and runs the real command with any extra arguments you added. Other popular ones: \`alias.st status\`, \`alias.co checkout\`, \`alias.unstage "restore --staged"\`. Keep aliases for commands you type daily, not for commands you are still learning; the alias hides the real name and you will not recognise it in documentation.

## Behaviour settings

Remember \`git pull\` refusing to continue in the remotes module until you chose \`--rebase\` or \`--no-rebase\`? That was Git asking you to pick a default:

\`\`\`bash
$ git config --global pull.rebase true
\`\`\`

From now on \`git pull\` rebases your local commits on top of what arrived, which keeps history linear on small teams. Other settings people reach for early: \`init.defaultBranch main\`, \`core.editor\` to pick the editor for commit messages, and \`push.autoSetupRemote true\` so the first \`git push\` of a new branch needs no \`--set-upstream\`.

## See everything

\`\`\`bash
$ git config --list
user.name=Sunrise Baker
user.email=baker@sunrise.example
alias.lg=log --oneline --graph --all
pull.rebase=true
\`\`\`

The list merges all three layers. In real Git, \`git config --list --show-origin\` adds the file each line came from, which is the fastest way to find a setting you do not remember making.

> **Why**
> Configuration is where a tool stops being generic. Your name on every commit, one keystroke for the graph you look at twenty times a day, and \`git pull\` doing what you expect without a question. None of it is required, and all of it is why experienced people seem to move faster than you.

## Gotchas

- Forgot the quotes: \`git config --global user.name Sunrise Baker\` sets the name to \`Sunrise\` and treats \`Baker\` as an error in real Git. Quote values with spaces.
- An alias cannot wrap another \`git\` word: write \`alias.lg "log --oneline"\`, not \`"git log --oneline"\`.
- \`--local\` only works inside a repository. Outside one, Git has no \`.git/config\` to write to and tells you so.
- Settings do not travel with the repository. Maya has her own \`~/.gitconfig\`; your aliases are yours alone.

## Up next

Last lesson: the one Git message that frightens everyone, and why it should not.
`

const detached = `
Maya wants the README exactly as it was at the \`v1.0\` release, for the archive, but with the typo fixed. Simple: go to the tag, fix, commit. Then Git prints a wall of text about a **detached HEAD** and most people's stomach drops. Nothing is wrong; you just have to know where you are standing.

## What HEAD normally points at

\`\`\`figure
 normal:      HEAD ──▶ main ──▶ 14deb6c ──▶ 14b9342 ──▶ ...
              commit here: main moves forward, HEAD follows

 detached:    HEAD ──────────▶ 0e9b133 (v1.0) ──▶ ...
              commit here: HEAD moves, no branch does
caption: Detached means HEAD points at a commit directly instead of at a branch name.
\`\`\`

Normally \`HEAD\` points at a branch, and the branch points at a commit. Commit, and the branch advances; \`HEAD\` rides along. Check out something that is not a branch, such as a tag or a hash, and \`HEAD\` points straight at that commit. You can look around and even commit, but no branch is recording where you go.

## Visiting a tag

\`\`\`bash
$ git checkout v1.0
Note: switching to 'v1.0'.

You are in 'detached HEAD' state. You can look around, make experimental
changes and commit them, and you can discard any commits you make in this
state without impacting any branches by switching back to a branch.

If you want to create a new branch to retain commits you create, you may
do so (now or later) by using -c with the switch command. Example:

  git switch -c <new-branch-name>

HEAD is now at 0e9b133 Add almond croissant to menu
$ git status
HEAD detached at 0e9b133

nothing to commit, working tree clean
\`\`\`

Read the note slowly; it tells you everything. \`git switch --detach v1.0\` does the same with the newer command. Your files are now exactly as they were at the release. Fix the typo in \`README.md\` and commit:

\`\`\`bash
$ git commit -am "Fix typo in v1.0 README"
[detached HEAD 0a8e1e7] Fix typo in v1.0 README
 1 file changed, 1 insertion(+), 1 deletion(-)
\`\`\`

The prefix says \`detached HEAD\` instead of \`main\`. The commit exists, HEAD points at it, and nothing else does.

## Leaving, and losing it

\`\`\`bash
$ git switch main
Switched to branch 'main'
\`\`\`

Real Git adds a warning here: *you are leaving 1 commit behind, not connected to any of your branches*, with the hash and a \`git branch <name> 0a8e1e7\` suggestion. This simulator stays quiet so you can feel the problem: \`git log\` on \`main\` does not show your fix, the graph pane does not show it, no branch or tag points at it. It is **unreferenced**.

## Finding it again

Nothing committed is lost immediately. The **reflog** records every place HEAD has pointed, newest first:

\`\`\`bash
$ git reflog
14deb6c (HEAD -> main) HEAD@{0}: checkout: moving from 14deb6c to main
0a8e1e7 HEAD@{1}: commit: Fix typo in v1.0 README
0e9b133 (tag: v1.0) HEAD@{2}: checkout: moving from main to v1.0
14deb6c (HEAD -> main) HEAD@{3}: commit: Lower baguette price for lunch deal
\`\`\`

\`HEAD@{1}\` means "where HEAD was one move ago", and that is the commit. Give it a branch and it is safe:

\`\`\`bash
$ git switch -c v1-hotfix HEAD@{1}
Switched to a new branch 'v1-hotfix'
$ git switch main
Switched to branch 'main'
$ git log --oneline --all
0a8e1e7 (v1-hotfix) Fix typo in v1.0 README
14deb6c (HEAD -> main) Lower baguette price for lunch deal
...
0e9b133 (tag: v1.0) Add almond croissant to menu
\`\`\`

\`git branch v1-hotfix 0a8e1e7\` does the same without switching to it. The hotfix now lives on its own branch, Maya can print it, and later you can merge or cherry-pick it wherever it belongs.

> **Why**
> Detached HEAD is not a trap; it is how you visit any point in history, which you will do constantly: reproducing a bug at a release, checking what a file looked like last month, testing a teammate's commit. The only rule is that if you commit there, give it a branch before you leave. If you forget, the reflog has your back.

## Gotchas

- The reflog is local to your machine. It is not pushed and nobody else has yours.
- Unreferenced commits are cleaned up eventually; real Git keeps them about 90 days.
- \`git switch -\` returns to the previous branch, handy after a quick look at a tag.

## What you have learned

You can turn a folder into a repository and make clean commits (Module 1). You can branch, merge and resolve conflicts (Module 2). You can rewrite your own history with rebase, undo mistakes with reset and revert, and recover with reflog (Module 3). You can push, pull and fetch (Module 4), review and merge pull requests (Module 5), contribute to a project you do not own through a fork (Module 6), and now keep a repository tidy, read its history, configure Git and rescue a lost commit. That is the working knowledge of a professional developer.

## Where to go next

- Install Git on your own machine and run \`git init\` in a real folder. Everything here transfers exactly.
- \`git help <command>\` opens the full manual for any command, offline.
- The free *Pro Git* book at git-scm.com/book covers what this course skipped: interactive rebase, bisect, hooks, submodules.
- When in doubt: \`git status\` tells you where you are, \`git reflog\` tells you where you were.
`

export const module: Module = {
  id: 'mastery',
  title: 'Everyday mastery',
  blurb: 'The habits and tools that make daily Git pleasant: ignoring noise, reading history, configuring Git and rescuing lost commits.',
  lessons: [
    {
      id: 'mastery-gitignore',
      title: 'Ignoring files',
      tagline: '.gitignore for build output and logs, and un-tracking a file that slipped into history.',
      minutes: 9,
      article: gitignore,
      setup: (w) => {
        seed(w, [{ msg: 'Add debug log (oops)', files: { 'debug.log': '09:00 build started\n09:01 build finished\n' } }])
        writeFiles(w, REPO, { 'build/site.html': '<h1>Sunrise Bakery</h1>\n', 'debug.log': '09:00 build started\n09:01 build finished\n10:12 build started\n10:13 build finished\n', '.DS_Store': 'Bud1\n' })
      },
      tasks: [
        { text: 'Run `git status` and see the noise Maya\'s build left behind.', hint: '`git status`', check: (w) => ran(w, /^git\s+status/) },
        { text: 'Create `.gitignore` in the editor pane (`code .gitignore`) with three lines: `*.log`, `build/` and `.DS_Store`.', hint: '`code .gitignore`, type the three patterns on separate lines, save', check: (w) => fileHas(w, `${REPO}/.gitignore`, /^\*\.log\s*$/m) && fileHas(w, `${REPO}/.gitignore`, /^build\/?\s*$/m) && fileHas(w, `${REPO}/.gitignore`, /^\.DS_Store\s*$/m) },
        { text: 'Run `git status` again: `build/` and `.DS_Store` are gone, but `debug.log` is still listed. Why?', hint: '`git status` (debug.log is tracked, so `.gitignore` cannot hide it)', check: (w) => statusRuns(w) >= 2 && fileHas(w, `${REPO}/.gitignore`, /\*\.log/) && !untracked(w, REPO).includes('build/site.html') && !untracked(w, REPO).includes('.DS_Store') },
        { text: 'Stop tracking `debug.log` without deleting it from disk.', hint: '`git rm --cached debug.log`', check: (w) => !inIndex(w, 'debug.log', REPO) && fileExists(w, `${REPO}/debug.log`) },
        { text: 'Commit `.gitignore` together with the removal as `Ignore logs, build output and OS files`.', hint: '`git add .gitignore` then `git commit -m "Ignore logs, build output and OS files"`', check: (w) => committedFile(w, '.gitignore', 'HEAD', REPO) !== null && committedFile(w, 'debug.log', 'HEAD', REPO) === null && fileExists(w, `${REPO}/debug.log`) },
        { text: 'Confirm with `git status` that the working tree is clean and nothing untracked remains.', hint: '`git status`', check: (w) => statusRuns(w) >= 3 && clean(w, REPO) && untracked(w, REPO).length === 0 && committedFile(w, 'debug.log', 'HEAD', REPO) === null },
      ],
      takeaways: ['`.gitignore` hides untracked files; it never affects files already committed.', '`git rm --cached <file>` stops tracking a file but leaves it on disk.', 'Commit `.gitignore` so the whole team shares the same rules.'],
      solution: ['git status', edit('.gitignore', '*.log\nbuild/\n.DS_Store\n'), 'git status', 'git rm --cached debug.log', 'git add .gitignore', 'git commit -m "Ignore logs, build output and OS files"', 'git status'],
    },
    {
      id: 'mastery-archaeology',
      title: 'Who changed this, and why?',
      tagline: 'blame, show, log -S and --grep: turning "why is it like this?" into a commit with a message.',
      minutes: 10,
      article: archaeology,
      setup: (w) => seed(w),
      tasks: [
        { text: 'Maya asks why the croissant costs $4.25. Find which commit last touched that line with `git blame menu.md`.', hint: '`git blame menu.md`', check: (w) => ran(w, /^git\s+blame\b.*menu\.md/) },
        { text: 'Show that commit with `git show`, using the hash from blame or a `HEAD~N` reference.', hint: `\`git show HEAD~${PRICE_DEPTH}\` (or paste the hash from the croissant line)`, check: (w) => showed(w, /croissant price/i) },
        { text: 'Confirm it another way: search history for the text with `git log -S "4.25"` or for the topic with `git log --grep=price`.', hint: '`git log --oneline -S "4.25"`', check: (w) => ran(w, /^git\s+log\b.*\s(-S|--grep)/) },
        { text: 'List only the commits that touched `hours.txt`.', hint: '`git log --oneline -- hours.txt`', check: (w) => ran(w, /^git\s+log\b.*\s--\s+hours\.txt/) },
        { text: 'Print the menu as it was at the `v1.0` release with `git show v1.0:menu.md`.', hint: '`git show v1.0:menu.md`', check: (w) => ran(w, /^git\s+show\s+\S+:menu\.md/) },
        { text: 'Write the answer for Maya into `NOTES.md` (mention *butter*) and commit it.', hint: '`echo "Croissant is $4.25 to cover butter cost" > NOTES.md`, `git add NOTES.md`, `git commit -m "Note why the croissant price changed"`', check: (w) => /butter/i.test(committedFile(w, 'NOTES.md', 'HEAD', REPO) ?? '') },
      ],
      takeaways: ['`git blame <file>` names the commit behind every line; `git show <commit>` explains it.', '`git log -S "text"` finds when text appeared; `--grep` searches messages; `-- <path>` filters by file.', '`git show <ref>:<path>` prints a file at any point in history without touching your working tree.'],
      solution: ['git blame menu.md', `git show HEAD~${PRICE_DEPTH}`, 'git log --oneline -S "4.25"', 'git log --oneline -- hours.txt', 'git show v1.0:menu.md', 'echo "Croissant is $4.25 to cover butter cost (see git log -S 4.25)" > NOTES.md', 'git add NOTES.md', 'git commit -m "Note why the croissant price changed"'],
    },
    {
      id: 'mastery-config',
      title: 'Config and aliases',
      tagline: 'user.name, user.email, a graph alias and pull.rebase: five minutes that pay off every day.',
      minutes: 8,
      article: config,
      setup: (w) => {
        seed(w)
        seedBranch(w, REPO, 'maya/focaccia', 'main', [{ msg: 'Add focaccia recipe', files: { 'recipes/focaccia.md': '# Focaccia\n\nOlive oil, rosemary, flaky salt.\n' }, author: MAYA }])
      },
      tasks: [
        { text: 'Set the name Git signs your commits with: `git config --global user.name "<your name>"`.', hint: '`git config --global user.name "Sunrise Baker"`', check: (w) => ran(w, /^git\s+config\s+(--\w+\s+)*user\.name\s+\S/) && w.user.name.trim().length > 0 },
        { text: 'Set your email the same way.', hint: '`git config --global user.email baker@sunrise.example`', check: (w) => ran(w, /^git\s+config\s+(--\w+\s+)*user\.email\s+\S+@\S+/) && w.user.email.includes('@') },
        { text: 'Create an alias `lg` for `log --oneline --graph --all`.', hint: '`git config --global alias.lg "log --oneline --graph --all"`', check: (w) => (cfg(w, 'alias.lg') ?? '').includes('log') },
        { text: 'Try it: `git lg`.', hint: '`git lg`', check: (w) => ran(w, /^git\s+lg\b/) && (cfg(w, 'alias.lg') ?? '').includes('log') },
        { text: 'Make `git pull` rebase by default with `pull.rebase true`.', hint: '`git config --global pull.rebase true`', check: (w) => cfg(w, 'pull.rebase') === 'true' },
        { text: 'Review everything with `git config --list`.', hint: '`git config --list`', check: (w) => ran(w, /^git\s+config\s+(--\w+\s+)*(--list|-l)\b/) },
      ],
      takeaways: ['`--global` writes `~/.gitconfig` for every repository; `--local` writes `.git/config` for one.', 'Set `user.name` and `user.email` before your first real commit.', 'Aliases like `git lg` save typing for the commands you run every day.'],
      solution: ['git config --global user.name "Sunrise Baker"', 'git config --global user.email baker@sunrise.example', 'git config --global alias.lg "log --oneline --graph --all"', 'git lg', 'git config --global pull.rebase true', 'git config --list'],
    },
    {
      id: 'mastery-detached',
      title: 'Detached HEAD and lost commits',
      tagline: 'Visiting a tag, committing there, and rescuing the commit with reflog and a branch.',
      minutes: 10,
      article: detached,
      setup: (w) => seed(w),
      tasks: [
        { text: 'Check out the tag `v1.0` and read the note Git prints.', hint: '`git checkout v1.0` (or `git switch --detach v1.0`)', check: (w) => isDetached(w, REPO) && head(w, REPO) === tagHash(w) },
        { text: 'Fix the typo (`mornng` → `morning`) in `README.md` using the editor pane, then commit it as `Fix typo in v1.0 README`.', hint: '`code README.md`, fix the word, save, then `git commit -am "Fix typo in v1.0 README"`', check: (w) => isDetached(w, REPO) && commitCount(w, 'HEAD', REPO) === V1_INDEX + 2 && !(committedFile(w, 'README.md', 'HEAD', REPO) ?? 'mornng').includes('mornng') },
        { text: 'Go back to `main` with `git switch main`. Your commit is now on no branch at all.', hint: '`git switch main`', check: (w) => branch(w, REPO) === 'main' && commitCount(w, 'HEAD', REPO) === BASELINE.length },
        { text: 'Find the orphaned commit with `git reflog`.', hint: '`git reflog`', check: (w) => ran(w, /^git\s+reflog/) && branch(w, REPO) === 'main' },
        { text: 'Rescue it onto a new branch called `v1-hotfix`.', hint: '`git switch -c v1-hotfix HEAD@{1}` (or `git branch v1-hotfix <hash>`)', check: (w) => branchExists(w, 'v1-hotfix', REPO) && hasCommit(w, /typo/i, 'v1-hotfix', REPO) && commitCount(w, 'v1-hotfix', REPO) === V1_INDEX + 2 },
        { text: 'Return to `main` and look at both lines of history with `git log --oneline --all`.', hint: '`git switch main` then `git log --oneline --all`', check: (w) => branch(w, REPO) === 'main' && branchExists(w, 'v1-hotfix', REPO) && ran(w, /^git\s+log\b.*--all/) },
      ],
      takeaways: ['Detached HEAD means HEAD points at a commit, not a branch; it is normal for looking around.', 'A commit made in detached HEAD is kept only by HEAD; switch away and no branch references it.', '`git reflog` lists every place HEAD has been; `git switch -c <name> HEAD@{n}` turns an entry into a branch.'],
      solution: ['git checkout v1.0', edit('README.md', README), 'git commit -am "Fix typo in v1.0 README"', 'git switch main', 'git reflog', 'git switch -c v1-hotfix HEAD@{1}', 'git switch main', 'git log --oneline --all'],
    },
  ],
}
