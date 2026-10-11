import type { Module } from '../types'
import type { World } from '../../engine/world'
import { sh, seedRepo, seedBranch, writeFiles, repo, ran, branch, branchHash, tagExists, isDetached, head, isAncestor, commitCount, hasCommit, committedFile, fileHas, fileExists, hasConflictMarkers, clean, staged, unstaged, untracked, conflicts, opInProgress, stashCount, type SeedCommit } from '../helpers'

const R = 'sunrise-bakery'

/** Files as Module 2 left them. */
const BAKERY = {
  'README.md': '# Sunrise Bakery\n\nFresh bread, every morning since 2019.\n',
  'menu.md': '# Menu\n\n- Sourdough loaf — $7\n- Croissant — $3.75\n- Cinnamon roll — $4\n- Pumpkin loaf — $6\n',
  'hours.txt': 'Mon-Fri 7am-3pm\nSat 8am-2pm\nSun closed\n',
  'recipes/sourdough.md': '# Sourdough\n24 hour cold ferment.\n',
}
const MENU3 = '# Menu\n\n- Sourdough loaf — $7\n- Croissant — $3.50\n- Cinnamon roll — $4\n'

/** Where Module 2 left main: seven commits, the last two merged in from branches. */
const HISTORY: SeedCommit[] = [
  { msg: 'Add project README', files: { 'README.md': BAKERY['README.md'] } },
  { msg: 'Add menu and opening hours', files: { 'menu.md': '# Menu\n\n- Sourdough loaf — $7\n- Croissant — $3.50\n', 'hours.txt': 'Mon-Fri 7am-3pm\nSat 8am-1pm\n' } },
  { msg: 'Add cinnamon roll to menu', files: { 'menu.md': MENU3 } },
  { msg: 'Add sourdough recipe', files: { 'recipes/sourdough.md': BAKERY['recipes/sourdough.md'] } },
  { msg: 'Extend Saturday hours and close Sundays', files: { 'hours.txt': BAKERY['hours.txt'] } },
  { msg: 'Add pumpkin loaf for the autumn menu', files: { 'menu.md': MENU3 + '- Pumpkin loaf — $6\n' } },
  { msg: 'Raise croissant price to cover butter cost', files: { 'menu.md': BAKERY['menu.md'] } },
]

/** Did the learner run a command matching `re` after the most recent command matching `after`? */
const ranAfter = (w: World, after: RegExp, re: RegExp) => { const i = w.history.map((c) => after.test(c)).lastIndexOf(true); return i >= 0 && w.history.slice(i + 1).some((c) => re.test(c)) }
const tagHash = (w: World, name: string) => repo(w, R)?.refs['refs/tags/' + name] ?? null
const mainIsAncestorOfHead = (w: World) => isAncestor(w, branchHash(w, 'main', R) ?? '', head(w, R) ?? '')

const reset = `
Yesterday you committed Grandma Rosa's brioche recipe into the repo. It is the one thing Sunrise Bakery never shares, and in Module 4 this repository goes on GitHub. The commit cannot be *fixed*. It has to disappear. Then, to make life interesting, you made another, perfectly good commit on top of it.

Module 1 gave you \`git commit --amend\` for the very last commit. For anything older you need \`git reset\`, and the moment you understand what it moves, it stops being scary.

## A branch is a pointer, and reset moves it

Remember from Module 2: \`main\` is nothing more than a name pointing at one commit. \`git reset <commit>\` moves that pointer somewhere else. Commits that are no longer behind the pointer vanish from \`git log\`. (They are not deleted. Two lessons from now you will see where they go.)

The only real question is: **what happens to the changes from the commits you moved past?** Reset has three answers, and the flag you pass picks one.

\`\`\`figure
                     A ◀── B ◀── C ◀── D ◀── E ◀── main, HEAD
                                 ▲
 git reset --soft C    main ─────┘    changes from D and E: back in the STAGING AREA
 git reset C           main ─────┘    changes from D and E: in the WORKING TREE, unstaged
 git reset --hard C    main ─────┘    changes from D and E: gone
caption: All three modes move main to C. They differ only in how much of D and E they keep for you.
\`\`\`

| Mode | Branch pointer | Staging area | Working tree | Think |
|---|---|---|---|---|
| \`--soft\` | moves | keeps the changes, staged | untouched | "undo the commit, keep everything ready" |
| \`--mixed\` (default) | moves | reset to the target | untouched, so the changes show as unstaged | "undo the commit *and* the add" |
| \`--hard\` | moves | reset | reset: the changes are gone | "it never happened" |

\`HEAD~1\` means "one commit before HEAD", \`HEAD~2\` two before, and so on. You can also name a commit by its hash.

## The three modes in the terminal

Start by reading the situation:

\`\`\`bash
$ git log --oneline -4
e4f7a21 (HEAD -> main) Add Saturday special to README
9b3c0d8 Add secret recipe
5a1e6f3 Raise croissant price to cover butter cost
2c8d4b7 Add pumpkin loaf for the autumn menu
\`\`\`

**Soft**: step back one commit, but keep its change staged. It is exactly as if you had run \`git add\` and not yet committed.

\`\`\`bash
$ git reset --soft HEAD~1
$ git status
On branch main

Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
	modified:   README.md
\`\`\`

**Mixed** (the default when you give no flag): step back again, past the secret recipe this time. The pointer moves and the staging area is reset, but your files are left exactly as they are. The README note is now an unstaged edit, and the recipe file, which Git no longer tracks, shows up as untracked.

\`\`\`bash
$ git reset HEAD~1
Unstaged changes after reset:
M	README.md
$ git status
On branch main

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   README.md

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	recipes/secret-brioche.md

no changes added to commit (use "git add" and/or "git commit -a")
\`\`\`

**Hard**: make the working tree and staging area match HEAD. Everything uncommitted in tracked files is thrown away.

\`\`\`bash
$ git reset --hard
HEAD is now at 5a1e6f3 Raise croissant price to cover butter cost
\`\`\`

With no commit given, \`--hard\` resets to HEAD itself: a quick "discard all my edits". With a commit (\`git reset --hard HEAD~2\`) it moves the pointer *and* wipes the changes in one go.

> **Why**
> Soft and mixed are how you reshape your own history before anyone sees it: squash three messy commits into one (\`git reset --soft HEAD~3\`, then commit), or split one commit into two (mixed reset, then stage and commit in pieces). You will do this before opening pull requests in Module 5.

> **Danger**
> \`--hard\` is the one Git command that destroys uncommitted work with no undo. Committed work survives (the reflog lesson shows how), but an edit you never committed is gone for good. Before any \`--hard\`, run \`git status\`. If it is not clean, stash or commit first.

## Gotchas

- \`--hard\` only touches files Git tracks. The secret recipe file is untracked after the mixed reset, so \`--hard\` leaves it on disk. Delete it yourself with \`rm\`.
- Every reset remembers where you were in \`ORIG_HEAD\` and in the reflog, so \`git reset --hard ORIG_HEAD\` is an instant "undo the reset". More in two lessons.
- Reset rewrites history. Only reset commits that live on your machine alone. For anything you have shared, the next lesson has the safe tool.

## Up next

Reset erases. When the commit you want to undo is already on Maya's machine, erasing it causes chaos. \`git revert\` undoes by adding instead.
`

