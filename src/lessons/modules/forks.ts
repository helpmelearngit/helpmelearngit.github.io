import type { Module } from '../types'
import type { World } from '../../engine/world'
import { mergePR, prState } from '../../engine/hub'
import { HOME, sh, createHubRepo, hubCommit, forkRepo, openPR, reviewPR, hubUrl, repo, branch, branchHash, branchExists, remoteExists, remoteRef, committedFile, fileExists, ran, hub, hubBranch, hubFile, prs } from '../helpers'

const UP = 'octo-org/bread-lab'
const R = 'bread-lab'
const fork = (w: World) => `${w.user.handle}/${R}`

const LAB = {
  'README.md': '# Bread Lab\n\nCommunity bread recipes, tested in home ovens.\nRead CONTRIBUTING.md before opening a pull request.\n',
  'CONTRIBUTING.md': '# Contributing\n\n- One recipe per pull request, on its own branch.\n- Copy the format of recipes/baguette.md.\n- Maintainers review in their spare time. Be patient.\n',
  'recipes/baguette.md': '# Baguette\n\nFlour 500g, water 350g, salt 10g, yeast 3g.\nShape three sticks, score, bake at 250C for 22 minutes.\n',
  'recipes/focaccia.md': '# Focaccia\n\nWet dough, overnight rest in the fridge.\nDimple with oiled fingers, top with rosemary and salt.\n',
}
const RYE = '# Rye\n\nDark rye flour, caraway seeds, sourdough starter.\nBake low and slow. Wait a day before slicing.\n'
const BRIOCHE = '# Brioche\n\nEnriched dough: butter, eggs, a little sugar.\nProve twice, egg-wash, bake at 180C until deep gold.\n'

/** The open-source project, owned by Sam. Two commits on main. */
function seedUpstream(w: World) {
  const h = createHubRepo(w, 'octo-org', R, { description: 'Community bread recipes', files: LAB, message: 'Initial commit', author: 'Sam Okafor <sam@example.com>' })
  hubCommit(w, h, 'main', { 'recipes/rye.md': RYE }, 'Add rye recipe', 'sam')
  return h
}
/** Fork + clone + upstream remote, all in sync. Clears history so `ran` checks only see the learner. */
function seedTriangle(w: World) {
  const up = seedUpstream(w)
  forkRepo(w, UP, w.user.handle)
  sh(w, `git clone ${hubUrl(fork(w))}`, `cd ~/${R}`, `git remote add upstream ${hubUrl(UP)}`, 'git fetch upstream')
  w.history.length = 0
  return up
}

