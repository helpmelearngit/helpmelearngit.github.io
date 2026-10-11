import type { Module } from '../types'
import type { World } from '../../engine/world'
import { sh, seedRepo, seedBranch, type SeedCommit, branch, branchExists, branchHash, isMergeCommit, committedFile, fileHas, file, hasConflictMarkers, clean, conflicts, opInProgress, ran } from '../helpers'

const REPO = 'sunrise-bakery'
const MENU = `${REPO}/menu.md`
const MAYA = 'Maya Chen <maya@example.com>'

const BAKERY = {
  'README.md': '# Sunrise Bakery\n\nFresh bread, every morning since 2019.\n',
  'menu.md': '# Menu\n\n- Sourdough loaf — $7\n- Croissant — $3.50\n',
  'hours.txt': 'Mon-Fri 7am-3pm\nSat 8am-1pm\n',
}
const MENU_3 = BAKERY['menu.md'] + '- Cinnamon roll — $4\n'
const MENU_4 = MENU_3 + '- Pumpkin loaf — $8\n'
const MENU_5 = MENU_4 + '- Almond croissant — $4.50\n'

/** Where module 1 left the repo: four commits on main. */
const BASE: SeedCommit[] = [
  { msg: 'Add project README', files: { 'README.md': BAKERY['README.md'] } },
  { msg: 'Add menu and opening hours', files: { 'menu.md': BAKERY['menu.md'], 'hours.txt': BAKERY['hours.txt'] } },
  { msg: 'Add cinnamon roll to menu', files: { 'menu.md': MENU_3 } },
  { msg: 'Add Sunday closure to hours', files: { 'hours.txt': BAKERY['hours.txt'] + 'Sun closed\n' } },
]
const PUMPKIN: SeedCommit = { msg: 'Add pumpkin loaf to menu', files: { 'menu.md': MENU_4 } }
const TAX: SeedCommit = { msg: 'Note that prices include tax', files: { 'README.md': BAKERY['README.md'] + '\nAll prices include tax.\n' } }
const ALMOND: SeedCommit = { msg: 'Add almond croissant to menu', author: MAYA, files: { 'menu.md': MENU_5 } }

const count = (w: World, re: RegExp) => w.history.filter((c) => re.test(c)).length
const GRAPH = /^git\s+log\b(?=.*--graph)(?=.*--all)/

const create = `
Autumn is coming and you want to try a seasonal menu: pumpkin loaf, maybe a spiced latte. But Maya publishes the website straight from the repository every morning, and a half-finished menu must not go live. You need somewhere to work that is *inside* the project, with full history, yet invisible to the website until you say so.

That place is a **branch**. Every repository has had one since \`git init\`: it is called \`main\`, and you have been committing to it all along.

## A branch is a name for a commit

Here is the whole secret. A branch is a tiny file in \`.git/refs/heads/\` that contains one commit hash. That is all. \`main\` is a 41-byte note saying "the latest commit on this line of work is \`9c4b2a1\`".

\`\`\`figure
 3f2a9c1 ◀── 8c1d2e4 ◀── 5e6f7a8 ◀── 9c4b2a1 ◀── main ◀── HEAD
                                        ▲
                                        └── autumn-menu
caption: Two branches, one commit. Both names point at 9c4b2a1 right after git switch -c. HEAD says which name you are "on".
\`\`\`

Three rules follow from "a branch is a pointer":

1. **HEAD points at the current branch.** \`cat .git/HEAD\` prints \`ref: refs/heads/main\`. That is how Git knows which pointer to move when you commit.
2. **Committing moves the current branch forward** to the new commit. Other branches stay exactly where they were.
3. **Switching branches rewrites your working tree** so the files match the commit the other branch points at. Nothing is lost; the files are swapped on disk.

\`\`\`figure
 ... ◀── 9c4b2a1 ◀── main
            ▲
            └── 5d7e1f2 ◀── autumn-menu ◀── HEAD
                "Add pumpkin loaf to menu"
caption: After one commit on autumn-menu. main did not move. The pumpkin loaf exists only on the branch.
\`\`\`

## The commands

\`git branch\` lists branches. The star marks the one HEAD points at.

\`\`\`bash
$ git branch
* main
\`\`\`

\`git switch -c <name>\` creates a branch at the current commit and moves HEAD onto it, in one step (\`-c\` for *create*):

\`\`\`bash
$ git switch -c autumn-menu
Switched to a new branch 'autumn-menu'
$ git branch
* autumn-menu
  main
\`\`\`

Now commit as usual. Watch the first line of the output: it names the branch that moved.

\`\`\`bash
$ echo "- Pumpkin loaf — $8" >> menu.md
$ git add menu.md
$ git commit -m "Add pumpkin loaf to menu"
[autumn-menu 5d7e1f2] Add pumpkin loaf to menu
 1 file changed, 1 insertion(+)
\`\`\`

\`git log\` shows only the history behind HEAD. Add \`--all\` to see every branch at once:

\`\`\`bash
$ git log --oneline --all
5d7e1f2 (HEAD -> autumn-menu) Add pumpkin loaf to menu
9c4b2a1 (main) Add Sunday closure to hours
5e6f7a8 Add cinnamon roll to menu
8c1d2e4 Add menu and opening hours
3f2a9c1 Add project README
\`\`\`

The parentheses are the pointers. \`main\` is still on the Sunday-closure commit; \`autumn-menu\` (and HEAD) moved on.

Switching back is \`git switch <name>\`. Look at the menu afterwards:

\`\`\`bash
$ git switch main
Switched to branch 'main'
$ cat menu.md
# Menu

- Sourdough loaf — $7
- Croissant — $3.50
- Cinnamon roll — $4
\`\`\`

No pumpkin loaf. Git swapped \`menu.md\` for the version \`main\` points at. The website could publish from here safely. \`git switch autumn-menu\` brings the line straight back.

> **Note**
> Older tutorials write \`git checkout -b autumn-menu\` and \`git checkout main\`. They do the same thing; \`checkout\` also had a dozen other jobs, so \`switch\` was added in 2019 to mean exactly one. Both work in this terminal.

> **Why**
> Because a branch is a 41-byte file, creating one costs nothing. Experienced developers make a branch for *every* piece of work, even a one-line fix, so that \`main\` always holds something they would be happy to publish. Everything in Modules 4 and 5 (sharing work, pull requests, code review) is built on this habit.

## Gotchas

- **Committing on the wrong branch** is the classic slip. The first line of \`git status\` says \`On branch ...\`. Read it before you commit.
- \`git switch\` refuses if you have uncommitted edits that the other branch would overwrite: *Your local changes to the following files would be overwritten by checkout*. Commit first (or stash, in Module 3). Edits to files the two branches agree on travel with you unharmed.
- \`git switch -\` (a dash) jumps back to the branch you were on before. Handy when bouncing between two.

## Up next

\`autumn-menu\` is one commit ahead of \`main\`. Bringing that commit over is called a **merge**, and the simplest kind is next.
`