const revert = `
Last night Maya raised the sourdough loaf to $9. She meant the rye loaf, which is not even on the menu yet. You could \`git reset --hard HEAD~1\` and pretend it never happened. But Maya already has that commit on her laptop, and in Module 4 commits like this will be on GitHub for the whole team. If you erase a commit other people have, their copy and yours disagree about what history *is*. That is a bad week.

\`git revert\` fixes the mistake without erasing anything.

## Undo by adding

Revert does not move the branch pointer backwards. It looks at what a commit changed, computes the exact opposite change, and commits *that* as a new commit on top. History only ever grows; everybody's copies stay in agreement; the files end up as if the mistake had not happened.

\`\`\`figure
 before   … ◀── 5a1e6f3 ◀── c81d2e9 ◀── main
                             "Raise sourdough price to $9"

 after    … ◀── 5a1e6f3 ◀── c81d2e9 ◀── f03b7a4 ◀── main
                                         'Revert "Raise sourdough price to $9"'

          files at f03b7a4  ==  files at 5a1e6f3
caption: Revert adds a mirror-image commit. The bad commit stays in history, and the files are back to how they were before it.
\`\`\`

## The commands

\`\`\`bash
$ git log --oneline -3
c81d2e9 (HEAD -> main) Raise sourdough price to $9
5a1e6f3 Raise croissant price to cover butter cost
2c8d4b7 Add pumpkin loaf for the autumn menu

$ git revert HEAD
[main f03b7a4] Revert "Raise sourdough price to $9"
 1 file changed, 1 insertion(+), 1 deletion(-)
\`\`\`

Git writes the commit message for you: \`Revert "<original subject>"\`, with a body line saying which commit it reverts. Look at the new commit and the diff is the mirror image of the mistake:

\`\`\`bash
$ git show HEAD
commit f03b7a4... (HEAD -> main)
Author: You <you@example.com>
Date:   Mon Oct 5 11:48:00 2026 +0000

    Revert "Raise sourdough price to $9"

    This reverts commit c81d2e9...

diff --git a/menu.md b/menu.md
--- a/menu.md
+++ b/menu.md
@@ -1,6 +1,6 @@
 # Menu

-- Sourdough loaf — $9
+- Sourdough loaf — $7
 - Croissant — $3.75
 - Cinnamon roll — $4
 - Pumpkin loaf — $6
\`\`\`

You can revert any commit, not only the latest: \`git revert 2c8d4b7\` would undo the pumpkin loaf while keeping every commit after it. Git applies the reverse change on top of the current files; if those files have moved on too much, you get a conflict, which you resolve exactly like a merge conflict and finish with \`git revert --continue\`.

## Reset or revert?

| | \`git reset\` | \`git revert\` |
|---|---|---|
| What moves | the branch pointer, backwards | nothing; a new commit is added |
| History | rewritten, commits disappear from the log | preserved, grows by one |
| Safe once others have the commit? | **No** | **Yes** |
| Which commits | only from the tip backwards | any single commit, anywhere |
| Reach for it when | tidying your own unshared work | undoing anything that has left your machine |

> **Why**
> From Module 4 on, almost everything you commit is shared within minutes. Revert is the undo you will use at work: it is boring, visible and reversible (you can revert a revert). "Never rewrite shared history" is only a livable rule because revert exists.

## Gotchas

> **Warning**
> Revert wants a clean working tree. With uncommitted edits it stops: *error: your local changes would be overwritten by revert. hint: commit your changes or stash them to proceed.* Commit, or stash (two lessons from now), then try again.

- Reverting a merge commit needs \`-m 1\` to say which side to keep. Prefer reverting the individual commits.
- A revert fixes the *content*. The mistaken commit still shows in \`git log\`, which is the point: the record of what happened and what fixed it is complete.

## Up next

Undoing is half of rewriting history. The other half is *rearranging* it: \`git rebase\` replays your branch on top of a newer main, giving you a straight-line history instead of a tangle of merges.
`