const forkClone = `
You found **bread-lab**, a community collection of bread recipes that Sam maintains on GitHub. Your ciabatta has been perfect for months and you want to add it. So you clone \`octo-org/bread-lab\`, commit the recipe, push, and get:

\`\`\`bash
$ git push
remote: Permission to octo-org/bread-lab.git denied to you.
fatal: unable to access 'https://github.com/octo-org/bread-lab.git/'
\`\`\`

Of course. In Modules 4 and 5 you pushed to \`sunrise-bakery\` because you own it. Sam does not know you. Nobody gets write access to an open-source project just for asking, and that is a feature: it is how a project with thousands of contributors stays safe. So how does anyone contribute?

## The triangle

You make your own copy *on GitHub*, where you do have write access. That copy is a **fork**. You push to your fork, and then ask the project to pull from it. Three copies of the project are now in play:

\`\`\`figure
   octo-org/bread-lab  ─────── Fork (hub button) ───────▶  you/bread-lab
   Sam's. Read-only for you.                              Yours. Push freely.
   remote name: upstream                                   remote name: origin
          │                                                      ▲   │
          │ git fetch upstream                 git push origin   │   │ git clone
          ▼                                                      │   ▼
                            ~/bread-lab   (your laptop)
caption: Changes flow around the triangle: upstream → local → origin → pull request → upstream.
\`\`\`

| Copy | Lives | Who writes | Remote name in your clone |
|---|---|---|---|
| **upstream** | GitHub, \`octo-org/bread-lab\` | Sam and the maintainers | \`upstream\` |
| **origin** (your fork) | GitHub, \`you/bread-lab\` | You | \`origin\` |
| **local** | \`~/bread-lab\` | You | — |

The names \`origin\` and \`upstream\` are only conventions, but every README, blog post and error message assumes them, so use them.

## Step 1: fork, in the browser

Forking is a GitHub action, not a Git command. Open \`octo-org/bread-lab\` in the hub pane and click **Fork**. A second later \`you/bread-lab\` exists, with every branch and commit copied, and a small "forked from octo-org/bread-lab" line under the name. Nothing was downloaded to your laptop yet.

## Step 2: clone *your fork*

\`\`\`bash
$ cd ~
$ git clone https://github.com/you/bread-lab.git
Cloning into 'bread-lab'...
remote: Enumerating objects: 6, done.
Receiving objects: 100% (6/6), done.
Resolving deltas: 100% (2/2), done.
\`\`\`

Clone the fork, not the original. \`clone\` names whatever it cloned \`origin\` and makes \`main\` track \`origin/main\`, and you want both of those to point at the copy you can push to.

## Step 3: tell Git about the original

Your clone knows about your fork and nothing else. Add the original project as a second remote:

\`\`\`bash
$ cd bread-lab
$ git remote add upstream https://github.com/octo-org/bread-lab.git
$ git remote -v
origin    https://github.com/you/bread-lab.git (fetch)
origin    https://github.com/you/bread-lab.git (push)
upstream  https://github.com/octo-org/bread-lab.git (fetch)
upstream  https://github.com/octo-org/bread-lab.git (push)
\`\`\`

\`git remote -v\` is the map of your triangle. When something about a fork confuses you, run it first.

## Step 4: fetch upstream

\`\`\`bash
$ git fetch upstream
From https://github.com/octo-org/bread-lab
 * [new branch]      main       -> upstream/main
\`\`\`

Now your repository holds a third \`main\`: \`upstream/main\`, a read-only bookmark of where Sam's project is. \`git log --oneline --all\` shows all three sitting on the same commit today. They will drift apart, and the next two lessons are about what to do when they do.

> **Why**
> Every open-source contribution you will ever make starts with these four steps. GitHub, GitLab and Codeberg all use the same fork model, and \`origin\`/\`upstream\` is the vocabulary maintainers use in their CONTRIBUTING files. Set the triangle up once per project and the rest is the Git you already know.

## Gotchas

- **Cloned the original by accident?** Then \`origin\` is read-only and your first push fails. Fix it without re-cloning: \`git remote rename origin upstream\`, then \`git remote add origin https://github.com/you/bread-lab.git\`.
- \`git fetch upstream\` changes none of your files. It only updates \`upstream/*\` bookmarks. Merging is a separate decision.
- The upstream URL lists an \`(push)\` line like any other remote, but pushing there is still denied. Git prints the URL; GitHub decides the permission.

## Up next

Sam keeps adding recipes. Your fork does not follow along by itself, so next you learn to pull upstream's changes through your local clone and into your fork.
`