const ffMerge = `
Maya tasted the pumpkin loaf. It is on the menu for good. Now the commit on \`autumn-menu\` needs to reach \`main\`, where the website is published from.

Since you made the branch, nobody has touched \`main\`. That makes this the easiest merge there is, and the one you will do most often.

## Nothing to combine, just a pointer to move

Look at the two branches. \`main\` points at \`9c4b2a1\`. \`autumn-menu\` points at \`5d7e1f2\`, whose parent is \`9c4b2a1\`. Every commit on \`main\` is already part of \`autumn-menu\`'s history; \`main\` is simply *behind*.

\`\`\`figure
 before:   ... ◀── 9c4b2a1 ◀── 5d7e1f2
                      ▲           ▲
                     main      autumn-menu

 after:    ... ◀── 9c4b2a1 ◀── 5d7e1f2
                                  ▲
                            main, autumn-menu
caption: A fast-forward. No new commit; the main pointer slides forward to catch up.
\`\`\`

Git notices this and does the obvious thing: it moves the \`main\` pointer forward to \`5d7e1f2\`. No new commit is created, no files are combined. This is a **fast-forward** merge.

## The commands

A merge always brings another branch *into the branch you are on*. So first make sure you stand on \`main\`, then look at the shape of the history. \`--graph\` draws the lines of history on the left:

\`\`\`bash
$ git switch main
Switched to branch 'main'
$ git log --oneline --all --graph
* 5d7e1f2 (autumn-menu) Add pumpkin loaf to menu
* 9c4b2a1 (HEAD -> main) Add Sunday closure to hours
* 5e6f7a8 Add cinnamon roll to menu
* 8c1d2e4 Add menu and opening hours
* 3f2a9c1 Add project README
\`\`\`

A single straight line: one star per commit, and \`autumn-menu\` sitting one step above \`main\`. Now merge:

\`\`\`bash
$ git merge autumn-menu
Updating 9c4b2a1..5d7e1f2
Fast-forward
 menu.md   |  1 +
 1 file changed, 1 insertion(+)
\`\`\`

\`Updating 9c4b2a1..5d7e1f2\` is Git saying: I moved \`main\` from here to there. The stat lines show what arrived in your working tree. Check:

\`\`\`bash
$ cat menu.md
# Menu

- Sourdough loaf — $7
- Croissant — $3.50
- Cinnamon roll — $4
- Pumpkin loaf — $8
$ git log --oneline --all --graph
* 5d7e1f2 (HEAD -> main, autumn-menu) Add pumpkin loaf to menu
* 9c4b2a1 Add Sunday closure to hours
* 5e6f7a8 Add cinnamon roll to menu
\`\`\`

Both names now sit on the same commit. The commit hash did not change: \`5d7e1f2\` is the very same snapshot you made on the branch. The merge created nothing; it only moved a name.

> **Why**
> Fast-forwards keep history a straight line, which is the easiest kind to read. When a pull request on GitHub is "up to date with main", merging it is a fast-forward. Some teams prefer a visible record of every merge and use \`git merge --no-ff\`, which forces a merge commit even here; \`git merge --ff-only\` does the opposite and refuses anything that is not a fast-forward. Both are worth knowing exist.

## Gotchas

- **Direction matters.** You merge *into* the current branch. Standing on \`autumn-menu\` and running \`git merge main\` prints \`Already up to date.\` because \`autumn-menu\` already contains everything on \`main\`.
- **Merging does not delete the branch.** \`autumn-menu\` still exists, pointing at the same commit as \`main\`. Cleaning up is the last lesson of this module.
- **Dirty working tree.** If you have uncommitted edits to a file the merge would change, Git refuses with *Please commit your changes or stash them before you merge*. Commit first.

## Up next

This was easy because \`main\` stood still. Next: what Git does when *both* branches have moved.
`

