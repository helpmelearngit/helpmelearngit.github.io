import type { Module } from '../types'
import type { World } from '../../engine/world'
import {
  HOME, sh, seedRepo, seedBranch, createHubRepo, hubCommit, hubUrl, repo, head, branch, branchHash, upstreamOf, remoteRef, remoteExists,
  hasCommit, isMergeCommit, isAncestor, clean, cwdIs, cwdIn, ran, committedFile, hub, hubBranch, hubLog, hubMatchesLocal, type SeedCommit,
} from '../helpers'

const PATH = 'sunrise-bakery'
const LAPTOP = 'laptop/sunrise-bakery'
const key = (w: World) => `${w.user.handle}/sunrise-bakery`

const README = '# Sunrise Bakery\n\nFresh bread, every morning since 2019.\n'
const MENU_1 = '# Menu\n\n- Sourdough loaf — $7\n- Croissant — $3.50\n'
const MENU_2 = MENU_1 + '- Cinnamon roll — $4\n'
const MENU_3 = MENU_2 + '- Almond croissant — $4.50\n'
const MENU = MENU_3 + '- Baguette — $3\n'
const MENU_SYNCED = MENU + '- Focaccia — $5\n'
const HOURS = 'Mon-Fri 7am-3pm\nSat 8am-2pm\nSun closed\n'
const BAGUETTE = '# Baguette\n\nPoolish overnight, bake at 250°C.\n'
const MAYA = 'Maya Chen <maya@example.com>'

/** ~/sunrise-bakery as the learner leaves module 3: eight commits on main, tagged v1.0. */
const BASE: SeedCommit[] = [
  { msg: 'Add project README', files: { 'README.md': README } },
  { msg: 'Add menu and opening hours', files: { 'menu.md': MENU_1, 'hours.txt': 'Mon-Fri 7am-3pm\nSat 8am-1pm\n' } },
  { msg: 'Add cinnamon roll to menu', files: { 'menu.md': MENU_2 } },
  { msg: 'Add sourdough recipe', files: { 'recipes/sourdough.md': '# Sourdough\n\n24 hour cold ferment.\n' } },
  { msg: 'Extend Saturday hours to 2pm', files: { 'hours.txt': 'Mon-Fri 7am-3pm\nSat 8am-2pm\n' } },
  { msg: 'Add almond croissant to menu', files: { 'menu.md': MENU_3 } },
  { msg: 'Add Sunday closure to hours', files: { 'hours.txt': HOURS } },
  { msg: 'Add baguette to menu', files: { 'menu.md': MENU } },
]
/** What lessons 2 and 3 add on both sides; lessons 4 and 5 start from here. */
const SYNCED_EXTRA: SeedCommit[] = [
  { msg: 'Add focaccia to menu', files: { 'menu.md': MENU_SYNCED } },
  { msg: 'Add baguette recipe', files: { 'recipes/baguette.md': BAGUETTE }, author: MAYA },
]

function baseline(w: World, remote?: string) { seedRepo(w, PATH, BASE, { remote }); sh(w, 'git tag v1.0') }
/** Hub repo exists, local main is pushed and tracks origin/main, cwd inside the repo, command history empty. */
function synced(w: World, extra: SeedCommit[] = []) {
  createHubRepo(w, w.user.handle, 'sunrise-bakery')
  baseline(w, hubUrl(key(w)))
  seedRepo(w, PATH, extra)
  sh(w, 'git push -u origin main')
  w.history.length = 0
}