const sync = `
A week passes. Sam merges a brioche recipe into \`octo-org/bread-lab\`. You open your fork on GitHub and it still shows three recipes, with a quiet line at the top: *This branch is 1 commit behind octo-org:main.*

A fork is a **copy**, not a mirror. GitHub made it once, at the moment you clicked Fork, and has not touched it since. Keeping it current is your job, and the job is small once you see which of the three \`main\`s has moved.

## Three mains, one ahead

\`\`\`figure
   upstream/main    a1f3c0e ── 4e1f0a2 ── 9c7d3b1   "Add brioche recipe"   ◀── Sam pushed here
   origin/main      a1f3c0e ── 4e1f0a2                                       ◀── your fork, stale
   main (local)     a1f3c0e ── 4e1f0a2                                       ◀── your laptop, stale
caption: Only upstream moved. Your fork and your clone are both one commit behind, and neither will notice on its own.
\`\`\`

Your laptop is the only place where all three meet, so that is where the sync happens. The route is always the same: **upstream → local → origin**.

## Step 1: fetch upstream

\`\`\`bash
$ git fetch upstream
From https://github.com/octo-org/bread-lab
   4e1f0a2..9c7d3b1  main       -> upstream/main
\`\`\`

Compare with the first lesson: no \`[new branch]\` this time, just \`old..new\`. Your \`upstream/main\` bookmark jumped forward. Your files and your \`main\` have not moved yet. Have a look:

\`\`\`bash
$ git log --oneline --all
9c7d3b1 (upstream/main) Add brioche recipe
4e1f0a2 (HEAD -> main, origin/main) Add rye recipe
a1f3c0e Initial commit
\`\`\`

The decorations tell the whole story. \`upstream/main\` is one ahead; \`main\` and \`origin/main\` are together, behind.

## Step 2: bring it into local main

You have not committed anything on \`main\` (and in a fork you should not; more on that below), so the merge is a plain fast-forward:

\`\`\`bash
$ git switch main
$ git merge upstream/main
Updating 4e1f0a2..9c7d3b1
Fast-forward
 recipes/brioche.md | 4 ++++
 1 file changed, 4 insertions(+)
\`\`\`

No merge commit, no conflict, just your \`main\` label sliding up to where \`upstream/main\` already was. \`git rebase upstream/main\` gives the identical result here, and \`git pull upstream main\` does the fetch and the merge in one command. Pick whichever you will remember.

## Step 3: push to your fork

\`\`\`bash
$ git push
To https://github.com/you/bread-lab.git
   4e1f0a2..9c7d3b1  main -> main
\`\`\`

\`main\` tracks \`origin/main\`, so a bare \`git push\` goes to your fork. Now all three \`main\`s point at \`9c7d3b1\` and the "1 commit behind" banner disappears.

> **Tip**
> GitHub's **Sync fork** button does steps 1 and 2 *on the server*, moving your fork's \`main\` to match upstream. Your laptop is still behind afterwards, so you follow it with \`git pull\`. Same triangle, different starting corner.

> **Why**
> "My pull request has conflicts" is, nine times out of ten, a stale fork. You branched from a \`main\` that was already weeks old, and by review time the files had moved underneath you. Sync *before* you start a branch, and your pull requests land cleanly far more often.

## Gotchas

- **Do not commit on \`main\` in a fork.** Keep it a pure copy of \`upstream/main\`. The moment you add your own commits there, every sync becomes a real merge and your pull requests drag unrelated commits along. Feature work goes on branches.
- \`git pull\` with no arguments pulls from \`origin\`, your own stale fork, and cheerfully reports *Already up to date.* The news is on \`upstream\`.
- \`git fetch upstream\` never changes \`main\` or your files. If the brioche file is missing after fetching, you skipped the merge.

## Up next

Your fork is current, which is exactly when to start a branch. Next you add the ciabatta recipe and send your first pull request to a project you cannot push to.
`