const rebase = `
You have spent two commits on \`seasonal-specials\`: an apple turnover and a chai latte. Meanwhile Maya committed *Open on Sundays* to \`main\`. Module 2 taught one way to bring the two together: \`git merge\`, which ties the lines with a merge commit. That works, and on a busy project the graph soon looks like a subway map.

\`git rebase\` offers a second way: pretend you started your branch *after* Maya's commit. Lift your commits off, move the base, replay them on top. The result reads like one straight line.

## Replaying commits

\`\`\`figure
 before                                   after  git rebase main

 A ──┬── D  (main)                        A ── D  (main)
     │                                          └── B' ── C'  (seasonal-specials)
     └── B ── C  (seasonal-specials)

caption: Rebase replays B and C on top of D. B' and C' contain the same changes as B and C but are brand-new commits with new hashes.
\`\`\`

Note the primes. A rebase does not move your commits, it *re-creates* them: same message, same author, same change, new parent, therefore new hash. The old B and C still exist for a while (reflog, next lesson) but your branch no longer points at them. This is why rebase counts as rewriting history.

## The happy path

Stand on the branch you want to move, and name the branch to move it onto:

\`\`\`bash
$ git switch seasonal-specials
$ git rebase main
Successfully rebased and updated refs/heads/seasonal-specials.

$ git log --oneline -4
3e9a1c7 (HEAD -> seasonal-specials) Add chai latte to specials
b72f0d4 Add apple turnover to specials
a05c8e1 (main) Open on Sundays
5a1e6f3 Raise croissant price to cover butter cost
\`\`\`

One line. Your work now sits above Maya's, as if you had started today. \`main\` itself did not move; a later \`git merge seasonal-specials\` from main would be a simple fast-forward.

## When a replayed commit conflicts

Each commit is replayed one at a time, and any of them can collide with what main changed. \`hours-fix\` changed the Saturday line; main changed the Sunday line right below it. Adjacent edits conflict:

\`\`\`bash
$ git switch hours-fix
$ git rebase main
Auto-merging hours.txt
CONFLICT (content): Merge conflict in hours.txt
error: could not apply 7d2e9b1... Extend Saturday hours to 3pm
hint: Resolve all conflicts manually, mark them as resolved with
hint: "git add/rm <conflicted_files>", then run "git rebase --continue".
hint: You can instead skip this commit: run "git rebase --skip".
hint: To abort and get back to the state before "git rebase", run "git rebase --abort".
Could not apply 7d2e9b1... Extend Saturday hours to 3pm
\`\`\`

The rebase pauses mid-way. \`git status\` starts with *HEAD detached at a05c8e1* and *rebase in progress; onto a05c8e1*, and lists \`hours.txt\` under *Unmerged paths*. The file has the markers you met in Module 2:

\`\`\`bash
$ cat hours.txt
Mon-Fri 7am-3pm
<<<<<<< HEAD
Sat 8am-2pm
Sun 9am-1pm
=======
Sat 8am-3pm
Sun closed
>>>>>>> 7d2e9b1... Extend Saturday hours to 3pm
\`\`\`

One twist: during a rebase, **HEAD is the branch you are rebasing onto** (main's version) and the lower half is *your* commit being replayed. It feels backwards the first time. Edit the file so it keeps both improvements, with no marker lines, then tell Git you are done with this commit and let it carry on:

\`\`\`bash
$ git add hours.txt
$ git rebase --continue
Successfully rebased and updated refs/heads/hours-fix.
\`\`\`

If it all goes wrong, \`git rebase --abort\` puts the branch back exactly where it started. Nothing is lost by trying.

## Merge or rebase?

| | \`git merge\` | \`git rebase\` |
|---|---|---|
| Result | a merge commit with two parents | a straight line, commits re-created |
| Existing hashes | unchanged | new |
| Conflicts | resolved once, in the merge commit | resolved per replayed commit |
| Safe on a shared branch | yes | **no** |

> **Danger**
> **The golden rule: never rebase commits that other people already have.** Rebasing re-creates commits. If Maya has the originals, she now has history that disagrees with yours, and the next merge produces duplicates and conflicts for everyone. Rebase your own local branch onto main as often as you like. Never rebase \`main\` itself, or any branch someone else has pulled.

> **Why**
> "Rebase your branch on main, then open the pull request" is the single most common team workflow, and it is exactly what Module 5 asks of you. A linear history also makes \`git log\`, \`git bisect\` and reverts far easier to read.

## Gotchas

- Rebase refuses to start with uncommitted changes: *cannot rebase: You have unstaged changes*. Commit or stash first.
- After resolving a conflict, do **not** run \`git commit\`. \`git add\` the file and \`git rebase --continue\`.
- This course's terminal does not include \`git rebase -i\` (interactive rebase, for reordering and squashing). The idea is the same: replay commits, editing the list as you go.

## Up next

Rebase and \`reset --hard\` both leave commits behind. Where do they go, and how do you get one back? The reflog.
`

const reflog = `
It is 4:55pm. You mean to type \`git reset --hard HEAD~1\` and your finger lands on 2. The pumpkin loaf commit and the price change are gone from \`git log\`. The graph pane shows a shorter main. Your stomach drops.

Breathe. Git almost never deletes a commit. It only loses *track* of it.

## Reachable, not deleted

\`git log\` shows the commits you can reach by walking backwards from a branch. When \`reset --hard HEAD~2\` moved \`main\` two commits back, the two commits at the top stopped being reachable, so the log stopped showing them. They are still sitting in Git's object database, untouched, for at least 30 days before Git's garbage collection even considers them.

You just need their hashes. That is what the **reflog** is for: a private diary of every place HEAD has pointed, newest first.

\`\`\`figure
 reflog (HEAD's diary)                              commits in the database

 HEAD@{0}  reset: moving to HEAD~2   ──▶ 4c2d9e0 ◀── main, HEAD
 HEAD@{1}  commit: Raise croissant…  ──▶ 5a1e6f3   ◀── still here, just unreachable
 HEAD@{2}  commit: Add pumpkin loaf… ──▶ 2c8d4b7   ◀── still here, just unreachable
 HEAD@{3}  commit: Extend Saturday…  ──▶ 4c2d9e0
caption: Every commit, switch, reset, merge and rebase writes a line. HEAD@{1} is where HEAD was one move ago.
\`\`\`

## Watching the accident, and the rescue

\`\`\`bash
$ git reset --hard HEAD~2
HEAD is now at 4c2d9e0 Extend Saturday hours and close Sundays

$ git log --oneline
4c2d9e0 (HEAD -> main) Extend Saturday hours and close Sundays
8d05f1b Add sourdough recipe
71e3c9a Add cinnamon roll to menu
9e60b2d Add menu and opening hours
3f2a9c1 Add project README
\`\`\`

Now open the diary:

\`\`\`bash
$ git reflog
4c2d9e0 (HEAD -> main) HEAD@{0}: reset: moving to HEAD~2
5a1e6f3 HEAD@{1}: commit: Raise croissant price to cover butter cost
2c8d4b7 HEAD@{2}: commit: Add pumpkin loaf for the autumn menu
4c2d9e0 (HEAD -> main) HEAD@{3}: commit: Extend Saturday hours and close Sundays
8d05f1b HEAD@{4}: commit: Add sourdough recipe
71e3c9a HEAD@{5}: commit: Add cinnamon roll to menu
9e60b2d HEAD@{6}: commit: Add menu and opening hours
3f2a9c1 HEAD@{7}: commit: Add project README
\`\`\`

Line 0 is the reset you just did. Line 1 is where HEAD stood right before it: the commit you want back. Point main at it again, using either the hash or the reflog name:

\`\`\`bash
$ git reset --hard HEAD@{1}
HEAD is now at 5a1e6f3 Raise croissant price to cover butter cost
\`\`\`

Both commits are back, hashes unchanged, as if nothing happened. Two other spellings do the same job:

- \`git reset --hard ORIG_HEAD\`. Reset, merge and rebase save the previous position in \`ORIG_HEAD\` for exactly this.
- \`git switch -c rescue 5a1e6f3\`. Creates a new branch at the lost commit without touching main. Use this when you are not sure what you are looking at and want to inspect first.

## Rebase went wrong? Same trick

A rebase writes reflog lines too: *rebase (start)*, one per replayed commit, and the old tip just before all of that. \`git reflog\`, find the line before the rebase started, \`git reset --hard\` to it. The branch is restored to the pre-rebase state.

> **Why**
> This is the lesson that makes the previous three safe to practise. \`reset --hard\`, rebase, a deleted branch, an \`--amend\` you regret: as long as it was committed, the reflog gets it back. The only thing it cannot save is work you never committed. Commit early, commit often, even if you tidy later.

## Gotchas

> **Warning**
> \`HEAD@{1}\` and \`HEAD~1\` look alike and mean different things. \`HEAD~1\` is the *parent commit*. \`HEAD@{1}\` is *where HEAD was one move ago*, which might be a commit on another branch entirely. Read the reflog line before you reset to it.

- The reflog is local. It is not pushed, not cloned, and lives only in your \`.git\`. Teammates cannot rescue your commits from theirs.
- Entries expire after about 90 days (30 for unreachable ones). Do the rescue this week, not next year.

## Up next

Sometimes the problem is not a lost commit but an interruption: you are mid-edit and need to be on another branch *now*. \`git stash\`.
`