const threeWay = `
You started a branch called \`pricing\` to add a line to the README: *All prices include tax.* Meanwhile, Maya kept working and committed an almond croissant to the menu on \`main\`. Both branches have moved since they parted ways. No pointer can simply slide forward this time.

## Three commits that matter

To combine two lines of work, Git looks at three snapshots:

| Name | Which commit | In our story |
|---|---|---|
| **merge base** | the last commit both branches share | the pumpkin loaf commit |
| **ours** | the tip of the branch you are on | Maya's almond croissant |
| **theirs** | the tip of the branch you are merging in | your README note |

Git works out what changed from base to ours (a menu line was added) and from base to theirs (a README line was added), then applies both sets of changes to the base. The result is a snapshot that neither branch has, so it needs a new commit to live in: a **merge commit**, with *two* parents.

\`\`\`figure
                     ┌── 7a1c3d5 (pricing)  "Note that prices include tax"
 ... ◀── 5d7e1f2 ◀───┤
          base       └── 9f3b2e8 (main)     "Add almond croissant to menu"

 after git merge pricing:

                     ┌── 7a1c3d5 ◀──────────┐
 ... ◀── 5d7e1f2 ◀───┤                      ├── c2e4a6f (HEAD -> main)  "Merge branch 'pricing'"
                     └── 9f3b2e8 ◀──────────┘
caption: A three-way merge. The merge commit has two parents and ties the two lines of history back together.
\`\`\`

## The commands

Start by looking at the shape. The two tips are on different lanes:

\`\`\`bash
$ git log --oneline --all --graph
*   9f3b2e8 (HEAD -> main) Add almond croissant to menu
| * 7a1c3d5 (pricing) Note that prices include tax
*   5d7e1f2 Add pumpkin loaf to menu
*   9c4b2a1 Add Sunday closure to hours
\`\`\`

You can ask Git which commit is the base; it is the one the lanes rejoin at:

\`\`\`bash
$ git merge-base main pricing
5d7e1f2a9c4b2a18c1d2e43f2a9c15e6f7a8b0c1
\`\`\`

Now merge. The output is different from the fast-forward:

\`\`\`bash
$ git merge pricing
Merge made by the 'ort' strategy.
 README.md |  2 ++
 1 file changed, 2 insertions(+)
\`\`\`

*ort* is the name of Git's merge algorithm; the line simply means "I had to combine things and I created a merge commit for you". Git wrote the message itself: \`Merge branch 'pricing'\`. Look at the result:

\`\`\`bash
$ git show HEAD
commit c2e4a6f... (HEAD -> main)
Merge: 9f3b2e8 7a1c3d5
Author: You <you@example.com>
Date:   Mon Oct 5 09:36:01 2026 +0000

    Merge branch 'pricing'

$ git log --oneline --all --graph
*   c2e4a6f (HEAD -> main) Merge branch 'pricing'
* | 9f3b2e8 Add almond croissant to menu
| * 7a1c3d5 (pricing) Note that prices include tax
*   5d7e1f2 Add pumpkin loaf to menu
\`\`\`

The \`Merge:\` line lists both parents. In the graph, two lanes flow into the merge commit and \`main\` now contains the almond croissant *and* the tax note. \`cat README.md\` and \`cat menu.md\` to convince yourself.

> **Why**
> Every pull request you will merge on GitHub (Module 5) that is not a fast-forward produces exactly this commit. Being able to read "two parents, two lanes" in a graph is what lets you answer questions like *when did this change reach main?* and *which branch did it come from?* long after everyone has forgotten.

## Gotchas

- **Nothing of yours is lost.** Beginners see a new commit appear and worry their work was replaced. The merge commit contains both sides; check with \`cat\`.
- **The message is prepared for you.** Leave \`-m\` off and Git uses \`Merge branch 'pricing'\`. Pass \`-m "..."\` only if you want to say more.
- **Git combined files it never read.** It only knows lines. When both branches change different lines of the same file, it still merges cleanly, because the line changes do not overlap. When they *do* overlap, Git stops and asks you. That is the next lesson.

## Up next

Two people, one line, two different edits. Git will not guess; you will resolve your first **conflict**.
`