const push = `
Everything you have built so far lives in one place: the \`.git\` folder on this computer. Maya wants to read the recipes. The laptop you take home needs a copy too. And if this machine dies tonight, eight commits of careful history die with it.

A **remote** solves all three. A remote is simply *another copy of the repository*, somewhere else, that your repository knows by name. Git can send commits to it (**push**) and bring commits back from it (**fetch**, **pull**). The copy could live on a second computer or a USB stick. Most of the time it lives on **GitHub**, a hosting service that keeps repositories online and wraps a website around them: a file browser, a commit list, pull requests. GitHub is not Git. It is a popular place to put a remote.

## The picture

\`\`\`figure
  YOUR COMPUTER  ~/sunrise-bakery              GITHUB  https://github.com/you/sunrise-bakery.git
 ┌─────────────────────────────┐              ┌─────────────────────────────┐
 │ main         ──▶ 7d8e9f0    │ ── push ──▶  │ main  ──▶ 7d8e9f0           │
 │ origin/main  ──▶ 7d8e9f0    │ ◀── fetch ── │                             │
 └─────────────────────────────┘              └─────────────────────────────┘
   your branch   │  remote-tracking branch:      the remote, known to you as "origin"
                 └─ "what origin had, last time we talked"
caption: Three names. main is yours and moves when you commit. origin/main is a local bookmark of the remote's main. The remote itself has only main.
\`\`\`

| Name | Lives | Means |
|---|---|---|
| \`main\` | on your computer | your branch |
| \`origin\` | on your computer | a nickname for one remote URL |
| \`origin/main\` | on your computer | a bookmark: where \`main\` was on \`origin\` the last time you pushed or fetched |

Nothing on the right is magic. GitHub holds the same commits with the same hashes.

## Step 1: create an empty repository on GitHub

In the **hub pane** click **New repository**, call it \`sunrise-bakery\`, and leave *Add a README* **unchecked**. You already have a README and eight commits; an empty repository can receive them cleanly. GitHub then shows instructions for exactly this case, "push an existing repository from the command line", with your URL at the top. Look at the handle in that URL. Wherever this course writes \`you\`, type your own handle.

## Step 2: tell your repository about it

\`\`\`bash
$ git remote add origin https://github.com/you/sunrise-bakery.git
$ git remote -v
origin	https://github.com/you/sunrise-bakery.git (fetch)
origin	https://github.com/you/sunrise-bakery.git (push)
\`\`\`

\`origin\` is just a name. You could call it \`github\` or \`backup\`, but \`origin\` is the convention everyone expects, and \`git clone\` (next lesson) picks it automatically. \`git remote -v\` lists every remote with its URL: one line for fetching, one for pushing, normally identical.

## Step 3: push, and read the error

\`\`\`bash
$ git push
fatal: The current branch main has no upstream branch.
To push the current branch and set the remote as upstream, use

    git push --set-upstream origin main

To have this happen automatically for branches without a tracking
upstream, see 'push.autoSetupRemote' in 'git help config'.
\`\`\`

Git knows about \`origin\` but not that *your* \`main\` belongs with *origin's* \`main\`. That link is the **upstream** (or tracking) branch, and you set it once:

\`\`\`bash
$ git push -u origin main
To https://github.com/you/sunrise-bakery.git
 * [new branch]      main -> main
branch 'main' set up to track 'origin/main'.
\`\`\`

\`-u\` is short for \`--set-upstream\`. Now watch the hub pane: eight commits appear, the README renders, the files are browsable. The hashes match \`git log\` exactly, because they *are* the same commits.

\`\`\`bash
$ git status
On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean
\`\`\`

That second line is new. From now on \`git status\` compares \`main\` with \`origin/main\` and tells you whether you are ahead, behind or in sync, and plain \`git push\` and \`git pull\` know where to go.

> **Why**
> Every collaboration workflow in the rest of this course, pull requests, forks, code review, is built from these three moves: a remote with a name, a push, and an upstream link. Once you can read *Your branch is ahead of 'origin/main' by 1 commit*, you always know what is on your machine and what is on GitHub.

## Gotchas

- Copy the URL from the hub pane rather than typing it. One wrong letter in the handle and \`git push\` answers \`remote: Repository not found\`.
- \`-u\` is per branch, not per repository. Each new branch you publish needs it once (Lesson 5).
- Tags do not travel with a normal push. Your \`v1.0\` is still local only; \`git push --tags\` sends them.

## Up next

The repository is on GitHub. Next you sit down at a different computer and get it back with \`git clone\`.
`