const stash = `
You are on \`rye-loaf\`, halfway through describing the new bread in \`menu.md\`, when Maya calls. The hours file never mentions public holidays and a customer just drove across town to a locked door. It needs fixing on \`hotfix\`, now. Your menu edit is half a sentence; it is not ready to commit.

\`\`\`bash
$ git switch hotfix
error: Your local changes to the following files would be overwritten by checkout:
	menu.md
Please commit your changes or stash them before you switch branches.
Aborting
\`\`\`

Git refuses, and rightly so: \`menu.md\` differs between the two branches, and switching would have to overwrite your edit. The message offers two ways out. A "WIP" commit works but litters history. The other way is the stash.

## A shelf for unfinished work

\`git stash\` takes every change in your working tree and staging area, saves it on a shelf inside \`.git\`, and resets your files to the last commit. The tree is clean, so you can switch freely. Later, \`git stash pop\` takes the top item off the shelf and puts the changes back.

\`\`\`figure
  WORKING TREE                      STASH (a stack, newest on top)

  menu.md  (half-edited)  ──git stash──▶   stash@{0}: WIP on rye-loaf
  menu.md  (clean)                         stash@{1}: older entry, if any

  menu.md  (half-edited)  ◀──git stash pop──
caption: stash shelves your uncommitted changes; pop puts them back and removes the shelf entry.
\`\`\`

## The round trip

\`\`\`bash
$ git stash
Saved working directory and index state WIP on rye-loaf: 8e1f2a3 Add rye loaf to menu
$ git status
On branch rye-loaf
nothing to commit, working tree clean
$ git stash list
stash@{0}: WIP on rye-loaf: 8e1f2a3 Add rye loaf to menu
\`\`\`

The entry records which branch and commit you were on, so you can find your way back. Now do the urgent thing:

\`\`\`bash
$ git switch hotfix
Switched to branch 'hotfix'
$ echo "Holidays: closed" >> hours.txt
$ git commit -am "Note holiday closure in hours"
[hotfix 4b7e9c2] Note holiday closure in hours
 1 file changed, 1 insertion(+)
\`\`\`

Then return and unshelve. \`git switch -\` means "the branch I was on before", a handy shortcut:

\`\`\`bash
$ git switch -
Switched to branch 'rye-loaf'
$ git stash pop
On branch rye-loaf

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   menu.md

no changes added to commit (use "git add" and/or "git commit -a")
Dropped refs/stash@{0} (2f6c1d8e4a7b90c3f15d6e8a2b4c7d9e0f1a3b5c)
\`\`\`

Your half-sentence is back in \`menu.md\`, unstaged, exactly as you left it. Carry on.

## The stash commands

| Command | Does |
|---|---|
| \`git stash\` | shelve all tracked changes (same as \`git stash push\`) |
| \`git stash -m "rye description"\` | shelve with a label you will recognise later |
| \`git stash -u\` | also shelve untracked (new) files |
| \`git stash list\` | show the shelf |
| \`git stash show\` | which files are in the top entry |
| \`git stash pop\` | reapply the top entry and remove it |
| \`git stash apply\` | reapply but keep the entry (useful on several branches) |
| \`git stash drop\` | throw the top entry away |

> **Why**
> Interruptions are the normal state of team work. In Module 5 a reviewer will ask for a one-line change on a branch you have already left behind. Stash, switch, fix, push, switch back, pop. Thirty seconds, no junk commits.

## Gotchas

> **Warning**
> The stash is a stack of *your* uncommitted work, and it is as local and invisible as the reflog. Do not use it as long-term storage: an entry called \`WIP on main\` from three weeks ago is a mystery. If a piece of work needs to live for more than a day, make it a branch and commit.

- \`git stash\` ignores new, untracked files unless you pass \`-u\`. Check \`git status\` after stashing.
- \`pop\` can conflict if the branch changed the same lines meanwhile. Resolve, \`git add\`, and then \`git stash drop\` yourself, since a conflicted pop keeps the entry.
- Stashing when there is nothing to stash prints *No local changes to save* and does nothing.

## Up next

You can pause work and resume it. Next: taking a single commit from one branch and dropping it onto another, without merging everything else that came with it.
`

const cherryPick = `
Maya has an \`experiments\` branch where she tries things out. Right now it holds three commits: a lavender latte nobody has tasted, a fix for a typo in the README (the address says *Harbour Stret*), and a 48-hour ferment that is still being tested. The typo fix belongs on \`main\` today. The other two do not.

\`git merge experiments\` would bring all three. \`git cherry-pick\` brings one.

## Copying a single commit

Cherry-pick takes the *change* one commit made and applies it to your current branch as a new commit. The message and author come along; the hash is new, because the parent is different. The original commit stays where it was on its own branch.

\`\`\`figure
 before                                     after  git cherry-pick 7a91b3e

 A ── B  (main)                             A ── B ── B'  (main)          B' = "Fix typo in README address"
      └── X ── 7a91b3e ── Y  (experiments)       └── X ── 7a91b3e ── Y  (experiments)
caption: The fix now exists twice: once on experiments, once on main as a fresh commit. The lavender latte (X) and the ferment (Y) stay put.
\`\`\`

## Finding and picking

First, find the hash. You can log any branch without switching to it:

\`\`\`bash
$ git log experiments --oneline
c4d8e2f (experiments) Try a 48 hour ferment
7a91b3e Fix typo in README address
2f0c6d5 Try a lavender latte
6b3e1a9 (HEAD -> main) Add address to README
5a1e6f3 Raise croissant price to cover butter cost
\`\`\`

Then, standing on \`main\`, pick it:

\`\`\`bash
$ git cherry-pick 7a91b3e
[main d19e4c2] Fix typo in README address
 1 file changed, 1 insertion(+), 1 deletion(-)
\`\`\`

It looks like a commit, because it is one. Instead of the hash you can also point at the commit relative to a branch: \`experiments~1\` is "one before the tip of experiments", the same commit.

\`\`\`bash
$ git log --oneline --graph --all -5
*   d19e4c2 (HEAD -> main) Fix typo in README address
| * c4d8e2f (experiments) Try a 48 hour ferment
| * 7a91b3e Fix typo in README address
| * 2f0c6d5 Try a lavender latte
*   6b3e1a9 Add address to README
\`\`\`

Same subject, two hashes, two branches. \`cat README.md\` on main now says *Street*, and the menu still has no lavender latte.

## When to reach for it

- A bug fix landed on a feature branch, and production needs it now: pick it onto \`main\`.
- The reverse: a fix on \`main\` that an old release branch also needs (a "backport").
- A teammate's branch has one good commit among several unfinished ones.

> **Why**
> Cherry-pick is the manual version of what GitHub does when you choose "squash" or "rebase" to merge a pull request in Module 5: the commits are re-applied onto main as new commits. Knowing that helps you read a PR's history later.

## Gotchas

> **Warning**
> A cherry-pick is a copy, not a move. If \`experiments\` is merged into \`main\` later, Git usually notices the identical change and resolves it quietly, but the history will show the fix twice. Picking many commits across branches is a sign you want a merge or rebase instead.

- Cherry-pick needs a clean working tree, like revert and rebase. Commit or stash first.
- It can conflict. Fix the file, \`git add\`, then \`git cherry-pick --continue\`, or back out with \`git cherry-pick --abort\`.
- Several at once: \`git cherry-pick A B C\` applies them in order.

## Up next

Main now has everything the public should see. Time to name that moment so you can always find it again: tags.
`