const contribute = `
Fork made, upstream wired, \`main\` current. Time to add the ciabatta.

Before touching a file, read the project's \`CONTRIBUTING.md\`. Bread-lab's is three lines, and most are not much longer: one change per pull request, copy the existing format, be patient. Following a project's conventions is the single biggest factor in whether a maintainer merges your work or quietly closes it. Sam reviews bread-lab after work; a small, tidy pull request that looks like the rest of the repo gets merged, and a sprawling one gets a sigh.

## The round trip

\`\`\`figure
   you/bread-lab : add-ciabatta  ────── pull request ──────▶  octo-org/bread-lab : main
            ▲                                                           │
            │ git push -u origin add-ciabatta              Sam: Squash and merge
            │                                                           ▼
   ~/bread-lab : add-ciabatta                                    upstream/main
            │                                                           │
            └──────────  git fetch upstream + git merge upstream/main  ◀┘
caption: Your commit travels local → fork → upstream, then comes back around as Sam's squash commit.
\`\`\`

## Branch, commit, push to the fork

Exactly like Module 5, except the push goes to \`origin\`, which is *your* fork:

\`\`\`bash
$ git switch -c add-ciabatta
Switched to a new branch 'add-ciabatta'
$ code recipes/ciabatta.md          # or echo >> a few lines
$ git add recipes/ciabatta.md
$ git commit -m "Add ciabatta recipe"
[add-ciabatta 7b2e4d9] Add ciabatta recipe
 1 file changed, 4 insertions(+)
$ git push -u origin add-ciabatta
To https://github.com/you/bread-lab.git
 * [new branch]      add-ciabatta -> add-ciabatta
branch 'add-ciabatta' set up to track 'origin/add-ciabatta'.
\`\`\`

The branch now exists in two places you control: your laptop and your fork. Upstream has not heard about it.

## The pull request crosses repositories

Open \`octo-org/bread-lab\` in the hub pane and start a pull request. The head is \`you:add-ciabatta\` (the colon means "the branch on *that* fork") and the base is \`octo-org:main\`. Give it the commit message as a title and a one-line body: what you changed and why it fits.

Then wait. There is no **Merge** button for you on an octo-org pull request, and that is the point. Sam reads the diff, maybe asks for a tweak, and when it is right chooses **Squash and merge**: your commits are folded into one new commit on upstream's \`main\`, with the pull request number in its message.

## Close the loop

Upstream moved, so your fork and clone are behind again. You know this dance from the last lesson:

\`\`\`bash
$ git fetch upstream
From https://github.com/octo-org/bread-lab
   9c7d3b1..e81a2f6  main       -> upstream/main
$ git switch main
$ git merge upstream/main
Updating 9c7d3b1..e81a2f6
Fast-forward
 recipes/ciabatta.md | 4 ++++
$ git push
To https://github.com/you/bread-lab.git
   9c7d3b1..e81a2f6  main -> main
\`\`\`

Your ciabatta is on \`main\` everywhere, but notice the hash: \`e81a2f6\`, not your \`7b2e4d9\`. The squash made a *new* commit with the same contents.

## Delete the branch, with a capital D

The branch has done its job. Remove the copy on your fork (GitHub offers a **Delete branch** button on the merged pull request; this is the command behind it), then the local one:

\`\`\`bash
$ git push origin --delete add-ciabatta
To https://github.com/you/bread-lab.git
 - [deleted]         add-ciabatta
$ git branch -d add-ciabatta
error: The branch 'add-ciabatta' is not fully merged.
If you are sure you want to delete it, run 'git branch -D add-ciabatta'.
$ git branch -D add-ciabatta
Deleted branch add-ciabatta (was 7b2e4d9).
\`\`\`

\`-d\` is the cautious delete: it refuses unless the branch's commits are reachable from \`main\` (or from the branch's remote copy, which is why it still works while \`origin/add-ciabatta\` exists). After a squash merge they are not: \`7b2e4d9\` appears nowhere in history except on this branch, so Git assumes you are about to lose work. You know the *contents* arrived as \`e81a2f6\`. \`-D\` is you saying so.

> **Why**
> This loop (sync, branch, push to fork, pull request, wait, sync again) is the whole of open-source contribution. The commands are ones you already had; the new part is patience and manners. Small, focused pull requests that follow the project's conventions get merged. The maintainer is a volunteer, and a thank-you costs nothing.

## Gotchas

- **Pushed to upstream by habit?** \`git push upstream add-ciabatta\` is refused. Everything you push goes to \`origin\`; only pull requests reach upstream.
- **Stale base.** If weeks pass before review and upstream moved, \`git fetch upstream\` then \`git rebase upstream/main\` on your branch and \`git push --force-with-lease\` refreshes the pull request in place, exactly as in Module 5.
- **Branched from a stale \`main\`?** Sync first (previous lesson), then branch. Fixing it afterwards is the rebase above.

## Up next

You can now contribute to any project on GitHub. The final module, **Everyday mastery**, covers the small tools that make daily work pleasant: \`.gitignore\`, \`git blame\`, and the \`git config\` settings worth setting once.
`