const conflict = `
Butter prices went up. You made a branch called \`price-update\` and raised the croissant to \`$4.00\`. Maya, not knowing, raised the same croissant to \`$3.75\` directly on \`main\`. Same file, same line, two different answers. Git has no way to know which is right, and it will not guess. It stops and asks you.

## What a conflict looks like

\`\`\`bash
$ git merge price-update
Auto-merging menu.md
CONFLICT (content): Merge conflict in menu.md
Automatic merge failed; fix conflicts and then commit the result.
\`\`\`

Git is now *in the middle of a merge*. It merged everything it could and wrote the disputed part into the file with **conflict markers**:

\`\`\`figure
  # Menu

  - Sourdough loaf — $7
  <<<<<<< HEAD                 ← from here: your side (ours), what main had
  - Croissant — $3.75
  =======                      ← the divider
  - Croissant — $4.00
  >>>>>>> price-update         ← to here: their side, the branch being merged in
  - Cinnamon roll — $4
  - Pumpkin loaf — $8
  - Almond croissant — $4.50
caption: Everything outside the markers merged fine. Only the lines between <<<<<<< and >>>>>>> need a human.
\`\`\`

\`git status\` tells you where you stand and, as always, what to do next:

\`\`\`bash
$ git status
On branch main
You have unmerged paths.
  (fix conflicts and run "git commit")
  (use "git merge --abort" to abort the merge)

Unmerged paths:
  (use "git add <file>..." to mark resolution)
	both modified:   menu.md
\`\`\`

## Resolving in three steps

**1. Edit the file so it says what you want.** Open it in the editor pane with \`code menu.md\`. Delete the three marker lines and keep *one* croissant line: Maya's price, yours, or a new compromise. Save. The file must end up looking like a normal menu with no \`<<<<<<<\`, \`=======\` or \`>>>>>>>\` anywhere. (If you prefer the terminal, rebuild the file with \`echo "..." > menu.md\` followed by \`echo "..." >> menu.md\` for each line.)

**2. Tell Git the file is resolved with \`git add\`.** Git cannot tell the difference between "I fixed it" and "I have not looked yet", so staging the file is how you say *done*:

\`\`\`bash
$ git add menu.md
$ git status
On branch main
All conflicts fixed but you are still merging.
  (use "git commit" to conclude merge)

Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
	modified:   menu.md
\`\`\`

**3. Commit.** No \`-m\` is needed: Git already prepared the message \`Merge branch 'price-update'\`.

\`\`\`bash
$ git commit
[main 3b9e0c2] Merge branch 'price-update'
 1 file changed, 1 insertion(+), 1 deletion(-)
\`\`\`

That is a normal merge commit with two parents, exactly like the last lesson. The only difference is that a human chose the contents of one line.

## The escape hatch

Overwhelmed, or realise you merged the wrong branch? \`git merge --abort\` throws the half-finished merge away and puts every file back as it was before you typed \`git merge\`. Nothing is lost; both branches still exist, untouched. You can always try again later.

> **Why**
> A conflict is not an error and not a sign anyone did something wrong. It is Git being honest about the one thing it cannot do: decide which of two human intentions wins. Most conflicts take under a minute once you can read the markers. On a team (Module 5), the habit is to merge \`main\` into your branch often, so conflicts stay small and fresh.

## Gotchas

- **Committed markers.** If you \`git add\` without removing every \`<<<<<<<\`, \`=======\` and \`>>>>>>>\`, Git happily commits them and your menu is now garbage. Always \`cat\` the file before adding.
- \`git commit\` **refuses** while a file is still unmerged: *Committing is not possible because you have unmerged files.* Edit, \`git add\`, then commit. \`-m\` does not skip the add step.
- **Who was right?** Git resolved the mechanics; the price is a question for Maya. When in doubt, ask before you pick a side.

## Up next

You now have several branches that have done their job. Time to clean up and learn to read a busier graph.
`