const tags = `
The website goes live tonight with today's menu and hours. Next month, when Maya asks "which version did we launch with?", you need an answer better than "the commit on Tuesday, I think". Branch names move with every commit. Hashes are impossible to remember. A **tag** is a name for one commit that never moves.

## Pointers that stay still

A branch is a pointer that advances every time you commit. A tag is a pointer you place once. Three commits later, \`main\` has moved on; \`v1.0\` still marks the launch.

\`\`\`figure
 5a1e6f3 ◀── 8e1f2a3 ◀── 0c4d7f9 ◀── main, HEAD
    ▲            ▲
  tag: v1.0    tag: v1.1
caption: Tags do not move when main does. v1.0 will point at 5a1e6f3 forever.
\`\`\`

Git has two kinds. A **lightweight** tag is just the pointer. An **annotated** tag (\`-a\`) also stores who made it, when, and a message; use annotated tags for releases, lightweight ones for private bookmarks.

## Tagging a release

\`\`\`bash
$ git tag v1.0
$ git tag
v1.0
$ git log --oneline -2
5a1e6f3 (HEAD -> main, tag: v1.0) Raise croissant price to cover butter cost
2c8d4b7 Add pumpkin loaf for the autumn menu
\`\`\`

The tag appears in the decorations next to the branch name. \`git show v1.0\` prints the commit it names, exactly like \`git show\` with a hash. Tags work anywhere a commit is expected: \`git diff v1.0 main\` shows everything changed since launch.

Add the rye loaf, commit, and tag the new state with a message:

\`\`\`bash
$ git commit -am "Add rye loaf to menu"
[main 8e1f2a3] Add rye loaf to menu
 1 file changed, 1 insertion(+)
$ git tag -a v1.1 -m "Autumn release"
$ git tag
v1.0
v1.1
\`\`\`

You can also tag an older commit after the fact: \`git tag v0.9 2c8d4b7\`.

## Visiting a release

To see the project exactly as it was at launch, check out the tag:

\`\`\`bash
$ git checkout v1.0
Note: switching to 'v1.0'.

You are in 'detached HEAD' state. You can look around, make experimental
changes and commit them, and you can discard any commits you make in this
state without impacting any branches by switching back to a branch.
...
HEAD is now at 5a1e6f3 Raise croissant price to cover butter cost
$ cat menu.md
\`\`\`

No rye loaf: you are standing on the launch commit. **Detached HEAD** means HEAD points at a commit directly rather than at a branch. Looking around is perfectly safe. When you are done, step back onto a branch:

\`\`\`bash
$ git switch main
Switched to branch 'main'
\`\`\`

(\`git switch --detach v1.0\` does the same as the checkout; the old command is still the one most people type.)

> **Why**
> Tags are how software ships. In Module 4 you will push them to GitHub (\`git push --tags\`; they do not go with a normal push), and GitHub Releases, changelogs and download pages are built on top of them. Version numbers like \`v1.2.3\` follow *semantic versioning*: breaking change, new feature, bug fix.

## Gotchas

> **Warning**
> If you commit while in detached HEAD, no branch points at the new commit. Switch away and it is only reachable through the reflog. Want to keep that work? \`git switch -c from-v1.0\` first, and the commits land on a real branch.

- Tags do not move, ever. Tagged the wrong commit? \`git tag -d v1.0\` then tag again. Never retag a release other people have already fetched.
- \`git tag\` with no arguments lists; \`git tag <name>\` creates. Easy to mix up when typing fast.

## Up next

You can undo, reorder, rescue, pause, copy and name commits. Everything so far happened on your own machine. Module 4 connects \`~/sunrise-bakery\` to GitHub, where Maya and Sam are waiting.
`