export const module: Module = {
  id: 'forks',
  title: 'Open source: forks and upstream',
  blurb: 'Contributing to a project you cannot push to: fork it, keep the fork in sync, and send pull requests across repositories.',
  lessons: [
    {
      id: 'forks-fork-clone',
      title: 'Fork, clone, upstream',
      tagline: 'Why forks exist, and the triangle of upstream, origin and local.',
      minutes: 9,
      article: forkClone,
      setup: (w) => { seedUpstream(w); w.cwd = HOME },
      panes: { hub: true },
      hubHome: UP,
      tasks: [
        { text: 'In the hub pane, open `octo-org/bread-lab` and click **Fork** to make your own copy.', hint: 'Hub pane → `octo-org/bread-lab` → **Fork** button', check: (w) => !!hub(w, fork(w))?.forkOf },
        { text: 'From your home folder, clone **your fork** (not the original).', hint: '`cd ~` then `git clone https://github.com/you/bread-lab.git` (with your own handle in place of `you`)', check: (w) => (repo(w, R)?.remotes.origin ?? '').includes(`/${w.user.handle}/`) },
        { text: 'Move into `bread-lab` and add the original project as a remote named `upstream`.', hint: '`cd bread-lab` then `git remote add upstream https://github.com/octo-org/bread-lab.git`', check: (w) => remoteExists(w, 'upstream', R) && (repo(w, R)?.remotes.upstream ?? '').includes(UP) },
        { text: 'List both remotes and their URLs with `git remote -v`.', hint: '`git remote -v`', check: (w) => remoteExists(w, 'upstream', R) && ran(w, /^git\s+remote\s+(-v|--verbose)\b/) },
        { text: 'Download upstream\'s history with `git fetch upstream`, then look at `git log --oneline --all`.', hint: '`git fetch upstream`', check: (w) => remoteRef(w, 'upstream/main', R) !== null },
      ],
      takeaways: ['A fork is your own copy on GitHub; it exists because you cannot push to the original.', 'Clone the fork (`origin`), then add the original as `upstream`.', '`git remote -v` shows the triangle; `git fetch upstream` fills in `upstream/main`.'],
      solution: [(w) => { forkRepo(w, UP, w.user.handle) }, 'cd ~', 'git clone https://github.com/you/bread-lab.git', 'cd bread-lab', 'git remote add upstream https://github.com/octo-org/bread-lab.git', 'git remote -v', 'git fetch upstream', 'git log --oneline --all'],
    },
    {
      id: 'forks-sync',
      title: 'Keeping your fork in sync',
      tagline: 'Forks do not update themselves: fetch upstream, fast-forward main, push to origin.',
      minutes: 8,
      article: sync,
      setup: (w) => {
        const up = seedTriangle(w)
        hubCommit(w, up, 'main', { 'recipes/brioche.md': BRIOCHE }, 'Add brioche recipe', 'sam')
      },
      panes: { hub: true },
      hubHome: `{you}/${R}`,
      tasks: [
        { text: 'Sam pushed a brioche recipe to `octo-org/bread-lab`. Fetch it with `git fetch upstream`.', hint: '`git fetch upstream`', check: (w) => remoteRef(w, 'upstream/main', R) === hubBranch(w, UP, 'main') },
        { text: 'Run `git log --oneline --all` and find which `main` is ahead.', hint: '`git log --oneline --all`', check: (w) => ran(w, /^git\s+log\b/) },
        { text: 'On `main`, fast-forward to `upstream/main` with `git merge` (or `git rebase`).', hint: '`git switch main` then `git merge upstream/main`', check: (w) => branchHash(w, 'main', R) === hubBranch(w, UP, 'main') && fileExists(w, `${R}/recipes/brioche.md`) },
        { text: 'Push `main` to your fork so it catches up too.', hint: '`git push`', check: (w) => hubBranch(w, fork(w), 'main') === hubBranch(w, UP, 'main') },
      ],
      takeaways: ['A fork is a copy, not a mirror; syncing it is your job.', 'Sync always flows upstream → local → origin: fetch, fast-forward main, push.', 'Keep `main` free of your own commits so every sync is a fast-forward.'],
      solution: ['git fetch upstream', 'git log --oneline --all', 'git switch main', 'git merge upstream/main', 'git push'],
    },
    {
      id: 'forks-pr',
      title: 'Your first open-source contribution',
      tagline: 'Branch, push to your fork, open a cross-repository pull request, then sync the squash merge back.',
      minutes: 12,
      article: contribute,
      setup: (w) => { seedTriangle(w) },
      panes: { hub: true },
      hubHome: `{you}/${R}`,
      onTick: (w, ctx) => {
        const up = hub(w, UP)
        const pr = up?.prs.find((p) => p.state === 'open' && p.head.repo === fork(w))
        if (!up || !pr || !prState(w, up, pr).mergeable) return
        ctx.once('sam-merges', () => {
          reviewPR(w, up, pr.number, 'approved', 'Lovely, and it follows the baguette format. Squashing and merging, thank you!', 'sam')
          mergePR(w, up, pr.number, 'squash', false, 'sam')
        })
      },
      tasks: [
        { text: 'Read `CONTRIBUTING.md`, then create and switch to a branch named `add-ciabatta`.', hint: '`cat CONTRIBUTING.md` then `git switch -c add-ciabatta`', check: (w) => branch(w, R) === 'add-ciabatta' },
        { text: 'Create `recipes/ciabatta.md` with at least three lines (editor or `echo >>`) and commit it as `Add ciabatta recipe`.', hint: '`echo "# Ciabatta" > recipes/ciabatta.md`, add two more lines with `echo "..." >> recipes/ciabatta.md`, then `git add recipes/ciabatta.md` and `git commit -m "Add ciabatta recipe"`', check: (w) => /ciabatta/i.test(committedFile(w, 'recipes/ciabatta.md', 'add-ciabatta', R) ?? '') },
        { text: 'Publish the branch to **your fork** with `git push -u origin add-ciabatta`.', hint: '`git push -u origin add-ciabatta`', check: (w) => hubBranch(w, fork(w), 'add-ciabatta') !== null && hubBranch(w, fork(w), 'add-ciabatta') === branchHash(w, 'add-ciabatta', R) },
        { text: 'In the hub pane, open a pull request on `octo-org/bread-lab` from `you:add-ciabatta` into `main`.', hint: 'Hub pane → `octo-org/bread-lab` → **Pull requests** → **New**, head `you:add-ciabatta`, base `main`', check: (w) => prs(w, UP).some((p) => p.head.repo === fork(w) && p.head.branch === 'add-ciabatta') },
        { text: 'Sam squash-merged it (see the notification). Bring the result into your local `main`: fetch upstream, switch to `main`, merge `upstream/main`.', hint: '`git fetch upstream`, `git switch main`, `git merge upstream/main`', check: (w) => branchHash(w, 'main', R) === hubBranch(w, UP, 'main') && committedFile(w, 'recipes/ciabatta.md', 'main', R) !== null },
        { text: 'Push `main` to your fork so all three `main`s match.', hint: '`git push`', check: (w) => hubBranch(w, fork(w), 'main') === hubBranch(w, UP, 'main') && hubFile(w, fork(w), 'recipes/ciabatta.md') !== null },
        { text: 'Delete the finished branch locally with `git branch -D add-ciabatta`.', hint: '`git branch -D add-ciabatta` (and `git push origin --delete add-ciabatta` to remove it from your fork)', check: (w) => !branchExists(w, 'add-ciabatta', R) && committedFile(w, 'recipes/ciabatta.md', 'main', R) !== null },
      ],
      takeaways: ['Read CONTRIBUTING.md first: small, focused pull requests that follow the project\'s conventions get merged.', 'Push branches to `origin` (your fork); only pull requests reach `upstream`.', 'After a squash merge, sync `main` from upstream and delete the branch with `-D`: its commits are not in `main`, but their contents are.'],
      solution: [
        'cat CONTRIBUTING.md', 'git switch -c add-ciabatta',
        'echo "# Ciabatta" > recipes/ciabatta.md', 'echo "Very wet dough, 80% hydration, long cold ferment." >> recipes/ciabatta.md', 'echo "Handle gently to keep the open crumb. Bake hot with steam." >> recipes/ciabatta.md',
        'git add recipes/ciabatta.md', 'git commit -m "Add ciabatta recipe"', 'git push -u origin add-ciabatta',
        (w) => { openPR(w, UP, { title: 'Add ciabatta recipe', body: 'Follows the baguette format. Tested in a home oven.', headRepo: fork(w), headBranch: 'add-ciabatta', base: 'main' }) },
        'git fetch upstream', 'git switch main', 'git merge upstream/main', 'git push', 'git branch -D add-ciabatta',
      ],
    },
  ],
}