const clone = `
You are at home, on the laptop, and the bakery's repository is on the computer at the shop. Yesterday that meant a USB stick. Now it is on GitHub, so you ask Git for a complete copy: \`git clone\`.

## What clone does

\`git clone <url>\` does four things in one go:

1. creates a folder named after the repository,
2. runs \`git init\` inside it,
3. adds a remote called \`origin\` pointing at the URL,
4. fetches every commit, checks out the default branch and sets its upstream.

Afterwards you have the entire history, not a snapshot: every commit, message and hash, identical to the shop computer and to GitHub. You could lose both of the others and rebuild them from the laptop.

\`\`\`figure
  SHOP ~/sunrise-bakery        GITHUB (origin)          LAPTOP ~/laptop/sunrise-bakery
 ┌─────────────────────┐      ┌────────────────┐       ┌─────────────────────┐
 │ main        7d8e9f0 │ ─▶   │ main   7d8e9f0 │  ─▶   │ main        7d8e9f0 │
 │ origin/main 7d8e9f0 │ push │                │ clone │ origin/main 7d8e9f0 │
 └─────────────────────┘      └────────────────┘       └─────────────────────┘
caption: Two full copies with one remote in the middle. Each copy has its own main and its own origin/main bookmark; GitHub has only main.
\`\`\`

## Cloning

\`\`\`bash
$ mkdir ~/laptop && cd ~/laptop
$ git clone https://github.com/you/sunrise-bakery.git
Cloning into 'sunrise-bakery'...
remote: Enumerating objects: 24, done.
remote: Total 24 (delta 8), reused 24 (delta 8), pack-reused 0
Receiving objects: 100% (24/24), done.
Resolving deltas: 100% (8/8), done.
$ cd sunrise-bakery
$ ls
README.md  hours.txt  menu.md  recipes
\`\`\`

Add a second argument to pick a different folder name: \`git clone <url> bakery-copy\`.

## Remote-tracking branches

\`\`\`bash
$ git branch -a
* main
  remotes/origin/main
$ git log --oneline
7d8e9f0 (HEAD -> main, origin/main) Add baguette to menu
c4d5e6f Add Sunday closure to hours
...
\`\`\`

\`-a\` means *all*: local branches plus **remote-tracking branches**. \`origin/main\` is one of those. It is not a branch you work on. It is a **read-only bookmark**: "the last time I talked to origin, its \`main\` was here." You cannot commit to it; it moves only when you push to or fetch from the remote. Right after a clone it sits on the same commit as \`main\`, which is why \`git log\` prints both names on one line.

Clone also set \`main\`'s upstream to \`origin/main\`, so the status messages from the last lesson work here too.

## Work, then push

Make a change on the laptop exactly as you would anywhere:

\`\`\`bash
$ echo "- Focaccia — $5" >> menu.md
$ git commit -am "Add focaccia to menu"
[main 9a8b7c6] Add focaccia to menu
 1 file changed, 1 insertion(+)
$ git status
On branch main
Your branch is ahead of 'origin/main' by 1 commit.
  (use "git push" to publish your local commits)
\`\`\`

"Ahead by 1" means \`main\` has one commit that the bookmark \`origin/main\` does not. Publish it:

\`\`\`bash
$ git push
To https://github.com/you/sunrise-bakery.git
   7d8e9f0..9a8b7c6  main -> main
\`\`\`

No \`-u\` this time; clone already set the upstream. The output is the move the remote made, \`7d8e9f0\` to \`9a8b7c6\`, and your \`origin/main\` bookmark moves with it. The hub pane now shows nine commits.

> **Why**
> Clone is how every project you will ever contribute to arrives on your machine. Knowing that it gives you a *full* repository, with its own \`main\`, its own \`.git\` and a bookmark of the remote, is what makes the next lesson make sense: the shop computer still believes \`origin/main\` is at \`7d8e9f0\`, because nobody has told it otherwise.

## Gotchas

- Clone into a folder that is not already inside a repository. Nested repositories confuse everyone, Git included.
- \`remotes/origin/main\` in \`git branch -a\` is not a second \`main\`. Do not switch to it to work; switch to \`main\` and let the bookmark be a bookmark.
- Clone copies the commits and tags that are *on the remote*. Your local-only \`v1.0\` tag did not come along, because it was never pushed.

## Up next

Back at the shop, that computer has not heard about the focaccia. Time to learn the difference between fetch and pull.
`

const fetchPull = `
You walk into the shop on Monday. Its computer still has the history from before the weekend. Since then you pushed a focaccia from the laptop and Maya pushed a baguette recipe. Yet:

\`\`\`bash
$ git status
On branch main
Your branch is up to date with 'origin/main'.
\`\`\`

Git is not lying. It compares \`main\` with \`origin/main\`, and \`origin/main\` is a **bookmark of the last conversation** with the remote. This computer has not spoken to GitHub since Friday, so the bookmark is stale and the comparison is stale. \`git status\` never touches the network. Only four commands do: \`clone\`, \`fetch\`, \`pull\` and \`push\`.

## Fetch: update the bookmark, touch nothing else

\`\`\`bash
$ git fetch
From https://github.com/you/sunrise-bakery
   7d8e9f0..3c2b1a0  main       -> origin/main
\`\`\`

Fetch downloads the new commits into your \`.git\` and moves \`origin/main\` to where the remote's \`main\` is. That is all. Your \`main\` did not move, your files did not change, nothing was merged. Fetch is always safe; run it as often as you like.

\`\`\`figure
  before fetch              after fetch                        after pull
  7d8e9f0                   7d8e9f0 ─ 9a8b7c6 ─ 3c2b1a0        7d8e9f0 ─ 9a8b7c6 ─ 3c2b1a0
  main, origin/main         main                origin/main                        main, origin/main
caption: Fetch moves only the bookmark. Pull moves the bookmark, then fast-forwards main to meet it.
\`\`\`

Now the comparison is honest:

\`\`\`bash
$ git status
On branch main
Your branch is behind 'origin/main' by 2 commits, and can be fast-forwarded.
  (use "git pull" to update your local branch)
\`\`\`

## Look before you merge

The reason to fetch first is that you can inspect what arrived before it touches your branch. \`A..B\` means "commits reachable from B but not from A":

\`\`\`bash
$ git log --oneline main..origin/main
3c2b1a0 (origin/main) Add baguette recipe
9a8b7c6 Add focaccia to menu
\`\`\`

\`git log --oneline --all\` draws the same picture with every ref included, and the **graph pane** shows \`origin/main\` sitting two commits ahead of \`main\`.

## Pull: fetch, then merge

\`\`\`bash
$ git pull
Updating 7d8e9f0..3c2b1a0
Fast-forward
 menu.md              |  1 +
 recipes/baguette.md  |  3 +++
 2 files changed, 4 insertions(+)
$ cat recipes/baguette.md
# Baguette

Poolish overnight, bake at 250°C.
\`\`\`

\`git pull\` is literally \`git fetch\` followed by \`git merge origin/main\`. Because \`main\` had nothing of its own, the merge is a **fast-forward**: \`main\` slides along the line to \`3c2b1a0\`. No merge commit, no conflict, and Maya's file is on your disk.

| Command | Network | Moves \`origin/main\` | Moves \`main\` | Changes files |
|---|---|---|---|---|
| \`git status\` | no | no | no | no |
| \`git fetch\` | yes | yes | no | no |
| \`git pull\` | yes | yes | yes | yes |

> **Why**
> People who fetch first rarely get surprised. You see "two commits, one of them Maya's, touching \`recipes/\`" *before* they land, decide whether now is a good moment, and then pull. The habit also makes the next lesson's error, "the remote contains work that you do not have locally", instantly readable: your bookmark was behind.

## Gotchas

- "Up to date" from \`git status\` means up to date *with the bookmark*. Fetch before you trust it.
- \`git pull\` refuses if you have uncommitted edits to a file the incoming commits also change: *Your local changes would be overwritten by merge*. Commit or stash first.
- Fetch also brings down other people's branches as \`origin/<name>\` bookmarks (Lesson 5). Seeing one is not the same as having a local branch for it.

## Up next

The fast-forward worked because you had no local commits. When both sides have new commits, \`git push\` says no, and you need one more tool.
`