export const module: Module = {
  id: 'history',
  title: 'Rewriting history (safely)',
  blurb: 'Undo, reorder and rescue commits: reset, revert, rebase, reflog, stash, cherry-pick and tags, and the one rule that keeps them safe.',
  lessons: [
    {
      id: 'history-reset',
      title: 'Reset: moving the branch pointer',
      tagline: 'Soft, mixed and hard: three ways to step back, differing only in how much they keep.',
      minutes: 11,
      article: reset,
      setup: (w) => {
        seedRepo(w, R, [
          ...HISTORY,
          { msg: 'Add secret recipe', files: { 'recipes/secret-brioche.md': "# Secret brioche\n\nGrandma Rosa's recipe. Never publish this.\n" } },
          { msg: 'Add Saturday special to README', files: { 'README.md': BAKERY['README.md'] + '\nSaturday special: whatever is left at noon is half price.\n' } },
        ])
      },
      tasks: [
        { text: 'Read the recent history with `git log --oneline`. The top commit is fine; the one below it should never have been made.', hint: '`git log --oneline`', check: (w) => ran(w, /^git\s+log/) },
        { text: 'Undo the top commit but keep its change staged: `git reset --soft HEAD~1`.', hint: '`git reset --soft HEAD~1`', check: (w) => commitCount(w, 'HEAD', R) === 8 && staged(w, R).includes('README.md') && !hasCommit(w, /saturday special/i, 'HEAD', R) },
        { text: 'Run `git status`: the Saturday note is back in the staging area, as if you had just run `git add`.', hint: '`git status`', check: (w) => ranAfter(w, /^git\s+reset\s+--soft/, /^git\s+(status|diff\s+--(staged|cached))/) && staged(w, R).includes('README.md') },
        { text: 'Step past the secret recipe with the default (mixed) mode: `git reset HEAD~1`. Then look at `git status`.', hint: '`git reset HEAD~1` (same as `git reset --mixed HEAD~1`)', check: (w) => commitCount(w, 'HEAD', R) === 7 && !hasCommit(w, /secret/i, 'HEAD', R) && unstaged(w, R).includes('README.md') && untracked(w, R).includes('recipes/secret-brioche.md') },
        { text: 'Throw away the leftover README edit with `git reset --hard`.', hint: '`git reset --hard`', check: (w) => commitCount(w, 'HEAD', R) === 7 && clean(w, R) && !fileHas(w, R + '/README.md', /saturday special/i) },
        { text: 'The recipe file survived as untracked (`--hard` never touches files Git does not track). Delete it with `rm recipes/secret-brioche.md`.', hint: '`rm recipes/secret-brioche.md`', check: (w) => !fileExists(w, R + '/recipes/secret-brioche.md') && commitCount(w, 'HEAD', R) === 7 && clean(w, R) },
        { text: 'Confirm with `git log --oneline` that main is back to seven commits and the secret never happened.', hint: '`git log --oneline`', check: (w) => ranAfter(w, /^(rm\s|git\s+clean)/, /^git\s+(log|status)/) && commitCount(w, 'HEAD', R) === 7 && clean(w, R) && untracked(w, R).length === 0 },
      ],
      takeaways: ['`git reset <commit>` moves the branch pointer; the mode decides what happens to the changes you stepped past.', '`--soft` keeps them staged, `--mixed` (default) keeps them in the working tree, `--hard` discards them.', '`--hard` destroys uncommitted work and ignores untracked files; check `git status` first.', 'Only reset commits nobody else has. For shared history, use revert.'],
      solution: ['git log --oneline', 'git reset --soft HEAD~1', 'git status', 'git reset HEAD~1', 'git status', 'git reset --hard', 'rm recipes/secret-brioche.md', 'git log --oneline'],
    },
    {
      id: 'history-revert',
      title: 'Revert: undo without rewriting',
      tagline: 'A new commit that mirrors an old one, so shared history stays intact.',
      minutes: 8,
      article: revert,
      setup: (w) => {
        seedRepo(w, R, [...HISTORY, { msg: 'Raise sourdough price to $9', files: { 'menu.md': BAKERY['menu.md'].replace('Sourdough loaf — $7', 'Sourdough loaf — $9') } }])
      },
      tasks: [
        { text: 'Find the commit that raised the sourdough price with `git log --oneline`.', hint: '`git log --oneline`', check: (w) => ran(w, /^git\s+log/) },
        { text: 'Undo it without erasing anything: `git revert HEAD`.', hint: '`git revert HEAD`', check: (w) => hasCommit(w, /^Revert "Raise sourdough price/, 'HEAD', R) && (committedFile(w, 'menu.md', 'HEAD', R) ?? '').includes('Sourdough loaf — $7') && clean(w, R) },
        { text: 'Look at `git log --oneline` again: the mistake and its undo are both there.', hint: '`git log --oneline`', check: (w) => ranAfter(w, /^git\s+revert/, /^git\s+log/) && hasCommit(w, /^Revert/, 'HEAD', R) },
        { text: 'Read the new commit with `git show HEAD`: its diff is the mirror image of the mistake.', hint: '`git show HEAD`', check: (w) => ranAfter(w, /^git\s+revert/, /^git\s+show/) },
        { text: 'Prove the files are back where they were: `git diff HEAD~2` prints nothing, because nothing differs.', hint: '`git diff HEAD~2`', check: (w) => ranAfter(w, /^git\s+revert/, /^git\s+diff\s+HEAD~2/) && clean(w, R) },
      ],
      takeaways: ['`git revert <commit>` adds a new commit with the opposite change; nothing is rewritten.', 'Use revert for anything others might already have; reset only for your own unshared commits.', 'The mistake stays in the log on purpose: the record of what happened is complete.'],
      solution: ['git log --oneline', 'git revert HEAD', 'git log --oneline', 'git show HEAD', 'git diff HEAD~2'],
    },
    {
      id: 'history-rebase',
      title: 'Rebase vs merge',
      tagline: 'Replay your branch on top of a newer main for a straight-line history, and survive a conflict on the way.',
      minutes: 12,
      article: rebase,
      setup: (w) => {
        seedRepo(w, R, HISTORY)
        seedBranch(w, R, 'seasonal-specials', 'main', [
          { msg: 'Add apple turnover to specials', files: { 'menu.md': BAKERY['menu.md'] + '- Apple turnover — $4.50\n' } },
          { msg: 'Add chai latte to specials', files: { 'menu.md': BAKERY['menu.md'] + '- Apple turnover — $4.50\n- Chai latte — $4\n' } },
        ])
        seedBranch(w, R, 'hours-fix', 'main', [{ msg: 'Extend Saturday hours to 3pm', files: { 'hours.txt': 'Mon-Fri 7am-3pm\nSat 8am-3pm\nSun closed\n' } }])
        seedRepo(w, R, [{ msg: 'Open on Sundays', files: { 'hours.txt': 'Mon-Fri 7am-3pm\nSat 8am-2pm\nSun 9am-1pm\n' } }])
        sh(w, 'git switch seasonal-specials')
      },
      tasks: [
        { text: 'See how the branches have drifted apart: `git log --oneline --graph --all`.', hint: '`git log --oneline --graph --all`', check: (w) => ran(w, /^git\s+log\b.*--(graph|all)/) },
        { text: 'You are on `seasonal-specials`. Replay its commits on top of main with `git rebase main`.', hint: '`git rebase main`', check: (w) => branch(w, R) === 'seasonal-specials' && opInProgress(w, R) === null && mainIsAncestorOfHead(w) && hasCommit(w, /chai latte/i, 'HEAD', R) },
        { text: 'Read `git log --oneline`: one straight line, with your two commits above *Open on Sundays*.', hint: '`git log --oneline`', check: (w) => ranAfter(w, /^git\s+rebase/, /^git\s+log/) && mainIsAncestorOfHead(w) },
        { text: 'Switch to `hours-fix`.', hint: '`git switch hours-fix`', check: (w) => branch(w, R) === 'hours-fix' },
        { text: 'Rebase it onto main too: `git rebase main`. This time Git stops with a conflict in `hours.txt`.', hint: '`git rebase main`, then `git status` and `cat hours.txt` to see the damage', check: (w) => opInProgress(w, R) === 'rebase' && conflicts(w, R).includes('hours.txt') },
        { text: 'Edit `hours.txt` so it keeps both changes (`Sat 8am-3pm` and `Sun 9am-1pm`) with no marker lines, then `git add hours.txt`.', hint: '`echo "Mon-Fri 7am-3pm" > hours.txt`, `echo "Sat 8am-3pm" >> hours.txt`, `echo "Sun 9am-1pm" >> hours.txt`, then `git add hours.txt`', check: (w) => opInProgress(w, R) === 'rebase' && conflicts(w, R).length === 0 && !hasConflictMarkers(w, R + '/hours.txt') && fileHas(w, R + '/hours.txt', 'Sat 8am-3pm') && fileHas(w, R + '/hours.txt', 'Sun 9am-1pm') },
        { text: 'Finish the rebase with `git rebase --continue`.', hint: '`git rebase --continue`', check: (w) => opInProgress(w, R) === null && branch(w, R) === 'hours-fix' && mainIsAncestorOfHead(w) && (committedFile(w, 'hours.txt', 'HEAD', R) ?? '').includes('Sat 8am-3pm') && (committedFile(w, 'hours.txt', 'HEAD', R) ?? '').includes('Sun 9am-1pm') },
      ],
      takeaways: ['`git rebase main` re-creates your branch\'s commits on top of main: same changes, new hashes, straight line.', 'A conflict pauses the rebase: fix the file, `git add` it, `git rebase --continue` (or `--abort` to undo everything).', 'During a rebase, HEAD is the branch you are rebasing onto; your own commit is the lower half of the markers.', 'Golden rule: never rebase commits other people already have.'],
      solution: ['git log --oneline --graph --all', 'git rebase main', 'git log --oneline', 'git switch hours-fix', 'git rebase main', 'git status', 'cat hours.txt', 'echo "Mon-Fri 7am-3pm" > hours.txt', 'echo "Sat 8am-3pm" >> hours.txt', 'echo "Sun 9am-1pm" >> hours.txt', 'git add hours.txt', 'git rebase --continue'],
    },
    {
      id: 'history-reflog',
      title: 'Reflog: nothing is lost',
      tagline: 'HEAD keeps a diary. Use it to bring back commits a reset or rebase made disappear.',
      minutes: 9,
      article: reflog,
      setup: (w) => { seedRepo(w, R, HISTORY) },
      tasks: [
        { text: 'Look at `git log --oneline` and note the top two commits: the price change and the pumpkin loaf.', hint: '`git log --oneline`', check: (w) => ran(w, /^git\s+log/) },
        { text: 'Now make the mistake on purpose: `git reset --hard HEAD~2`.', hint: '`git reset --hard HEAD~2`', check: (w) => commitCount(w, 'HEAD', R) === 5 && !hasCommit(w, /pumpkin/i, 'HEAD', R) },
        { text: 'Run `git log --oneline`: both commits are gone from the history.', hint: '`git log --oneline`', check: (w) => ranAfter(w, /^git\s+reset\s+--hard/, /^git\s+log/) && commitCount(w, 'HEAD', R) === 5 },
        { text: 'Open the safety net with `git reflog` and find the line from just before the reset.', hint: '`git reflog`', check: (w) => ran(w, /^git\s+reflog/) },
        { text: 'Bring the commits back: `git reset --hard HEAD@{1}` (or `git switch -c rescue <hash>` to inspect first).', hint: '`git reset --hard HEAD@{1}`', check: (w) => hasCommit(w, /croissant price/i, 'HEAD', R) && hasCommit(w, /pumpkin/i, 'HEAD', R) && clean(w, R) },
        { text: 'Confirm with `git log --oneline` that all seven commits are back, hashes unchanged.', hint: '`git log --oneline`', check: (w) => ranAfter(w, /^git\s+(reset|switch|checkout)\b/, /^git\s+log/) && hasCommit(w, /croissant price/i, 'HEAD', R) },
      ],
      takeaways: ['Commits a reset or rebase "lost" are still in the database; only the branch stopped pointing at them.', '`git reflog` lists every place HEAD has been, newest first; `HEAD@{1}` is one move ago.', 'Recover with `git reset --hard HEAD@{n}`, `ORIG_HEAD`, or `git switch -c rescue <hash>`.', 'The reflog is local and cannot save work you never committed.'],
      solution: ['git log --oneline', 'git reset --hard HEAD~2', 'git log --oneline', 'git reflog', 'git reset --hard HEAD@{1}', 'git log --oneline'],
    },
    {
      id: 'history-stash',
      title: 'Stash: pause your work',
      tagline: 'Shelve half-finished edits, switch branches for an urgent fix, come back and pick up where you left off.',
      minutes: 9,
      article: stash,
      setup: (w) => {
        seedRepo(w, R, HISTORY)
        seedBranch(w, R, 'hotfix', 'main', [])
        seedBranch(w, R, 'rye-loaf', 'main', [{ msg: 'Add rye loaf to menu', files: { 'menu.md': BAKERY['menu.md'] + '- Rye loaf — $8\n' } }])
        sh(w, 'git switch rye-loaf')
        writeFiles(w, R, { 'menu.md': BAKERY['menu.md'] + '- Rye loaf — $8 (Tuesdays only)\n' })
      },
      tasks: [
        { text: 'Try to switch: `git switch hotfix`. Git refuses because your half-finished `menu.md` edit would be overwritten.', hint: '`git switch hotfix`', check: (w) => ran(w, /^git\s+(switch|checkout)\s+hotfix/) },
        { text: 'Put the edit on the shelf with `git stash`.', hint: '`git stash`', check: (w) => stashCount(w, R) >= 1 && clean(w, R) },
        { text: 'See it on the shelf with `git stash list`.', hint: '`git stash list`', check: (w) => ran(w, /^git\s+stash\s+list/) },
        { text: 'Switch to `hotfix` now that the working tree is clean.', hint: '`git switch hotfix`', check: (w) => branch(w, R) === 'hotfix' },
        { text: 'Append `Holidays: closed` to `hours.txt` and commit it as `Note holiday closure in hours`.', hint: '`echo "Holidays: closed" >> hours.txt` then `git commit -am "Note holiday closure in hours"`', check: (w) => branch(w, R) === 'hotfix' && /holiday/i.test(committedFile(w, 'hours.txt', 'HEAD', R) ?? '') && clean(w, R) },
        { text: 'Go back to `rye-loaf` (`git switch -` jumps to the previous branch).', hint: '`git switch -` or `git switch rye-loaf`', check: (w) => branch(w, R) === 'rye-loaf' && hasCommit(w, /holiday/i, 'hotfix', R) },
        { text: 'Take your work off the shelf with `git stash pop` and check that `menu.md` has the Tuesdays note again.', hint: '`git stash pop` then `cat menu.md`', check: (w) => branch(w, R) === 'rye-loaf' && stashCount(w, R) === 0 && fileHas(w, R + '/menu.md', /tuesdays only/i) },
      ],
      takeaways: ['`git switch` refuses to overwrite uncommitted edits; `git stash` shelves them so the tree is clean.', '`git stash list` shows the shelf, `git stash pop` reapplies the top entry and removes it.', '`git switch -` returns to the branch you were on before.', 'The stash is local and short-term; anything that lives longer than a day belongs on a branch.'],
      solution: ['git switch hotfix', 'git stash', 'git stash list', 'git switch hotfix', 'echo "Holidays: closed" >> hours.txt', 'git commit -am "Note holiday closure in hours"', 'git switch -', 'git stash pop', 'cat menu.md'],
    },
    {
      id: 'history-cherry-pick',
      title: 'Cherry-pick: take just one commit',
      tagline: 'Copy a single commit from another branch onto yours, leaving the rest behind.',
      minutes: 8,
      article: cherryPick,
      setup: (w) => {
        seedRepo(w, R, [...HISTORY, { msg: 'Add address to README', files: { 'README.md': BAKERY['README.md'] + '\nFind us at 12 Harbour Stret, next to the ferry.\n' } }])
        seedBranch(w, R, 'experiments', 'main', [
          { msg: 'Try a lavender latte', files: { 'menu.md': BAKERY['menu.md'] + '- Lavender latte — $5 (experimental)\n' } },
          { msg: 'Fix typo in README address', files: { 'README.md': BAKERY['README.md'] + '\nFind us at 12 Harbour Street, next to the ferry.\n' } },
          { msg: 'Try a 48 hour ferment', files: { 'recipes/sourdough.md': '# Sourdough\n48 hour cold ferment (experimental).\n' } },
        ])
      },
      tasks: [
        { text: 'List what is on the experiments branch without switching to it: `git log experiments --oneline`.', hint: '`git log experiments --oneline`', check: (w) => ran(w, /^git\s+log\b.*(experiments|--all)/) },
        { text: 'Bring only the typo fix onto main: `git cherry-pick <hash>` (the hash of *Fix typo in README address*, or `experiments~1`).', hint: '`git cherry-pick experiments~1`', check: (w) => branch(w, R) === 'main' && hasCommit(w, /typo/i, 'main', R) && !hasCommit(w, /lavender/i, 'main', R) && !hasCommit(w, /48 hour/i, 'main', R) && (committedFile(w, 'README.md', 'main', R) ?? '').includes('Harbour Street') },
        { text: 'Look at `git log --oneline --graph --all`: the fix now exists twice, with two different hashes.', hint: '`git log --oneline --graph --all`', check: (w) => ranAfter(w, /^git\s+cherry-pick/, /^git\s+log\b.*--(all|graph)/) },
        { text: 'Check `cat README.md`: the address reads *Street*, and `menu.md` still has no lavender latte.', hint: '`cat README.md`', check: (w) => ranAfter(w, /^git\s+cherry-pick/, /^cat\s+README\.md/) && fileHas(w, R + '/README.md', 'Harbour Street') && !fileHas(w, R + '/menu.md', /lavender/i) },
      ],
      takeaways: ['`git cherry-pick <commit>` applies one commit\'s change to your branch as a new commit.', 'The original stays on its branch; the copy has a new hash.', 'Use it for single fixes and backports; for whole branches, merge or rebase.'],
      solution: ['git log experiments --oneline', 'git cherry-pick experiments~1', 'git log --oneline --graph --all', 'cat README.md'],
    },
    {
      id: 'history-tags',
      title: 'Tags: naming a release',
      tagline: 'A pointer that never moves, so you can always find the commit you shipped.',
      minutes: 9,
      article: tags,
      setup: (w) => { seedRepo(w, R, HISTORY) },
      tasks: [
        { text: 'Mark the current commit as the first release: `git tag v1.0`.', hint: '`git tag v1.0`', check: (w) => tagExists(w, 'v1.0', R) },
        { text: 'List your tags with `git tag`.', hint: '`git tag`', check: (w) => ran(w, /^git\s+tag(\s+(-l|--list))?\s*$/) && tagExists(w, 'v1.0', R) },
        { text: 'Add the line `- Rye loaf — $8` to `menu.md` and commit it as `Add rye loaf to menu`.', hint: '`echo "- Rye loaf — $8" >> menu.md` then `git commit -am "Add rye loaf to menu"`', check: (w) => hasCommit(w, /rye loaf/i, 'HEAD', R) && clean(w, R) },
        { text: 'Tag this new state with a message: `git tag -a v1.1 -m "Autumn release"`.', hint: '`git tag -a v1.1 -m "Autumn release"`', check: (w) => tagExists(w, 'v1.1', R) && tagHash(w, 'v1.1') !== tagHash(w, 'v1.0') && tagHash(w, 'v1.1') === head(w, R) },
        { text: 'Time-travel to the launch with `git checkout v1.0`, read the detached HEAD note, and `cat menu.md` to see there is no rye loaf.', hint: '`git checkout v1.0` (or `git switch --detach v1.0`)', check: (w) => isDetached(w, R) && head(w, R) === tagHash(w, 'v1.0') },
        { text: 'Come back to the present with `git switch main`.', hint: '`git switch main`', check: (w) => branch(w, R) === 'main' && !isDetached(w, R) && hasCommit(w, /rye loaf/i, 'HEAD', R) },
      ],
      takeaways: ['`git tag <name>` names the current commit; the tag never moves when the branch does.', '`git tag -a <name> -m "..."` makes an annotated tag with a message; use it for releases.', '`git checkout <tag>` puts you in detached HEAD to look around; `git switch main` brings you back.', 'Tags are pushed separately (`git push --tags`), as you will see in Module 4.'],
      solution: ['git tag v1.0', 'git tag', 'echo "- Rye loaf — $8" >> menu.md', 'git commit -am "Add rye loaf to menu"', 'git tag -a v1.1 -m "Autumn release"', 'git checkout v1.0', 'cat menu.md', 'git switch main'],
    },
  ],
}