const cleanup = `
A few weeks in, \`git branch\` lists six names. \`autumn-menu\` and \`pricing\` were merged long ago. \`price-update\` too. \`experiment\` was a gluten-free loaf that nobody liked. \`tmp\` was supposed to be the holiday menu but you never named it properly. Time to tidy up.

## Deleting a name deletes nothing else

Remember: a branch is a pointer. Deleting it removes the *name*, not the commits. If those commits are reachable from another branch (because you merged them into \`main\`), they are exactly as safe as before. Git protects you by checking this.

\`\`\`figure
 ... ◀── 5d7e1f2 ◀── 9f3b2e8 ◀── c2e4a6f ◀── main
            ▲
            └── autumn-menu           ← merged: every commit it names is behind main. Safe to delete.

 ... ◀── c2e4a6f ◀── main
            ▲
            └── 8e2f1a0 ◀── experiment   ← NOT merged: 8e2f1a0 is reachable only through this name.
caption: "Fully merged" means the branch tip is an ancestor of your current commit.
\`\`\`

## The commands

\`git branch -d <name>\` deletes a branch that is fully merged into the branch you are on. It confirms with the hash the name used to point at:

\`\`\`bash
$ git branch -d autumn-menu
Deleted branch autumn-menu (was 5d7e1f2).
$ git branch -d pricing price-update
Deleted branch pricing (was 7a1c3d5).
Deleted branch price-update (was 4d8c0b3).
\`\`\`

Try it on the unmerged experiment and Git stops you:

\`\`\`bash
$ git branch -d experiment
error: The branch 'experiment' is not fully merged.
If you are sure you want to delete it, run 'git branch -D experiment'.
\`\`\`

This is a real safeguard: the gluten-free commit exists only on that branch. If you really are done with it, the capital \`-D\` means *I know, delete it anyway*:

\`\`\`bash
$ git branch -D experiment
Deleted branch experiment (was 8e2f1a0).
\`\`\`

The commit is now unreachable. Git keeps unreachable commits around for a while and Module 3 shows how \`git reflog\` can bring one back, but treat \`-D\` as permanent.

Renaming is \`git branch -m <old> <new>\` (\`-m\` for *move*). The commits, the history, nothing changes but the label:

\`\`\`bash
$ git branch -m tmp holiday-menu
$ git branch
  holiday-menu
* main
\`\`\`

To rename the branch you are standing on, leave out the old name: \`git branch -m better-name\`.

## Reading the graph

\`git log --oneline --graph --all\` is the view you will reach for in every later module. Read it like this:

\`\`\`bash
$ git log --oneline --graph --all
*     6b1d9e7 (holiday-menu) Add gingerbread to holiday menu
*     e3a7c21 (HEAD -> main) Merge branch 'price-update'
* |   c2e4a6f Merge branch 'pricing'
* | | 9f3b2e8 Add almond croissant to menu
| * | 4d8c0b3 Raise croissant price to $3.75
|   * 7a1c3d5 Note that prices include tax
*     5d7e1f2 Add pumpkin loaf to menu
*     9c4b2a1 Add Sunday closure to hours
\`\`\`

- Each \`*\` is one commit, newest at the top. The left column is \`main\`'s own line.
- Every extra column of \`|\` is a lane: a side branch whose commits have not been listed yet. A lane opens at a merge commit (its second parent) and closes at the row where that branch's commit finally appears.
- Read bottom-up to see the story: pumpkin loaf, then two branches fork off, \`main\` gets the almond croissant, and two merge commits fold the branches back in.
- Names in parentheses are pointers. \`HEAD -> main\` is where you stand; \`holiday-menu\` is one commit ahead of it.

The **graph pane** draws the same thing with curves and colours. Flip between the two until the ASCII version reads as easily as the picture.

> **Why**
> A short branch list is a true picture of what is in flight. On a team, every stale branch is a question (*is this still being worked on?*) that somebody has to ask. GitHub can delete a branch automatically when its pull request merges (Module 5); locally, \`-d\` after each merge keeps the habit.

## Gotchas

- **You cannot delete the branch you are on.** Switch to \`main\` first.
- \`-d\` **checks against the current branch**, not against \`main\`. Standing on \`holiday-menu\`, deleting a branch merged only into \`main\` is refused. Stand on \`main\` to clean up.
- \`-D\` **does not ask twice.** Run \`git log <name>\` first if you are not sure what you are throwing away.

## Up next

You can create, merge and delete lines of history. Module 3 goes backwards in time: undoing commits with \`reset\` and \`revert\`, rewriting a branch with \`rebase\`, and the \`reflog\` safety net.
`