const rejected = `
Monday, later. You add a rye loaf to the menu and commit. At the same moment Maya, at home, commits new Friday hours and pushes first. You push:

\`\`\`bash
$ git push
To https://github.com/you/sunrise-bakery.git
 ! [rejected]        main -> main (fetch first)
error: failed to push some refs to 'https://github.com/you/sunrise-bakery.git'
hint: Updates were rejected because the remote contains work that you do not
hint: have locally. This is usually caused by another repository pushing to
hint: the same ref. If you want to integrate the remote changes, use
hint: 'git pull' before pushing again.
hint: See the 'Note about fast-forwards' in 'git push --help' for details.
\`\`\`

Nothing is broken. Git is refusing to do something destructive. The remote's \`main\` has a commit (Maya's) that your \`main\` does not contain. If your push went through, her commit would fall off the end of the line and be lost. A push is accepted only when it is a **fast-forward**: the remote's current commit must be an ancestor of the one you are sending.

## Diverged

\`\`\`figure
                   ┌── a1b2c3d  "Add rye loaf to menu"              main (yours)
  ... ── 3c2b1a0 ──┤
                   └── e5f6a7b  "Stay open until 4pm on Fridays"    origin/main (Maya's, after fetch)
caption: Both branches grew from the same commit. Neither is an ancestor of the other: they have diverged.
\`\`\`

The hint says to pull. Try it:

\`\`\`bash
$ git pull
hint: You have divergent branches and need to specify how to reconcile them.
hint: You can do so by running one of the following commands sometime before
hint: your next pull:
hint:
hint:   git config pull.rebase false  # merge
hint:   git config pull.rebase true   # rebase
hint:   git config pull.ff only       # fast-forward only
...
fatal: Need to specify how to reconcile divergent branches.
\`\`\`

Git did the fetch half (your \`origin/main\` bookmark now points at Maya's commit, and \`git status\` says *have diverged*) and then stopped. The merge half has two possible shapes, and modern Git refuses to guess which one you want.

## Two ways to reconcile

**Merge** (\`git pull --no-rebase\`) creates a merge commit with two parents, Maya's and yours. It works, but every time two people push around the same time, history gains another *Merge remote-tracking branch 'origin/main'* bubble that says nothing about the bakery.

**Rebase** (\`git pull --rebase\`) lifts your unpushed commit off, fast-forwards \`main\` to Maya's commit, then replays yours on top. The result is a straight line, as if you had started after her:

\`\`\`bash
$ git pull --rebase
Successfully rebased and updated refs/heads/main.
$ git log --oneline -3
f0e1d2c (HEAD -> main) Add rye loaf to menu
e5f6a7b (origin/main) Stay open until 4pm on Fridays
3c2b1a0 Add baguette recipe
\`\`\`

Your commit has a new hash, \`f0e1d2c\` instead of \`a1b2c3d\`, because it has a new parent. That is fine: nobody else ever had the old one. Rewriting commits that *have* been pushed is the danger; rewriting your own unpushed commits is exactly what rebase is for.

\`\`\`bash
$ git push
To https://github.com/you/sunrise-bakery.git
   e5f6a7b..f0e1d2c  main -> main
\`\`\`

Now the remote's commit is an ancestor of yours, the push is a fast-forward, and it goes through.

## Make it the default

\`\`\`bash
$ git config --global pull.rebase true
\`\`\`

With this set, \`git pull\` rebases on divergence without asking and still fast-forwards when it can. It is the right default for the everyday case: a few local commits of your own that nobody has seen yet. Reach for a plain merge only when your local work is a long-lived branch you want to keep visible as a bubble.

> **Why**
> This rejection is the most common "scary" moment in daily Git use, and it is the system working: a push can never erase a teammate's commit. Integrate their work first, then push. Pull requests in Module 5 move the integration onto GitHub, but the rule is the same.

## Gotchas

- Never answer a rejected push with \`git push --force\`. That is the one way to actually lose Maya's commit.
- \`git pull --rebase\` can stop on a conflict when you both edited the same lines. Fix the file, \`git add\` it, then \`git rebase --continue\`, exactly like a merge conflict.
- The rejection reads \`(fetch first)\` when your bookmark is stale and \`(non-fast-forward)\` when you had already fetched. Same fix either way.

## Up next

So far everything has been \`main\`. Next: publishing feature branches, picking up Maya's, and cleaning up when they are done.
`

const branchesRemote = `
You have been working on \`holiday-hours\`, the Christmas week schedule. It is one commit, local only, and Maya would like to see it before it reaches \`main\`. Meanwhile the hub pane shows a branch that has never been on your computer: \`seasonal-menu\`, Maya's pumpkin loaf. Branches travel between copies the same way \`main\` does, one name at a time.

## Publishing a branch

\`\`\`bash
$ git push -u origin holiday-hours
To https://github.com/you/sunrise-bakery.git
 * [new branch]      holiday-hours -> holiday-hours
branch 'holiday-hours' set up to track 'origin/holiday-hours'.
\`\`\`

Same shape as your very first push. \`-u\` links your \`holiday-hours\` to \`origin/holiday-hours\`, so plain \`git push\` and \`git pull\` on this branch know where to go. Open the branch list in the hub pane: \`holiday-hours\` is there, one commit ahead of \`main\`.

## Picking up someone else's branch

Your computer does not know about \`seasonal-menu\` until you fetch:

\`\`\`bash
$ git fetch
From https://github.com/you/sunrise-bakery
 * [new branch]      seasonal-menu -> origin/seasonal-menu
$ git branch -r
  remotes/origin/holiday-hours
  remotes/origin/main
  remotes/origin/seasonal-menu
\`\`\`

\`-r\` lists only remote-tracking branches. You now hold a bookmark for Maya's branch but no local branch. \`git switch\` fills the gap:

\`\`\`bash
$ git switch seasonal-menu
branch 'seasonal-menu' set up to track 'origin/seasonal-menu'.
Switched to a new branch 'seasonal-menu'
$ cat menu.md
...
- Pumpkin loaf — $8 (autumn only)
\`\`\`

When a name matches no local branch but exactly one \`origin/<name>\`, \`switch\` creates the local branch from the bookmark and sets its upstream in one step. You can read Maya's work, try it, even commit on top and push back to her branch.

\`\`\`figure
  LOCAL                                       origin (GitHub)
  main            ──▶ 3c2b1a0                 main            ──▶ 3c2b1a0
  holiday-hours   ──▶ 8e7d6c5   ─ push -u ─▶  holiday-hours   ──▶ 8e7d6c5
  seasonal-menu   ──▶ 5b4a3f2   ◀─ switch ──  seasonal-menu   ──▶ 5b4a3f2
caption: Each local branch tracks one remote branch. The origin/* bookmarks sit in between and move on fetch and push.
\`\`\`

## Finishing a branch

The holiday hours are approved. Merge them into \`main\` and publish:

\`\`\`bash
$ git switch main
Switched to branch 'main'
Your branch is up to date with 'origin/main'.
$ git merge holiday-hours
Updating 3c2b1a0..8e7d6c5
Fast-forward
 hours.txt            |  1 +
 1 file changed, 1 insertion(+)
$ git push
To https://github.com/you/sunrise-bakery.git
   3c2b1a0..8e7d6c5  main -> main
\`\`\`

The branch has done its job, but it still exists on GitHub, and a remote full of merged branches is noise. Deleting a remote branch is a push with \`--delete\`:

\`\`\`bash
$ git push origin --delete holiday-hours
To https://github.com/you/sunrise-bakery.git
 - [deleted]         holiday-hours
\`\`\`

The remote branch and your \`origin/holiday-hours\` bookmark are both gone. Your local \`holiday-hours\` branch is untouched; \`git branch -d holiday-hours\` removes it when you are ready.

## Prune: when someone else deletes

Maya tidied up too and deleted \`seasonal-menu\` on GitHub. Your computer still has the bookmark, because a normal fetch only adds and moves bookmarks, never removes them. \`--prune\` does:

\`\`\`bash
$ git fetch --prune
From https://github.com/you/sunrise-bakery
 - [deleted]         (none)     -> origin/seasonal-menu
\`\`\`

> **Why**
> Feature branches on the remote are how pull requests work: you push a branch, open a request to merge it into \`main\`, and delete it when it lands. Module 5 adds the review conversation in the middle; the Git commands are exactly the ones on this page.

## Gotchas

- \`git branch -r\` shows bookmarks, not branches you can commit on. \`git switch <name>\` makes the real branch.
- Deleting a remote branch does not delete the local one, and vice versa. They are two separate refs that happen to share a name.
- Bookmarks pile up quietly. Run \`git fetch --prune\` now and then, or whenever \`git branch -r\` lists a branch you know is gone.

## Up next

You can publish, follow, merge and clean up branches on a shared remote. In the next module the merge itself moves onto GitHub, as a pull request Maya can review.
`