export const module: Module = {
  id: 'branches',
  title: 'Branches',
  blurb: 'Work on several versions of the project at once, then merge them back together, conflicts included.',
  lessons: [
    {
      id: 'branches-create',
      title: 'A branch is a pointer',
      tagline: 'What a branch really is, how HEAD follows it, and how switching swaps your files.',
      minutes: 10,
      article: create,
      setup: (w) => { seedRepo(w, REPO, BASE) },
      tasks: [
        { text: 'List the branches with `git branch`. There is only one, and the star marks it.', hint: '`git branch`', check: (w) => ran(w, /^git\s+branch(\s+-\S+)*\s*$/) },
        { text: 'Create a branch called `autumn-menu` and switch to it in one step.', hint: '`git switch -c autumn-menu` (or the older `git checkout -b autumn-menu`)', check: (w) => branch(w, REPO) === 'autumn-menu' },
        { text: 'Add the line `- Pumpkin loaf — $8` to the end of `menu.md` and commit it as `Add pumpkin loaf to menu`.', hint: '`echo "- Pumpkin loaf — $8" >> menu.md`, then `git add menu.md` and `git commit -m "Add pumpkin loaf to menu"`', check: (w) => /pumpkin/i.test(committedFile(w, 'menu.md', 'autumn-menu', REPO) ?? '') && !/pumpkin/i.test(committedFile(w, 'menu.md', 'main', REPO) ?? '') },
        { text: 'Run `git log --oneline --all` and find both pointers: `autumn-menu` is one commit ahead of `main`.', hint: '`git log --oneline --all`', check: (w) => ran(w, /^git\s+log\b.*--all/) && /pumpkin/i.test(committedFile(w, 'menu.md', 'autumn-menu', REPO) ?? '') },
        { text: 'Switch back to `main` and `cat menu.md`: the pumpkin loaf line is gone.', hint: '`git switch main` then `cat menu.md`', check: (w) => branch(w, REPO) === 'main' && !fileHas(w, MENU, /pumpkin/i) },
        { text: 'Switch to `autumn-menu` again and confirm the line is back.', hint: '`git switch autumn-menu` (or `git switch -`) then `cat menu.md`', check: (w) => branch(w, REPO) === 'autumn-menu' && fileHas(w, MENU, /pumpkin/i) },
      ],
      takeaways: ['A branch is a movable name for one commit; HEAD names the branch you are on.', 'Committing moves only the current branch; `git switch -c` creates and switches in one go.', 'Switching branches swaps the files in your working tree to match that branch\'s commit.'],
      solution: ['git branch', 'git switch -c autumn-menu', 'echo "- Pumpkin loaf — $8" >> menu.md', 'git add menu.md', 'git commit -m "Add pumpkin loaf to menu"', 'git log --oneline --all', 'git switch main', 'cat menu.md', 'git switch autumn-menu', 'cat menu.md'],
    },
    {
      id: 'branches-ff-merge',
      title: 'Fast-forward merge',
      tagline: 'When main has not moved, merging just slides the pointer forward.',
      minutes: 7,
      article: ffMerge,
      setup: (w) => { seedRepo(w, REPO, BASE); seedBranch(w, REPO, 'autumn-menu', 'main', [PUMPKIN]) },
      tasks: [
        { text: 'You are on `main`. Look at both branches with `git log --oneline --all --graph`.', hint: '`git log --oneline --all --graph`', check: (w) => ran(w, /^git\s+log\b.*--all/) },
        { text: 'Merge `autumn-menu` into `main`.', hint: '`git merge autumn-menu`', check: (w) => branch(w, REPO) === 'main' && branchHash(w, 'main', REPO) === branchHash(w, 'autumn-menu', REPO) && !isMergeCommit(w, REPO) && /pumpkin/i.test(committedFile(w, 'menu.md', 'main', REPO) ?? '') },
        { text: 'Check `menu.md`: the pumpkin loaf is on `main` now.', hint: '`cat menu.md`', check: (w) => ran(w, /^cat\s+menu\.md/) && fileHas(w, MENU, /pumpkin/i) && branch(w, REPO) === 'main' },
        { text: 'Run the graph log again and notice both names on the same commit, with no new commit created.', hint: '`git log --oneline --all --graph`', check: (w) => count(w, /^git\s+log\b.*--all/) >= 2 && branchHash(w, 'main', REPO) === branchHash(w, 'autumn-menu', REPO) },
      ],
      takeaways: ['`git merge <branch>` brings that branch into the one you are standing on.', 'If the current branch has not moved, the merge is a fast-forward: no new commit, just a pointer move.', '`git log --oneline --all --graph` shows every branch and the shape of history.'],
      solution: ['git log --oneline --all --graph', 'git merge autumn-menu', 'cat menu.md', 'git log --oneline --all --graph'],
    },
    {
      id: 'branches-three-way',
      title: 'Three-way merge',
      tagline: 'Both branches moved: the merge base, the merge commit, and why it has two parents.',
      minutes: 9,
      article: threeWay,
      setup: (w) => {
        seedRepo(w, REPO, [...BASE, PUMPKIN])
        seedBranch(w, REPO, 'pricing', 'main', [TAX])
        seedRepo(w, REPO, [ALMOND])
      },
      tasks: [
        { text: 'Look at the shape of history with `git log --oneline --all --graph`: `main` and `pricing` sit on different lanes.', hint: '`git log --oneline --all --graph`', check: (w) => ran(w, /^git\s+log\b.*--all/) },
        { text: 'Ask Git for the merge base of the two branches.', hint: '`git merge-base main pricing`', check: (w) => ran(w, /^git\s+merge-base\s/) },
        { text: 'Merge `pricing` into `main`.', hint: '`git merge pricing`', check: (w) => branch(w, REPO) === 'main' && isMergeCommit(w, REPO) && /tax/i.test(committedFile(w, 'README.md', 'main', REPO) ?? '') && /almond/i.test(committedFile(w, 'menu.md', 'main', REPO) ?? '') },
        { text: 'Inspect the new commit with `git show HEAD` and find the `Merge:` line listing two parents.', hint: '`git show HEAD`', check: (w) => ran(w, /^git\s+show\b/) && isMergeCommit(w, REPO) },
        { text: 'Run the graph log again and watch the two lanes join at the merge commit.', hint: '`git log --oneline --all --graph`', check: (w) => count(w, /^git\s+log\b.*--(all|graph)/) >= 2 && isMergeCommit(w, REPO) },
      ],
      takeaways: ['A three-way merge compares the merge base with both branch tips and combines the two sets of changes.', 'The result lives in a merge commit with two parents; Git writes its message for you.', 'Changes to different lines merge cleanly, even inside the same file.'],
      solution: ['git log --oneline --all --graph', 'git merge-base main pricing', 'git merge pricing', 'git show HEAD', 'git log --oneline --all --graph'],
    },
    {
      id: 'branches-conflict',
      title: 'Resolving a conflict',
      tagline: 'Both branches changed the same line: read the markers, pick, add, commit.',
      minutes: 12,
      article: conflict,
      setup: (w) => {
        seedRepo(w, REPO, [...BASE, PUMPKIN, ALMOND])
        seedBranch(w, REPO, 'price-update', 'main', [{ msg: 'Raise croissant price to $4.00', files: { 'menu.md': MENU_5.replace('$3.50', '$4.00') } }])
        seedRepo(w, REPO, [{ msg: 'Raise croissant price to $3.75', author: MAYA, files: { 'menu.md': MENU_5.replace('$3.50', '$3.75') } }])
      },
      tasks: [
        { text: 'Merge `price-update` into `main` and read the CONFLICT message.', hint: '`git merge price-update`', check: (w) => opInProgress(w, REPO) === 'merge' || conflicts(w, REPO).length > 0 },
        { text: 'Run `git status` and find `menu.md` under "Unmerged paths".', hint: '`git status`', check: (w) => ran(w, /^git\s+status/) && opInProgress(w, REPO) === 'merge' },
        { text: 'Resolve `menu.md`: remove the three marker lines and keep exactly one croissant line (either price, or a new one). Use `code menu.md` and save, or rebuild it with `echo`.', hint: '`code menu.md`, delete the `<<<<<<<`, `=======` and `>>>>>>>` lines plus the croissant line you do not want, save. Or: `echo "# Menu" > menu.md`, then `echo "..." >> menu.md` for each remaining line.', check: (w) => !hasConflictMarkers(w, MENU) && ((file(w, MENU) ?? '').match(/^- Croissant — \$\d/gm) ?? []).length === 1 && fileHas(w, MENU, /sourdough/i) && fileHas(w, MENU, /cinnamon/i) && fileHas(w, MENU, /pumpkin/i) && fileHas(w, MENU, /almond/i) },
        { text: 'Mark the file resolved with `git add menu.md`, then check `git status` again.', hint: '`git add menu.md` then `git status`', check: (w) => conflicts(w, REPO).length === 0 && opInProgress(w, REPO) === 'merge' && !hasConflictMarkers(w, MENU) },
        { text: 'Finish the merge with `git commit`. No `-m` needed; Git prepared the message.', hint: '`git commit`', check: (w) => branch(w, REPO) === 'main' && isMergeCommit(w, REPO) && clean(w, REPO) && !/^<{7}/m.test(committedFile(w, 'menu.md', 'main', REPO) ?? '') },
        { text: 'Look at the result with `git log --oneline --all --graph`.', hint: '`git log --oneline --all --graph`', check: (w) => ran(w, /^git\s+log\b.*--graph/) && isMergeCommit(w, REPO) },
      ],
      takeaways: ['Conflict markers show both versions; everything outside them merged on its own.', 'Edit the file to its final form, `git add` it to mark it resolved, then `git commit` with no `-m`.', '`git merge --abort` throws the attempt away and restores everything.'],
      solution: [
        'git merge price-update', 'git status',
        'echo "# Menu" > menu.md', 'echo "" >> menu.md', 'echo "- Sourdough loaf — $7" >> menu.md', 'echo "- Croissant — $4.00" >> menu.md', 'echo "- Cinnamon roll — $4" >> menu.md', 'echo "- Pumpkin loaf — $8" >> menu.md', 'echo "- Almond croissant — $4.50" >> menu.md',
        'git add menu.md', 'git status', 'git commit', 'git log --oneline --all --graph',
      ],
    },
    {
      id: 'branches-cleanup',
      title: 'Cleaning up and reading the graph',
      tagline: 'Delete merged branches, force-delete a dead one, rename, and read a busy graph.',
      minutes: 8,
      article: cleanup,
      setup: (w) => {
        seedRepo(w, REPO, [...BASE, PUMPKIN])
        seedBranch(w, REPO, 'autumn-menu', 'main', [])
        seedBranch(w, REPO, 'pricing', 'main', [TAX])
        seedBranch(w, REPO, 'price-update', 'main', [{ msg: 'Raise croissant price to $3.75', files: { 'menu.md': MENU_4.replace('$3.50', '$3.75') } }])
        seedRepo(w, REPO, [ALMOND])
        sh(w, 'git merge pricing', 'git merge price-update')
        seedBranch(w, REPO, 'experiment', 'main', [{ msg: 'Try a gluten-free loaf', files: { 'menu.md': MENU_5.replace('$3.50', '$3.75') + '- Gluten-free loaf — $9 (experimental)\n' } }])
        seedBranch(w, REPO, 'tmp', 'main', [{ msg: 'Add gingerbread to holiday menu', files: { 'menu.md': MENU_5.replace('$3.50', '$3.75') + '- Gingerbread — $5\n' } }])
        w.history.length = 0
      },
      tasks: [
        { text: 'Read the current state with `git log --oneline --graph --all`. Six branches, two merge commits.', hint: '`git log --oneline --graph --all`', check: (w) => ran(w, GRAPH) },
        { text: 'Delete the merged `autumn-menu` branch with `-d`.', hint: '`git branch -d autumn-menu`', check: (w) => !branchExists(w, 'autumn-menu', REPO) && branchExists(w, 'experiment', REPO) },
        { text: 'Delete `pricing` and `price-update` in one command.', hint: '`git branch -d pricing price-update`', check: (w) => !branchExists(w, 'pricing', REPO) && !branchExists(w, 'price-update', REPO) && branchExists(w, 'experiment', REPO) },
        { text: 'Try `git branch -d experiment` and read why Git refuses.', hint: '`git branch -d experiment`', check: (w) => ran(w, /^git\s+branch\s+(-d|--delete)\b.*\bexperiment\b/) && branchExists(w, 'experiment', REPO) },
        { text: 'Nobody liked the gluten-free loaf. Delete `experiment` anyway with `-D`.', hint: '`git branch -D experiment`', check: (w) => !branchExists(w, 'experiment', REPO) },
        { text: 'Rename `tmp` to `holiday-menu`.', hint: '`git branch -m tmp holiday-menu`', check: (w) => branchExists(w, 'holiday-menu', REPO) && !branchExists(w, 'tmp', REPO) && /gingerbread/i.test(committedFile(w, 'menu.md', 'holiday-menu', REPO) ?? '') },
        { text: 'Read the graph one more time: two branches left, history intact.', hint: '`git log --oneline --graph --all`', check: (w) => count(w, GRAPH) >= 2 && !branchExists(w, 'tmp', REPO) },
      ],
      takeaways: ['`git branch -d` deletes only a fully merged branch; the commits stay reachable from `main`.', '`git branch -D` forces it and makes those commits unreachable; be deliberate.', '`git branch -m old new` renames; `git log --oneline --graph --all` reads the whole picture.'],
      solution: ['git log --oneline --graph --all', 'git branch -d autumn-menu', 'git branch -d pricing price-update', 'git branch -d experiment', 'git branch -D experiment', 'git branch -m tmp holiday-menu', 'git log --oneline --graph --all'],
    },
  ],
}