export const module: Module = {
  id: 'remotes',
  title: 'Remotes: working with GitHub',
  blurb: 'Publish your repository, clone it elsewhere, and keep every copy in sync with fetch, pull and push.',
  lessons: [
    {
      id: 'remotes-push',
      title: 'Your first push',
      tagline: 'What a remote is, creating a repository on GitHub, and git push -u.',
      minutes: 10,
      article: push,
      setup: (w) => { baseline(w) },
      panes: { hub: true },
      hubHome: '{you}/sunrise-bakery',
      tasks: [
        { text: 'In the hub pane click **New repository**, name it `sunrise-bakery`, leave *Add a README* unchecked, and create it.', hint: 'Hub pane → **New repository** → name `sunrise-bakery` → leave the README box unticked → create.', check: (w) => !!hub(w, key(w)) },
        { text: 'Connect your repository to it: `git remote add origin https://github.com/you/sunrise-bakery.git` (use the handle shown in the hub pane instead of `you`).', hint: '`git remote add origin https://github.com/you/sunrise-bakery.git`, with your own handle in place of `you`.', check: (w) => remoteExists(w, 'origin', PATH) && (repo(w, PATH)?.remotes.origin ?? '').includes(`github.com/${w.user.handle}/sunrise-bakery`) },
        { text: 'List your remotes with `git remote -v`.', hint: '`git remote -v`', check: (w) => ran(w, /^git\s+remote\s+(-v|--verbose|show)/) },
        { text: 'Try a plain `git push` and read the error.', hint: '`git push`', check: (w) => ran(w, /^git\s+push\s*$/) },
        { text: 'Push for real and set the upstream: `git push -u origin main`. Watch the commits appear in the hub pane.', hint: '`git push -u origin main`', check: (w) => hubMatchesLocal(w, key(w), 'main', PATH) && upstreamOf(w, 'main', PATH) === 'origin/main' },
        { text: 'Run `git status` and read the new line about `origin/main`.', hint: '`git status`', check: (w) => /^git\s+status/.test(w.history.at(-1) ?? '') && hubMatchesLocal(w, key(w), 'main', PATH) },
      ],
      takeaways: ['A remote is another copy of the repository that yours knows by a name; `origin` is the conventional name.', '`git push -u origin main` publishes a branch and links it to `origin/main`, its upstream.', '`origin/main` is a local bookmark of the remote; `git status` compares your branch against it.'],
      solution: [(w) => { createHubRepo(w, w.user.handle, 'sunrise-bakery') }, 'git remote add origin https://github.com/you/sunrise-bakery.git', 'git remote -v', 'git push', 'git push -u origin main', 'git status'],
    },
    {
      id: 'remotes-clone',
      title: 'Clone: a second copy',
      tagline: 'git clone gives you a full repository with origin and a remote-tracking bookmark already set.',
      minutes: 9,
      article: clone,
      setup: (w) => { synced(w); w.cwd = HOME },
      panes: { hub: true },
      hubHome: '{you}/sunrise-bakery',
      tasks: [
        { text: 'Pretend this is your laptop: create a folder `laptop` in your home directory and move into it.', hint: '`mkdir ~/laptop` then `cd ~/laptop`', check: (w) => cwdIs(w, 'laptop') },
        { text: 'Clone the bakery: `git clone https://github.com/you/sunrise-bakery.git`.', hint: '`git clone https://github.com/you/sunrise-bakery.git` (your handle instead of `you`)', check: (w) => remoteExists(w, 'origin', LAPTOP) && head(w, LAPTOP) !== null && head(w, LAPTOP) === hubBranch(w, key(w), 'main') },
        { text: 'Move into the clone and list every branch, remote-tracking ones included, with `git branch -a`.', hint: '`cd sunrise-bakery` then `git branch -a`', check: (w) => cwdIn(w, LAPTOP) && ran(w, /^git\s+branch\s+(-a|--all|-r|--remotes|-vv)/) },
        { text: 'Run `git log --oneline` and find `origin/main` in the decorations.', hint: '`git log --oneline`', check: (w) => cwdIn(w, LAPTOP) && ran(w, /^git\s+log/) },
        { text: 'Add the line `- Focaccia — $5` to `menu.md` and commit it as `Add focaccia to menu`.', hint: '`echo "- Focaccia — $5" >> menu.md` then `git commit -am "Add focaccia to menu"`', check: (w) => hasCommit(w, /focaccia/i, 'HEAD', LAPTOP) && committedFile(w, 'menu.md', 'HEAD', LAPTOP)?.includes('Focaccia') === true },
        { text: 'Publish it with a plain `git push`; clone already set the upstream.', hint: '`git push`', check: (w) => hubMatchesLocal(w, key(w), 'main', LAPTOP) && hubLog(w, key(w)).some((m) => /focaccia/i.test(m)) },
      ],
      takeaways: ['`git clone <url>` creates the folder, adds `origin`, downloads all history and checks out `main` with its upstream set.', 'Remote-tracking branches like `origin/main` are read-only bookmarks of the remote; they move only on fetch and push.', 'A clone is a complete repository, not a snapshot.'],
      solution: ['mkdir ~/laptop', 'cd ~/laptop', 'git clone https://github.com/you/sunrise-bakery.git', 'cd sunrise-bakery', 'git branch -a', 'git log --oneline', 'echo "- Focaccia — $5" >> menu.md', 'git commit -am "Add focaccia to menu"', 'git push'],
    },
    {
      id: 'remotes-fetch-pull',
      title: 'Fetch vs pull',
      tagline: 'Why git status lies, how fetch updates the bookmark, and pull as fetch plus merge.',
      minutes: 9,
      article: fetchPull,
      setup: (w) => {
        synced(w)
        sh(w, 'mkdir ~/laptop', 'cd ~/laptop', `git clone ${hubUrl(key(w))}`, 'cd sunrise-bakery', 'echo "- Focaccia — $5" >> menu.md', 'git commit -am "Add focaccia to menu"', 'git push', 'cd ~/sunrise-bakery')
        hubCommit(w, hub(w, key(w))!, 'main', { 'recipes/baguette.md': BAGUETTE }, 'Add baguette recipe')
        w.history.length = 0
      },
      panes: { hub: true },
      hubHome: '{you}/sunrise-bakery',
      tasks: [
        { text: 'Run `git status`. It claims you are up to date with `origin/main`. You are not.', hint: '`git status`', check: (w) => ran(w, /^git\s+status/) },
        { text: 'Ask the remote what changed, without touching your files: `git fetch`.', hint: '`git fetch`', check: (w) => remoteRef(w, 'origin/main', PATH) !== null && remoteRef(w, 'origin/main', PATH) === hubBranch(w, key(w), 'main') },
        { text: 'Run `git status` again. Now it knows you are behind.', hint: '`git status`', check: (w) => w.history.filter((c) => /^git\s+status/.test(c)).length >= 2 },
        { text: 'Look at the incoming commits with `git log --oneline main..origin/main` (or `git log --oneline --all`).', hint: '`git log --oneline main..origin/main`', check: (w) => ran(w, /^git\s+log\b.*(\.\.|--all|origin\/main)/) },
        { text: 'Bring them in with `git pull`.', hint: '`git pull`', check: (w) => head(w, PATH) !== null && head(w, PATH) === hubBranch(w, key(w), 'main') && !isMergeCommit(w, PATH) && clean(w, PATH) },
        { text: "Maya's new file is now on your disk. Read it with `cat recipes/baguette.md`.", hint: '`cat recipes/baguette.md`', check: (w) => ran(w, /^(cat|head|tail|code)\s+recipes\/baguette\.md/) && committedFile(w, 'recipes/baguette.md', 'HEAD', PATH) !== null },
      ],
      takeaways: ['`git status` compares against the bookmark, not the real remote; only clone, fetch, pull and push touch the network.', '`git fetch` moves `origin/main` and downloads commits without changing your branch or files.', '`git pull` is fetch followed by merge; with no local commits it fast-forwards.'],
      solution: ['git status', 'git fetch', 'git status', 'git log --oneline main..origin/main', 'git pull', 'cat recipes/baguette.md'],
    },
    {
      id: 'remotes-rejected',
      title: 'Push rejected: integrate first',
      tagline: 'What a non-fast-forward rejection means and why pull --rebase is the right answer.',
      minutes: 11,
      article: rejected,
      setup: (w) => { synced(w, SYNCED_EXTRA) },
      onTick: (w, ctx) => {
        if (hasCommit(w, /rye/i, 'HEAD', PATH)) ctx.once('maya-pushes', () => hubCommit(w, hub(w, key(w))!, 'main', { 'hours.txt': 'Mon-Thu 7am-3pm\nFri 7am-4pm\nSat 8am-2pm\nSun closed\n' }, 'Stay open until 4pm on Fridays'))
      },
      panes: { hub: true },
      hubHome: '{you}/sunrise-bakery',
      tasks: [
        { text: 'Add `- Rye loaf — $6` to `menu.md` and commit it as `Add rye loaf to menu`.', hint: '`echo "- Rye loaf — $6" >> menu.md` then `git commit -am "Add rye loaf to menu"`', check: (w) => hasCommit(w, /rye/i, 'HEAD', PATH) && clean(w, PATH) },
        { text: 'Maya just pushed too (see the hub pane). Try `git push` and read the rejection.', hint: '`git push`', check: (w) => ran(w, /^git\s+push\s*$/) && !hubLog(w, key(w)).some((m) => /rye/i.test(m)) },
        { text: 'Follow the hint: run `git pull`. Git refuses and explains why.', hint: '`git pull`', check: (w) => ran(w, /^git\s+pull\s*$/) },
        { text: "Replay your commit on top of Maya's with `git pull --rebase`.", hint: '`git pull --rebase`', check: (w) => { const h = head(w, PATH), r = remoteRef(w, 'origin/main', PATH); return !!h && !!r && h !== r && isAncestor(w, r, h) && hasCommit(w, /rye/i, 'HEAD', PATH) && hasCommit(w, /friday/i, 'HEAD', PATH) && !isMergeCommit(w, PATH) && clean(w, PATH) } },
        { text: 'Now `git push` goes through.', hint: '`git push`', check: (w) => hubMatchesLocal(w, key(w), 'main', PATH) && hubLog(w, key(w)).some((m) => /rye/i.test(m)) },
        { text: 'Make rebase the default for every future pull: `git config --global pull.rebase true`.', hint: '`git config --global pull.rebase true`', check: (w) => (w.config['pull.rebase'] ?? repo(w, PATH)?.config['pull.rebase']) === 'true' },
      ],
      takeaways: ['A push is accepted only as a fast-forward; a rejection means the remote has commits you lack, and nothing is broken.', '`git pull --rebase` replays your unpushed commits on top of the remote, keeping history linear.', '`git config --global pull.rebase true` makes that the default; never answer a rejection with `--force`.'],
      solution: ['echo "- Rye loaf — $6" >> menu.md', 'git commit -am "Add rye loaf to menu"', 'git push', 'git pull', 'git pull --rebase', 'git push', 'git config --global pull.rebase true'],
    },
    {
      id: 'remotes-branches',
      title: 'Branches on the remote',
      tagline: 'Publish a branch, pick up a teammate\'s, and delete and prune when they are done.',
      minutes: 11,
      article: branchesRemote,
      setup: (w) => {
        synced(w, SYNCED_EXTRA)
        seedBranch(w, PATH, 'holiday-hours', 'main', [{ msg: 'Add Christmas Eve hours', files: { 'hours.txt': HOURS + 'Dec 24: 7am-12pm\n' } }])
        hubCommit(w, hub(w, key(w))!, 'seasonal-menu', { 'menu.md': MENU_SYNCED + '- Pumpkin loaf — $8 (autumn only)\n' }, 'Add pumpkin loaf for autumn')
        sh(w, 'git switch holiday-hours')
        w.history.length = 0
      },
      onTick: (w, ctx) => {
        if (hubLog(w, key(w)).some((m) => /christmas/i.test(m)) && !hubBranch(w, key(w), 'holiday-hours')) ctx.once('maya-deletes', () => { delete hub(w, key(w))!.repo.refs['refs/heads/seasonal-menu'] })
      },
      panes: { hub: true },
      hubHome: '{you}/sunrise-bakery',
      tasks: [
        { text: 'You are on `holiday-hours` with one unpublished commit. Publish the branch: `git push -u origin holiday-hours`.', hint: '`git push -u origin holiday-hours`', check: (w) => hubBranch(w, key(w), 'holiday-hours') !== null && hubBranch(w, key(w), 'holiday-hours') === branchHash(w, 'holiday-hours', PATH) && upstreamOf(w, 'holiday-hours', PATH) === 'origin/holiday-hours' },
        { text: 'The hub pane lists a branch you have never seen: `seasonal-menu`. Download its bookmark with `git fetch`.', hint: '`git fetch`', check: (w) => remoteRef(w, 'origin/seasonal-menu', PATH) !== null },
        { text: 'List the remote-tracking branches with `git branch -r`.', hint: '`git branch -r`', check: (w) => ran(w, /^git\s+branch\s+(-r|--remotes|-a|--all)/) },
        { text: "Switch to Maya's branch: `git switch seasonal-menu`. Git creates a local branch tracking `origin/seasonal-menu`.", hint: '`git switch seasonal-menu`', check: (w) => branch(w, PATH) === 'seasonal-menu' && upstreamOf(w, 'seasonal-menu', PATH) === 'origin/seasonal-menu' },
        { text: 'Back on `main`, merge `holiday-hours` and push `main`.', hint: '`git switch main`, then `git merge holiday-hours`, then `git push`', check: (w) => branch(w, PATH) === 'main' && hasCommit(w, /christmas/i, 'main', PATH) && hubMatchesLocal(w, key(w), 'main', PATH) },
        { text: 'The branch is merged; delete it on the remote with `git push origin --delete holiday-hours`.', hint: '`git push origin --delete holiday-hours`', check: (w) => hubLog(w, key(w)).some((m) => /christmas/i.test(m)) && hubBranch(w, key(w), 'holiday-hours') === null && remoteRef(w, 'origin/holiday-hours', PATH) === null },
        { text: 'Maya deleted `seasonal-menu` on GitHub too. Drop your stale bookmark with `git fetch --prune`.', hint: '`git fetch --prune`', check: (w) => remoteRef(w, 'origin/seasonal-menu', PATH) === null && ran(w, /^git\s+fetch\b.*(\s-p\b|--prune)/) },
      ],
      takeaways: ['`git push -u origin <branch>` publishes a branch; `git fetch` then `git switch <name>` picks up a teammate\'s.', '`git branch -r` lists remote-tracking bookmarks, not branches you can commit on.', '`git push origin --delete <branch>` removes a remote branch; `git fetch --prune` drops bookmarks for branches others deleted.'],
      solution: ['git push -u origin holiday-hours', 'git fetch', 'git branch -r', 'git switch seasonal-menu', 'git switch main', 'git merge holiday-hours', 'git push', 'git push origin --delete holiday-hours', 'git fetch --prune'],
    },
  ],
}
