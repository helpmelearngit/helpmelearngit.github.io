import type { Module } from '../types'
import type { World, PR } from '../../engine/world'
import { mergePR, prState, linkedIssues } from '../../engine/hub'
import { sh, seedRepo, seedBranch, writeFiles, createHubRepo, hubCommit, openPR, createIssue, reviewPR, hubUrl, head, branch, branchHash, branchExists, remoteRef, committedFile, commitCount, isAncestor, isMergeCommit, ran, hub, hubBranch, hubFile, hubLog, openPRs, mergedPRs, issues, ciPasses, type SeedCommit } from '../helpers'

// ---------- baseline: where the learner arrives from the remotes module ----------
const REPO = 'sunrise-bakery'
const KEY = (w: World) => `${w.user.handle}/${REPO}`

const README = '# Sunrise Bakery\n\nFresh bread, every morning since 2019.\n'
const MENU2 = '# Menu\n\n- Sourdough loaf — $7\n- Croissant — $3.50\n'
const MENU3 = MENU2 + '- Cinnamon roll — $4\n'
const MENU4 = MENU3 + '- Almond croissant — $4.50\n'
const MENU = MENU4 + '- Baguette — $3\n'
const HOURS1 = 'Mon-Fri 7am-3pm\nSat 8am-1pm\n'
const HOURS2 = 'Mon-Fri 7am-3pm\nSat 8am-2pm\n'
const HOURS = HOURS2 + 'Sun closed\n'
const SOURDOUGH = '# Sourdough\n\n24 hour cold ferment.\n'

const HISTORY: SeedCommit[] = [
  { msg: 'Add project README', files: { 'README.md': '# Sunrise Bakery\n' } },
  { msg: 'Add menu and opening hours', files: { 'menu.md': MENU2, 'hours.txt': HOURS1 } },
  { msg: 'Add cinnamon roll to menu', files: { 'menu.md': MENU3 } },
  { msg: 'Add sourdough recipe', files: { 'recipes/sourdough.md': '# Sourdough\n' } },
  { msg: 'Extend Saturday hours to 2pm', files: { 'hours.txt': HOURS2 } },
  { msg: 'Add almond croissant to menu', files: { 'menu.md': MENU4 } },
  { msg: 'Add Sunday closure to hours', files: { 'hours.txt': HOURS } },
  { msg: 'Describe the cold ferment', files: { 'recipes/sourdough.md': SOURDOUGH } },
  { msg: 'Add baguette to menu', files: { 'menu.md': MENU } },
  { msg: 'Add tagline to README', files: { 'README.md': README } },
]

/** ~/sunrise-bakery with its own history, pushed to an empty you/sunrise-bakery, main tracking origin/main, Maya as collaborator. */
function baseline(w: World) {
  const key = KEY(w)
  seedRepo(w, REPO, HISTORY)
  const h = createHubRepo(w, w.user.handle, REPO, { description: 'Fresh bread, every morning since 2019.' })
  h.collaborators = ['maya']
  sh(w, `git remote add origin ${hubUrl(key)}`, 'git push -u origin main')
  w.history.length = 0
  return h
}

/** Does this PR link an issue with a closing keyword, in its body or in one of its commit messages? */
const linksIssue = (w: World, pr: PR) => {
  try {
    const h = hub(w, KEY(w))
    if (!h) return false
    const text = pr.body + '\n' + prState(w, h, pr).commits.map((c) => w.commit(c).message).join('\n')
    return linkedIssues(text).length > 0
  } catch { return false }
}

// ---------- articles ----------
const prsOpen = `
Last month there were two of you and you pushed straight to \`main\`. It worked, mostly. Then Maya pushed a menu change at 6am that renamed the sourdough to "Sour Dough", and you found out from a customer. Nobody did anything wrong. The problem is that \`git push\` to \`main\` publishes *and* ships in one move. There is no moment where a second person looks.

A **pull request** (PR) adds that moment. You push your work to its own branch, then ask on the hub: "please pull this into main". Maya reads the diff, asks a question, suggests a fix. When you both agree, one click merges it. The PR stays behind as a record of what changed, who agreed, and why.

## The shape of it

\`\`\`figure
 your laptop                                 hub: you/sunrise-bakery

 main ──●──●                                 main ──●──●
           └──●  seasonal-menu                         └──●  seasonal-menu ──▶ PR #1
                │                                         ▲                   "merge into main"
                └─── git push -u origin seasonal-menu ────┘
caption: The change lives on its own branch, on the hub, with a request attached. main does not move until someone clicks Merge.
\`\`\`

A pull request is not a Git feature. Git knows branches and pushes; the *request* lives on the hub (GitHub, GitLab and friends all have one). It has three parts:

| Part | What it is |
|---|---|
| **Head** | The branch with your work, e.g. \`seasonal-menu\`. |
| **Base** | The branch you want it merged into, almost always \`main\`. |
| **Conversation** | Title, description, comments, reviews. The human half. |

Four things a PR gives you that a direct push cannot: a **review** by someone else, a **discussion** attached to the exact lines, a place for automated **checks** to run before anything ships (lesson 5), and a permanent **record** you can search a year later.

## Branch, commit, push

Nothing new in the first three steps. Start the branch from an up-to-date \`main\`, make the change, commit it:

\`\`\`bash
$ git switch -c seasonal-menu
Switched to a new branch 'seasonal-menu'
$ echo "- Pumpkin loaf — $8" >> menu.md
$ git add menu.md
$ git commit -m "Add pumpkin loaf for autumn"
[seasonal-menu 9b4e2d1] Add pumpkin loaf for autumn
 1 file changed, 1 insertion(+)
\`\`\`

Then publish the branch. \`-u\` tells Git that this local branch tracks \`origin/seasonal-menu\`, so later a plain \`git push\` and \`git pull\` know where to go:

\`\`\`bash
$ git push -u origin seasonal-menu
To https://github.com/you/sunrise-bakery.git
 * [new branch]      seasonal-menu -> seasonal-menu
branch 'seasonal-menu' set up to track 'origin/seasonal-menu'.
\`\`\`

## Opening the request

Switch to the hub pane. Click **New pull request**, pick \`main\` as the base and \`seasonal-menu\` as the head. Two fields matter:

- **Title**: a headline, like a good commit message. *Add pumpkin loaf for autumn*, not *menu changes*.
- **Description**: the *why*, and anything a reviewer should know. "Seasonal item through November. Price matches the farm-stand cost of pumpkin purée."

Create it and you land on **PR #1**. Three tabs:

- **Conversation** holds the description, comments and reviews.
- **Commits** lists exactly the commits that are on the head branch but not on the base.
- **Files changed** is the diff of those commits, the same thing \`git diff main..seasonal-menu\` prints. This is what reviewers read.

The Commits tab is nothing magic. Git has the same notation:

\`\`\`bash
$ git log --oneline origin/main..seasonal-menu
9b4e2d1 (HEAD -> seasonal-menu, origin/seasonal-menu) Add pumpkin loaf for autumn
\`\`\`

\`A..B\` means "commits reachable from B that are not reachable from A". Everything the PR will add to \`main\`, nothing else.

> **Why**
> The PR is where the rest of this module happens. Reviews land on it, checks run on it, issues link to it, and the merge button lives on it. Get comfortable with the branch → push → open loop now; you will run it for every change you make on a team.

## Gotchas

- Forgot \`-u\`? The push still works, but the next plain \`git push\` prints a hint telling you to set the upstream. Run the command it suggests.
- Committed on \`main\` by accident? \`git switch -c seasonal-menu\` *before pushing* takes the commit with you to the new branch. Lesson 5 shows the full rescue.
- One PR per idea. A PR that adds a loaf *and* changes the opening hours gets slower reviews and a muddier history.

## Up next

Maya has questions about that price. Next: reading a review, responding with another commit, and merging.
`

const prsReview = `
You opened PR #1 last lesson and went to bed. This morning the hub shows a red badge: **Changes requested**. Maya has left a note on the menu line: "Pumpkin loaf should be $8.50, not $8. The purée costs more than we thought."

That is not a rejection. It is the whole point. A review is a conversation about the diff, held *before* the change reaches customers.

## Three kinds of review

| Review | Means | Blocks merge? |
|---|---|---|
| **Comment** | "A thought, no verdict." | No |
| **Approve** | "Good to go." | No |
| **Request changes** | "Please fix this first." | Usually, by team convention or protection rules |

Review comments can hang on specific lines of the **Files changed** tab, so the discussion sits next to the code it is about. Reply there, not in chat; the next person to touch that line will find it.

## A PR follows its branch

The key idea of this lesson: a pull request is attached to a **branch**, not to a commit. Push more commits to \`seasonal-menu\` and PR #1 grows to include them. No new PR, no re-uploading.

\`\`\`figure
 PR #1   head: seasonal-menu ──▶ base: main

   before the review                 after you push the fix
   seasonal-menu ──●                 seasonal-menu ──●──────●
                   add loaf $8                       add    fix
                   ▲                                 loaf   price
                   Maya: "changes requested"                ▲ Maya: "approved"
caption: The PR shows whatever is on seasonal-menu right now. Each push updates the Commits and Files changed tabs.
\`\`\`

So responding to a review is just the loop you know:

\`\`\`bash
$ git switch seasonal-menu
Switched to branch 'seasonal-menu'
Your branch is up to date with 'origin/seasonal-menu'.
$ git add menu.md                       # after fixing the price in the editor
$ git commit -m "Correct pumpkin loaf price to $8.50"
[seasonal-menu 5d7c0a3] Correct pumpkin loaf price to $8.50
 1 file changed, 1 insertion(+), 1 deletion(-)
$ git push
To https://github.com/you/sunrise-bakery.git
   9b4e2d1..5d7c0a3  seasonal-menu -> seasonal-menu
\`\`\`

A plain \`git push\` works because \`-u\` last lesson set the upstream. Back in the hub pane, PR #1 now has two commits, and Maya gets a notification. She approves.

> **Tip**
> Add a *new* commit when answering a review. Do not \`--amend\` and force-push: the reviewer loses the thread between their comment and your fix. Small "fix review" commits are normal. If the team prefers one clean commit in \`main\`, that is what squash merging is for (next lesson).

## Merging

The **Merge pull request** button, with its default method, creates a **merge commit** on \`main\` with two parents: the old tip of \`main\` and the tip of your branch. Its message is written for you: *Merge pull request #1 from you/seasonal-menu*. The PR turns purple: **Merged**.

That happened on the hub. Your laptop does not know yet:

\`\`\`bash
$ git switch main
Switched to branch 'main'
Your branch is up to date with 'origin/main'.
\`\`\`

"Up to date" is Git comparing with the *last thing it fetched*, which was before the merge. Pull to find out the truth:

\`\`\`bash
$ git pull
From https://github.com/you/sunrise-bakery
   a1b2c3d..e4f5a6b  main       -> origin/main
Updating a1b2c3d..e4f5a6b
Fast-forward
 menu.md              |  1 +
 1 file changed, 1 insertion(+)
$ git log --oneline -3
e4f5a6b (HEAD -> main, origin/main) Merge pull request #1 from you/seasonal-menu
5d7c0a3 (seasonal-menu, origin/seasonal-menu) Correct pumpkin loaf price to $8.50
9b4e2d1 Add pumpkin loaf for autumn
\`\`\`

The pull is a fast-forward because your local \`main\` had nothing of its own; it simply caught up. Watch the graph pane: \`main\` jumps over the merge commit and the \`seasonal-menu\` line joins it.

> **Why**
> Review is how a team shares knowledge. Maya now knows the pumpkin loaf exists; you now know the purée got more expensive. Six months from now, anyone reading \`git log\` can open PR #1 and read the whole discussion. That trail is worth more than the code.

## Gotchas

- Merging your own PR the second it opens defeats the point. Wait for the review, or at least for the checks.
- After a merge on the hub, every teammate's local \`main\` is behind. Start each day with \`git switch main\` and \`git pull\`.
- \`git status\` and the "up to date" line only know what the last \`fetch\` or \`pull\` saw. When in doubt, fetch.

## Up next

That merge commit is one of three ways to land a PR. Next you compare merge, squash and rebase, and learn when teams pick each.
`

const prsMergeStrategies = `
Your PR to update the opening hours has three commits: *Open earlier on weekdays*, *Extend Saturday to 3pm*, *Add holiday note*. Maya approved. Now the merge button offers a dropdown with three choices, and the choice decides what \`main\`'s history looks like forever.

## Three shapes

\`\`\`figure
 before          main ──A──B
                           └──x──y──z   hours-update

 merge commit    main ──A──B─────────M        M has two parents. x, y, z stay as they were.
                           └──x──y──z┘

 squash          main ──A──B──S               S is one new commit = x + y + z combined.

 rebase          main ──A──B──x'──y'──z'      Copies of x, y, z, each with a new hash. No M.
caption: Same files at the end, three different histories. A tick mark (x') means "same change, new commit".
\`\`\`

| Method | main gets | Keeps every commit? | Merge commit? | Teams pick it when |
|---|---|---|---|---|
| **Create a merge commit** | M, pointing at B and z | Yes | Yes | They want the exact history and branch shape preserved. |
| **Squash and merge** | S, one commit titled after the PR | No, they become one | No | They want \`main\` to read as a list of PRs. Most common on product teams. |
| **Rebase and merge** | x', y', z' on top of B | Yes, as copies | No | They want a straight line *and* the individual commits. |

None is "right". **Merge** is honest and noisy: \`git log\` on \`main\` shows every *fix typo* commit from every branch. **Squash** is tidy: one PR, one commit, with the PR number in the message so you can always find the discussion. It also means your work-in-progress commits never reach \`main\`, which is why review-fix commits are harmless. **Rebase** keeps individual commits without merge bubbles, but rewrites their hashes, so your local branch no longer matches what landed.

Pick one per team and stick with it. Mixed histories are the worst of all three.

## Squash, then clean up

Squash PR #1 in the hub pane: **Merge pull request** → method **squash** → confirm. The commit on \`main\` is titled *Update opening hours for autumn (#1)*, with the three original subjects listed in its body. Then click **Delete branch**. The hub no longer needs \`hours-update\`; the PR keeps the commits forever.

Now your laptop:

\`\`\`bash
$ git pull
From https://github.com/you/sunrise-bakery
   b2c3d4e..7a8b9c0  main       -> origin/main
Updating b2c3d4e..7a8b9c0
Fast-forward
 hours.txt            |  5 +++--
 1 file changed, 3 insertions(+), 2 deletions(-)
$ git fetch --prune
From https://github.com/you/sunrise-bakery
 - [deleted]         (none)     -> origin/hours-update
\`\`\`

\`--prune\` removes remote-tracking branches whose remote branch is gone. Without it, \`origin/hours-update\` lingers on your machine as a ghost. Now delete the local branch:

\`\`\`bash
$ git branch -d hours-update
error: The branch 'hours-update' is not fully merged.
If you are sure you want to delete it, run 'git branch -D hours-update'.
\`\`\`

Git is right, in a narrow sense. \`-d\` asks "are this branch's commits reachable from \`main\`?" and x, y, z are not: \`main\` has S, a different commit with the same *content*. (Had you not pruned yet, Git would have compared with \`origin/hours-update\` instead and said yes.) After a squash or rebase merge the refusal is expected, and \`-D\` (capital) is the "I know what I did" version:

\`\`\`bash
$ git branch -D hours-update
Deleted branch hours-update (was 3c9f1e2).
\`\`\`

> **Why**
> You will see "not fully merged" dozens of times in your career. Knowing that it means "the hashes differ", not "your work is lost", saves a lot of nervous checking. The content is on \`main\`; \`cat hours.txt\` proves it.

## Gotchas

> **Warning**
> \`-D\` is a sharp tool. It also deletes branches that really *are* unmerged. Before using it, confirm the PR shows **Merged**, or run \`git log main..hours-update\` and make sure nothing is listed that you care about.

- The **Delete branch** button is safe: the PR still shows every commit and diff.
- After a **rebase** merge, the same \`-d\` refusal happens, for the same reason: x' is not x.
- Do not squash-merge a branch that other branches were started from; they will carry duplicate commits.

## Up next

PRs are one half of the hub's paperwork. Issues are the other, and a magic phrase links them.
`

const prsIssues = `
Maya noticed something at the register: croissants are $3.75 now, but the menu still says $3.50. She could have told you across the counter, or texted, or fixed it herself. Instead she opened an **issue** on the hub: *Croissant price is wrong on the menu*, with a sentence about when the price changed.

Why the ceremony? Because a text scrolls away. An issue is a numbered, searchable to-do item attached to the repository. Anyone can see it is open, claim it, discuss it and, when a fix lands, see exactly which change closed it.

## Issues and pull requests

| | Issue | Pull request |
|---|---|---|
| Talks about | A problem or idea | A specific change |
| Has code attached? | No | Yes, a branch |
| Ends by | Being closed | Being merged (or closed) |

Both get numbers from the **same** counter. Maya's issue is #1, so the PR you are about to open will be #2. Any \`#number\` typed in a title, description or comment becomes a link to that item.

\`\`\`figure
 Issue #1  "Croissant price is wrong on the menu"      PR #2  "Fix croissant price"
 ┌─────────────────────────────────────────┐          ┌──────────────────────────────────┐
 │ opened by maya                          │ ◀─link── │ body: "Fixes #1"                 │
 │ open ──────────────▶ closed by #2       │ ◀─merge─ │ head: fix-croissant-price        │
 └─────────────────────────────────────────┘          └──────────────────────────────────┘
caption: "Fixes #1" in the PR body links the two. Merging the PR closes the issue for you.
\`\`\`

## The magic words

Write one of these in the PR description (or in a commit message), followed by the issue number:

\`close\`, \`closes\`, \`closed\`, \`fix\`, \`fixes\`, \`fixed\`, \`resolve\`, \`resolves\`, \`resolved\`

When the PR is merged into the default branch, the hub closes that issue and notes "closed by #2" on it. Nobody has to remember to go back and tidy up. A bare \`#1\` without one of those words still links, but does not close.

## From issue to merged fix

The loop is the one you know, with the issue number threaded through it. Many teams name the branch after the issue, so \`1-croissant-price\` or \`fix-croissant-price\` both read well in \`git branch\`.

\`\`\`bash
$ git switch -c fix-croissant-price
Switched to a new branch 'fix-croissant-price'
$ git add menu.md                            # after changing $3.50 to $3.75 in the editor
$ git commit -m "Fix croissant price on the menu"
[fix-croissant-price 4e1f7b2] Fix croissant price on the menu
 1 file changed, 1 insertion(+), 1 deletion(-)
$ git push -u origin fix-croissant-price
To https://github.com/you/sunrise-bakery.git
 * [new branch]      fix-croissant-price -> fix-croissant-price
branch 'fix-croissant-price' set up to track 'origin/fix-croissant-price'.
\`\`\`

In the hub pane, open the PR and write a description like:

> Menu said $3.50; the register has charged $3.75 since September.
>
> Fixes #1

Notice the hub turns \`#1\` into a link, and the issue page now lists the PR under "linked pull requests". Merge with whichever method your team uses (any of the three closes the issue). Open issue #1: **Closed**, with *closed by #2* beside it.

Finally, bring \`main\` home:

\`\`\`bash
$ git switch main
$ git pull
\`\`\`

> **Why**
> Six months from now someone asks "why did the croissant price change?" \`git log\` shows *Fix croissant price (#2)*. PR #2 says *Fixes #1*. Issue #1 has Maya's explanation. Three clicks from a line in a file to the reason it exists. That chain is what issue linking buys you.

## Gotchas

- The closing words work from a PR *description* or a *commit message*. A comment on the PR does not count.
- Issues close only when the PR merges into the **default branch**. A PR into \`develop\` links but does not close.
- Reference the issue in the PR, not only in a commit buried on the branch; reviewers read the description first.

## Up next

Maya's issue was caught by a human. Next you let a script catch mistakes before anyone reviews, and make the hub refuse to merge until it passes.
`

const prsCI = `
The menu went live once with *Pumpkin loaf — $TBD*. A customer asked, deadpan, how much TBD was. Everyone laughed; nobody wanted it to happen twice. So the bakery wrote a four-line script, \`check-menu.sh\`, that fails if any menu line has a placeholder price, and told the hub to run it on every pull request.

Then Maya turned on **branch protection** for \`main\`: no direct pushes, changes only through a PR, and the PR cannot merge while the check is red. This is **continuous integration** (CI) at its smallest, and the shape is the same at companies with a thousand developers.

## What protection changes

\`\`\`figure
   git push main ───────────────────────▶  ✗  rejected: protected branch

   winter-menu ──●── push ──▶ PR #1 ──▶ check-menu.sh ──▶ ✗ red    Merge button disabled
                 └──●── push ──▶ PR #1 ──▶ check-menu.sh ──▶ ✓ green  Merge button enabled
caption: Every change takes the PR road. The check reruns on each push to the PR's branch; only a green head commit can merge.
\`\`\`

| Rule | Effect |
|---|---|
| **Require a pull request** | \`git push\` to \`main\` is refused, even for the owner. |
| **Require status checks** | The PR cannot merge until the named checks pass on its latest commit. |

Checks are scripts the hub runs on a fresh copy of your branch: tests, linters, a build, or a bakery-specific rule like "no TBD prices". The result shows on the PR as a green tick or a red cross, with a log you can expand.

## The rejection

Out of habit, you commit the gingerbread loaf straight on \`main\` and push:

\`\`\`bash
$ git push
To https://github.com/you/sunrise-bakery.git
 ! [remote rejected] main -> main (protected branch hook declined)
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: error: Changes must be made through a pull request.
error: failed to push some refs to 'https://github.com/you/sunrise-bakery.git'
\`\`\`

Nothing is lost. Your commit sits on local \`main\`, one ahead of \`origin/main\`. It just needs to live on a branch instead. Two commands do it, and both lean on the idea that a branch is only a label pointing at a commit:

\`\`\`bash
$ git branch winter-menu
$ git reset --hard origin/main
HEAD is now at a1b2c3d Add tagline to README
\`\`\`

\`git branch winter-menu\` puts a second label on your commit. \`git reset --hard origin/main\` moves the \`main\` label back to where the hub has it. The commit is untouched; \`winter-menu\` still points at it. Now switch over and publish:

\`\`\`bash
$ git switch winter-menu
Switched to branch 'winter-menu'
$ git push -u origin winter-menu
To https://github.com/you/sunrise-bakery.git
 * [new branch]      winter-menu -> winter-menu
branch 'winter-menu' set up to track 'origin/winter-menu'.
\`\`\`

## Red, then green

Open the PR. The **Checks** section shows **ci — failing**, and the merge button is greyed out with *Required status check "ci" is failing*. Expand the log:

\`\`\`
$ ./check-menu.sh
menu.md: placeholder price: - Gingerbread loaf — $TBD
Error: every menu item needs a real price.
\`\`\`

The fix is ordinary work on the branch. Edit the line to \`- Gingerbread loaf — $6\`, commit, \`git push\`. The PR picks up the new commit, the check reruns on it, the cross becomes a tick, and the merge button wakes up. Merge.

> **Why**
> A reviewer should spend attention on *is this the right change*, not on *did you leave a TBD in*. Checks take the boring half of review away from humans and never get tired. Protection makes them unskippable, which is what turns a good habit into a guarantee.

## Gotchas

> **Danger**
> Always \`git branch <name>\` *before* \`git reset --hard\`. Reset moves the label; without a second label the commit becomes unreachable. It is recoverable with \`git reflog\` (Module 3), but why go there.

- The check runs on the PR's **head commit**. Fixing the file locally does nothing until you push.
- A red check is information, not a verdict on you. Read the log; it usually names the line.
- Protection applies to everyone, including the repository owner. That is the point.

## Up next

While your PR waited for review, someone else's got merged first. Next: bringing your branch up to date with \`main\` without making a mess.
`

const prsUpdateBranch = `
You opened a PR on Tuesday adding a "bread of the month" section to the README. On Wednesday Maya merged her holiday-hours change. Your PR now says *This branch is out-of-date with the base branch*. Nothing is broken, but your commit was written against Tuesday's \`main\`, and you would like the review, and the checks, to see it on top of today's.

There are two ways to catch up. Merging \`main\` into your branch works but adds a *Merge branch 'main' into bread-of-the-month* commit that says nothing. Rebasing picks your commits up and sets them down on top of the new \`main\`, as if you had started today.

## What rebase does to your branch

\`\`\`figure
 after git fetch                            after git rebase origin/main

 origin/main ──A──B──C   (C: Maya's)        origin/main ──A──B──C
                  └──x   bread-of-the-month                      └──x'  bread-of-the-month

 x' = the same README change, re-applied on C. New parent, new hash. x is no longer on the branch.
caption: Rebase replays your commits onto the new tip. Your branch's history is rewritten; main's is not touched.
\`\`\`

Start by finding out what moved:

\`\`\`bash
$ git fetch
From https://github.com/you/sunrise-bakery
   b2c3d4e..f7e8d9c  main       -> origin/main
$ git log --oneline bread-of-the-month..origin/main
f7e8d9c (origin/main) Note holiday closures in hours
\`\`\`

\`fetch\` updates \`origin/main\` without touching your files. Now replay:

\`\`\`bash
$ git rebase origin/main
Successfully rebased and updated refs/heads/bread-of-the-month.
\`\`\`

Watch the graph pane: your commit detaches from the old spot and reappears above Maya's. Same message, same diff, new hash.

## The push that is rejected, and the one that is not

\`\`\`bash
$ git push
To https://github.com/you/sunrise-bakery.git
 ! [rejected]        bread-of-the-month -> bread-of-the-month (non-fast-forward)
error: failed to push some refs to 'https://github.com/you/sunrise-bakery.git'
hint: Updates were rejected because the remote contains work that you do not
hint: have locally. ... If you want to integrate the remote changes, use
hint: 'git pull' before pushing again.
\`\`\`

The hub has x. You are offering x', which does not descend from x. From the hub's point of view you are asking it to *throw away* a commit, and a plain \`push\` never does that. The hint about \`git pull\` is generic advice and wrong here: pulling would merge the old x back into your branch. You rewrote this branch on purpose, so say you mean it:

\`\`\`bash
$ git push --force-with-lease
To https://github.com/you/sunrise-bakery.git
 + 9b4e2d1...c3d4e5f bread-of-the-month -> bread-of-the-month (forced update)
\`\`\`

| Flag | Means | Risk |
|---|---|---|
| \`--force\` | "Overwrite the remote branch, whatever is there." | If Maya pushed a commit to your branch an hour ago, it is gone. |
| \`--force-with-lease\` | "Overwrite, **but only if** the remote branch is still where I last fetched it." | If anyone pushed in between, the push is refused with *stale info*. You fetch, look, and decide. |

Use \`--force-with-lease\` every time. Treat bare \`--force\` as a word you do not type.

> **Warning**
> Rewriting history is fine on **your own PR branch**: you are its only author and the PR is its only consumer. It is never fine on \`main\` or any branch others build on. Everyone who pulled the old commits would be left holding history that no longer exists, and their next push would fight yours.

## Rebase and merge

The PR is now up to date. Choose **Rebase and merge** on the hub. The hub does to \`main\` exactly what you did locally: it re-applies your commit on top of the current tip, no merge commit. \`main\` stays a straight line.

\`\`\`bash
$ git switch main
Switched to branch 'main'
Your branch is behind 'origin/main' by 1 commit, and can be fast-forwarded.
  (use "git pull" to update your local branch)
$ git pull
From https://github.com/you/sunrise-bakery
   f7e8d9c..2d9e8f1  main       -> origin/main
Updating b2c3d4e..2d9e8f1
Fast-forward
 README.md            |  4 ++++
 hours.txt            |  1 +
 2 files changed, 5 insertions(+)
$ git log --oneline -3
2d9e8f1 (HEAD -> main, origin/main) Add bread of the month to README
f7e8d9c Note holiday closures in hours
b2c3d4e Add tagline to README
\`\`\`

This time \`git switch main\` already knew it was behind, because the \`git fetch\` at the start of the lesson updated \`origin/main\`. The pull brings in both Maya's commit and the hub's copy of yours.

Note the hash: the hub made yet another copy, x''. Your local \`bread-of-the-month\` points at x', so cleaning it up needs \`git branch -D\`, exactly as in lesson 3.

> **Why**
> Teams that rebase PR branches get two things: checks that ran against the code that will actually ship, and a \`main\` whose history reads top to bottom with no detours. The price is learning \`--force-with-lease\`, and now you have.

## Gotchas

- A rebase can hit a conflict. Fix the file, \`git add\` it, \`git rebase --continue\`. Or \`git rebase --abort\` to return to exactly where you started.
- \`git pull\` on your PR branch after a rebase is wrong: it would merge the old x back in. Push with the lease instead.
- If \`--force-with-lease\` says *stale info*, do not escalate to \`--force\`. Fetch and look: someone pushed to your branch.

## Up next

Every PR so far was in a repository you own. In the next module you contribute to one you do not: forks.
`

// ---------- module ----------
export const module: Module = {
  id: 'prs',
  title: 'Collaboration with pull requests',
  blurb: 'The branch → push → review → merge loop every team runs, plus issues, checks and keeping a branch current.',
  lessons: [
    {
      id: 'prs-open',
      title: 'Your first pull request',
      tagline: 'Why not push to main: a branch, a push, and a request for someone to look.',
      minutes: 10,
      article: prsOpen,
      setup: (w) => { baseline(w) },
      panes: { hub: true },
      hubHome: '{you}/sunrise-bakery',
      tasks: [
        { text: 'Create a branch called `seasonal-menu` and switch to it.', hint: '`git switch -c seasonal-menu`', check: (w) => branch(w, REPO) === 'seasonal-menu' },
        { text: 'Add `- Pumpkin loaf — $8` to the end of `menu.md` and commit it as `Add pumpkin loaf for autumn`.', hint: '`echo "- Pumpkin loaf — $8" >> menu.md`, then `git add menu.md` and `git commit -m "Add pumpkin loaf for autumn"`', check: (w) => /pumpkin/i.test(committedFile(w, 'menu.md', 'seasonal-menu', REPO) ?? '') },
        { text: 'Publish the branch to the hub with `git push -u origin seasonal-menu`.', hint: '`git push -u origin seasonal-menu`', check: (w) => hubBranch(w, KEY(w), 'seasonal-menu') !== null && hubBranch(w, KEY(w), 'seasonal-menu') === branchHash(w, 'seasonal-menu', REPO) },
        { text: 'In the hub pane, open a pull request from `seasonal-menu` into `main` with a descriptive title.', hint: 'Click **New pull request**, choose `seasonal-menu` as the head and `main` as the base, title it *Add pumpkin loaf for autumn*, and create it.', check: (w) => openPRs(w, KEY(w)).some((p) => p.head.branch === 'seasonal-menu' && p.title.trim().length > 0) },
        { text: 'Open the **Commits** tab on the PR, then print the same list in the terminal with `git log --oneline origin/main..seasonal-menu`.', hint: '`git log --oneline origin/main..seasonal-menu`', check: (w) => ran(w, /^git\s+log\b.*origin\/main\.\./) && openPRs(w, KEY(w)).some((p) => p.head.branch === 'seasonal-menu') },
      ],
      takeaways: ['A pull request asks to merge one branch into another and gives the team a place to look first.', '`git push -u origin <branch>` publishes a branch and sets its upstream in one go.', 'The Commits tab is `git log main..branch`; Files changed is the diff of exactly those commits.'],
      solution: [
        'git switch -c seasonal-menu',
        'echo "- Pumpkin loaf — $8" >> menu.md',
        'git add menu.md',
        'git commit -m "Add pumpkin loaf for autumn"',
        'git push -u origin seasonal-menu',
        (w) => { openPR(w, KEY(w), { title: 'Add pumpkin loaf for autumn', body: 'Seasonal item through November. Price matches the farm-stand cost of pumpkin purée.', headRepo: KEY(w), headBranch: 'seasonal-menu', base: 'main' }) },
        'git log --oneline origin/main..seasonal-menu',
      ],
    },
    {
      id: 'prs-review',
      title: 'Code review',
      tagline: 'Maya requests a change; you push a fix, she approves, you merge and pull.',
      minutes: 12,
      article: prsReview,
      setup: (w) => {
        const h = baseline(w)
        seedBranch(w, REPO, 'seasonal-menu', 'main', [{ msg: 'Add pumpkin loaf for autumn', files: { 'menu.md': MENU + '- Pumpkin loaf — $8\n' } }])
        sh(w, 'git push -u origin seasonal-menu')
        const pr = openPR(w, KEY(w), { title: 'Add pumpkin loaf for autumn', body: 'Seasonal item through November.', headRepo: KEY(w), headBranch: 'seasonal-menu', base: 'main' })
        reviewPR(w, h, pr.number, 'changes_requested', 'Pumpkin loaf should be $8.50, not $8. The purée costs more than we thought.', 'maya')
        w.history.length = 0
      },
      onTick: (w, ctx) => {
        const h = hub(w, KEY(w))
        const pr = h?.prs.find((p) => p.head.branch === 'seasonal-menu' && p.state === 'open')
        if (h && pr && /8\.50/.test(hubFile(w, KEY(w), 'menu.md', 'seasonal-menu') ?? '')) ctx.once('maya-approves', () => reviewPR(w, h, pr.number, 'approved', 'Perfect, thanks. Ship it!', 'maya'))
      },
      panes: { hub: true },
      hubHome: '{you}/sunrise-bakery',
      tasks: [
        { text: 'Read Maya\'s review on PR #1 in the hub pane, then switch to `seasonal-menu` in the terminal.', hint: '`git switch seasonal-menu`', check: (w) => branch(w, REPO) === 'seasonal-menu' },
        { text: 'Change the pumpkin loaf price in `menu.md` from `$8` to `$8.50` (editor pane) and commit it as `Correct pumpkin loaf price to $8.50`.', hint: 'Edit the line to `- Pumpkin loaf — $8.50`, then `git add menu.md` and `git commit -m "Correct pumpkin loaf price to $8.50"`', check: (w) => /pumpkin loaf[^\n]*8\.50/i.test(committedFile(w, 'menu.md', 'seasonal-menu', REPO) ?? '') && commitCount(w, 'seasonal-menu', REPO) >= HISTORY.length + 2 },
        { text: 'Push the fix with a plain `git push`. Watch PR #1 pick up the second commit.', hint: '`git push`', check: (w) => hubBranch(w, KEY(w), 'seasonal-menu') === branchHash(w, 'seasonal-menu', REPO) && /8\.50/.test(hubFile(w, KEY(w), 'menu.md', 'seasonal-menu') ?? '') },
        { text: 'Maya has approved. Merge the PR with the default **Create a merge commit** method.', hint: 'Click **Merge pull request** on PR #1, leaving the method on *merge*.', check: (w) => mergedPRs(w, KEY(w)).some((p) => p.head.branch === 'seasonal-menu' && p.mergedAs === 'merge') },
        { text: 'Switch back to `main` and read the "up to date" line; Git does not know about the merge yet.', hint: '`git switch main`', check: (w) => branch(w, REPO) === 'main' && mergedPRs(w, KEY(w)).length > 0 },
        { text: 'Bring the merge down with `git pull`.', hint: '`git pull`', check: (w) => branch(w, REPO) === 'main' && head(w, REPO) === hubBranch(w, KEY(w), 'main') && isMergeCommit(w, REPO) },
        { text: 'Read the top of the history with `git log --oneline -3`: the merge commit, then your two commits.', hint: '`git log --oneline -3`', check: (w) => ran(w, /^git\s+log/) && head(w, REPO) === hubBranch(w, KEY(w), 'main') && isMergeCommit(w, REPO) },
      ],
      takeaways: ['A PR follows its head branch: push more commits and the PR updates itself.', 'Answer a review with a new commit, not an amend and force-push.', 'Merging happens on the hub; `git switch main` then `git pull` brings it to your machine.'],
      solution: [
        'git switch seasonal-menu',
        (w) => writeFiles(w, REPO, { 'menu.md': MENU + '- Pumpkin loaf — $8.50\n' }),
        'git add menu.md',
        'git commit -m "Correct pumpkin loaf price to $8.50"',
        'git push',
        (w) => { mergePR(w, hub(w, KEY(w))!, 1, 'merge') },
        'git switch main',
        'git pull',
        'git log --oneline -3',
      ],
    },
    {
      id: 'prs-merge-strategies',
      title: 'Merge, squash or rebase',
      tagline: 'Three ways to land a PR, what each does to history, and cleaning up afterwards.',
      minutes: 12,
      article: prsMergeStrategies,
      setup: (w) => {
        const h = baseline(w)
        seedBranch(w, REPO, 'hours-update', 'main', [
          { msg: 'Open earlier on weekdays', files: { 'hours.txt': 'Mon-Fri 6:30am-3pm\nSat 8am-2pm\nSun closed\n' } },
          { msg: 'Extend Saturday to 3pm', files: { 'hours.txt': 'Mon-Fri 6:30am-3pm\nSat 8am-3pm\nSun closed\n' } },
          { msg: 'Add holiday note', files: { 'hours.txt': 'Mon-Fri 6:30am-3pm\nSat 8am-3pm\nSun closed\nClosed on public holidays\n' } },
        ])
        sh(w, 'git push -u origin hours-update')
        const pr = openPR(w, KEY(w), { title: 'Update opening hours for autumn', body: 'Earlier weekday opening, a longer Saturday, and a note about holidays.', headRepo: KEY(w), headBranch: 'hours-update', base: 'main' })
        reviewPR(w, h, pr.number, 'approved', 'Looks right. Squash it so main stays tidy?', 'maya')
        w.history.length = 0
      },
      panes: { hub: true },
      hubHome: '{you}/sunrise-bakery',
      tasks: [
        { text: 'Merge PR #1 using **Squash and merge**.', hint: 'Click **Merge pull request**, pick *squash* from the method dropdown, confirm.', check: (w) => mergedPRs(w, KEY(w)).some((p) => p.head.branch === 'hours-update' && p.mergedAs === 'squash') && (hubLog(w, KEY(w), 'main')[0] ?? '').includes('Update opening hours') },
        { text: 'Click **Delete branch** on the merged PR to remove `hours-update` from the hub.', hint: 'The **Delete branch** button appears on the PR page after merging.', check: (w) => mergedPRs(w, KEY(w)).length > 0 && hubBranch(w, KEY(w), 'hours-update') === null },
        { text: 'You are on `main`. Run `git pull` to receive the squash commit.', hint: '`git pull`', check: (w) => branch(w, REPO) === 'main' && head(w, REPO) === hubBranch(w, KEY(w), 'main') },
        { text: 'Run `git fetch --prune` so the ghost `origin/hours-update` disappears locally too.', hint: '`git fetch --prune`', check: (w) => head(w, REPO) === hubBranch(w, KEY(w), 'main') && remoteRef(w, 'origin/hours-update', REPO) === null },
        { text: 'Try the polite delete, `git branch -d hours-update`, and read the refusal.', hint: '`git branch -d hours-update`', check: (w) => ran(w, /^git\s+branch\s+(-d|--delete)\s+hours-update/) },
        { text: 'Delete it anyway with `git branch -D hours-update`.', hint: '`git branch -D hours-update`', check: (w) => !branchExists(w, 'hours-update', REPO) },
      ],
      takeaways: ['Merge keeps everything and adds a merge commit; squash makes one commit per PR; rebase copies commits onto main.', 'After squash or rebase, `git branch -d` refuses because the hashes differ, not because work is lost; `-D` deletes anyway.', '`git fetch --prune` removes remote-tracking branches that no longer exist on the hub.'],
      solution: [
        (w) => { mergePR(w, hub(w, KEY(w))!, 1, 'squash') },
        (w) => { delete hub(w, KEY(w))!.repo.refs['refs/heads/hours-update'] },
        'git pull',
        'git fetch --prune',
        'git branch -d hours-update',
        'git branch -D hours-update',
      ],
    },
    {
      id: 'prs-issues',
      title: 'Issues and linking',
      tagline: 'Maya files a bug; "Fixes #1" in your PR closes it when the fix merges.',
      minutes: 10,
      article: prsIssues,
      setup: (w) => {
        const h = baseline(w)
        createIssue(w, h, { title: 'Croissant price is wrong on the menu', body: 'The menu still says $3.50 but we have charged $3.75 since September. Can someone fix menu.md?', author: 'maya', labels: ['bug'] })
        w.history.length = 0
      },
      panes: { hub: true },
      hubHome: '{you}/sunrise-bakery',
      tasks: [
        { text: 'Read issue #1 in the hub pane, then create a branch for the fix called `fix-croissant-price`.', hint: '`git switch -c fix-croissant-price`', check: (w) => branch(w, REPO) === 'fix-croissant-price' },
        { text: 'In `menu.md`, change the croissant price from `$3.50` to `$3.75` (editor pane) and commit it.', hint: 'Edit the line to `- Croissant — $3.75`, then `git add menu.md` and `git commit -m "Fix croissant price on the menu"`', check: (w) => { const m = committedFile(w, 'menu.md', 'fix-croissant-price', REPO) ?? ''; return /3\.75/.test(m) && !/3\.50/.test(m) } },
        { text: 'Publish the branch with `git push -u origin fix-croissant-price`.', hint: '`git push -u origin fix-croissant-price`', check: (w) => hubBranch(w, KEY(w), 'fix-croissant-price') !== null && hubBranch(w, KEY(w), 'fix-croissant-price') === branchHash(w, 'fix-croissant-price', REPO) },
        { text: 'Open a pull request whose description contains `Fixes #1`.', hint: 'Click **New pull request**, head `fix-croissant-price`, base `main`, and put `Fixes #1` in the description.', check: (w) => openPRs(w, KEY(w)).some((p) => p.head.branch === 'fix-croissant-price' && linksIssue(w, p)) },
        { text: 'Merge the pull request with any method.', hint: 'Click **Merge pull request** on PR #2.', check: (w) => mergedPRs(w, KEY(w)).some((p) => p.head.branch === 'fix-croissant-price') },
        { text: 'Issue #1 closed itself; confirm it in the hub pane. Then update local `main` with `git switch main` and `git pull`.', hint: '`git switch main` then `git pull`', check: (w) => issues(w, KEY(w)).some((i) => /croissant/i.test(i.title) && i.state === 'closed') && branch(w, REPO) === 'main' && head(w, REPO) === hubBranch(w, KEY(w), 'main') },
      ],
      takeaways: ['Issues track problems; pull requests track changes; both share one number sequence.', '`Fixes #N` (or closes/resolves) in a PR description or commit message closes issue N when the PR merges.', 'The chain commit → PR → issue is how future-you finds out *why* a line exists.'],
      solution: [
        'git switch -c fix-croissant-price',
        (w) => writeFiles(w, REPO, { 'menu.md': MENU.replace('$3.50', '$3.75') }),
        'git add menu.md',
        'git commit -m "Fix croissant price on the menu"',
        'git push -u origin fix-croissant-price',
        (w) => { openPR(w, KEY(w), { title: 'Fix croissant price', body: 'Menu said $3.50; the register has charged $3.75 since September.\n\nFixes #1', headRepo: KEY(w), headBranch: 'fix-croissant-price', base: 'main' }) },
        (w) => { mergePR(w, hub(w, KEY(w))!, 2, 'squash') },
        'git switch main',
        'git pull',
      ],
    },
    {
      id: 'prs-ci',
      title: 'Checks and protected branches',
      tagline: 'A script that rejects placeholder prices, and a main branch nobody can push to directly.',
      minutes: 12,
      article: prsCI,
      setup: (w) => {
        const h = baseline(w)
        h.ci = (files) => {
          const bad = (files['menu.md'] ?? '').split('\n').filter((l) => /TBD/.test(l))
          return bad.length
            ? { ok: false, log: ['$ ./check-menu.sh', ...bad.map((l) => `menu.md: placeholder price: ${l.trim()}`), 'Error: every menu item needs a real price.'] }
            : { ok: true, log: ['$ ./check-menu.sh', 'menu.md: all items priced.', 'OK'] }
        }
        h.protection = { branch: 'main', requirePR: true, requireChecks: true }
      },
      panes: { hub: true },
      hubHome: '{you}/sunrise-bakery',
      tasks: [
        { text: 'You are on `main`. Add `- Gingerbread loaf — $TBD` to the end of `menu.md` and commit it as `Add gingerbread loaf`.', hint: '`echo "- Gingerbread loaf — $TBD" >> menu.md`, `git add menu.md`, `git commit -m "Add gingerbread loaf"`', check: (w) => /TBD/.test(committedFile(w, 'menu.md', 'main', REPO) ?? '') },
        { text: 'Try `git push`. Read the rejection: `main` is protected.', hint: '`git push`', check: (w) => ran(w, /^git\s+push/) && hubBranch(w, KEY(w), 'main') === remoteRef(w, 'origin/main', REPO) && !/TBD/.test(hubFile(w, KEY(w), 'menu.md') ?? '') },
        { text: 'Rescue the commit: label it with `git branch winter-menu`, then move `main` back with `git reset --hard origin/main`.', hint: '`git branch winter-menu` then `git reset --hard origin/main`', check: (w) => /TBD/.test(committedFile(w, 'menu.md', 'winter-menu', REPO) ?? '') && branchHash(w, 'main', REPO) === hubBranch(w, KEY(w), 'main') },
        { text: 'Switch to `winter-menu` and publish it with `git push -u origin winter-menu`.', hint: '`git switch winter-menu` then `git push -u origin winter-menu`', check: (w) => branch(w, REPO) === 'winter-menu' && hubBranch(w, KEY(w), 'winter-menu') !== null && hubBranch(w, KEY(w), 'winter-menu') === branchHash(w, 'winter-menu', REPO) },
        { text: 'Open a pull request from `winter-menu` into `main`. Watch the `ci` check go red and the merge button grey out.', hint: 'Click **New pull request**, head `winter-menu`, base `main`.', check: (w) => openPRs(w, KEY(w)).some((p) => p.head.branch === 'winter-menu') && !ciPasses(w, KEY(w), 'winter-menu') },
        { text: 'Replace `$TBD` with a real price (`$6`) in `menu.md`, commit, and push. The check reruns and goes green.', hint: 'Edit the line to `- Gingerbread loaf — $6`, then `git add menu.md`, `git commit -m "Price the gingerbread loaf"`, `git push`', check: (w) => ciPasses(w, KEY(w), 'winter-menu') && hubBranch(w, KEY(w), 'winter-menu') === branchHash(w, 'winter-menu', REPO) && /gingerbread/i.test(hubFile(w, KEY(w), 'menu.md', 'winter-menu') ?? '') && openPRs(w, KEY(w)).some((p) => p.head.branch === 'winter-menu') },
        { text: 'Merge the pull request.', hint: 'Click **Merge pull request** on PR #1.', check: (w) => mergedPRs(w, KEY(w)).some((p) => p.head.branch === 'winter-menu') && /gingerbread/i.test(hubFile(w, KEY(w), 'menu.md') ?? '') },
      ],
      takeaways: ['Branch protection refuses direct pushes to `main`; every change goes through a PR.', 'A rejected push loses nothing: `git branch <name>` labels the commit, `git reset --hard origin/main` puts `main` back.', 'Checks run on the PR\'s head commit after every push; a required check must be green before merging.'],
      solution: [
        'echo "- Gingerbread loaf — $TBD" >> menu.md',
        'git add menu.md',
        'git commit -m "Add gingerbread loaf"',
        'git push',
        'git branch winter-menu',
        'git reset --hard origin/main',
        'git switch winter-menu',
        'git push -u origin winter-menu',
        (w) => { openPR(w, KEY(w), { title: 'Add gingerbread loaf for winter', body: 'First winter item. Price to be confirmed with the supplier.', headRepo: KEY(w), headBranch: 'winter-menu', base: 'main' }) },
        (w) => writeFiles(w, REPO, { 'menu.md': MENU + '- Gingerbread loaf — $6\n' }),
        'git add menu.md',
        'git commit -m "Price the gingerbread loaf"',
        'git push',
        (w) => { mergePR(w, hub(w, KEY(w))!, 1, 'merge') },
      ],
    },
    {
      id: 'prs-update-branch',
      title: 'Keeping a branch up to date',
      tagline: 'main moved while your PR waited: fetch, rebase, push --force-with-lease, rebase-merge.',
      minutes: 12,
      article: prsUpdateBranch,
      setup: (w) => {
        const h = baseline(w)
        seedBranch(w, REPO, 'bread-of-the-month', 'main', [{ msg: 'Add bread of the month to README', files: { 'README.md': README + '\n## Bread of the month\n\nOctober: pumpkin seed rye.\n' } }])
        sh(w, 'git push -u origin bread-of-the-month', 'git switch bread-of-the-month')
        openPR(w, KEY(w), { title: 'Add bread of the month to README', body: 'A rotating feature loaf, starting with October.', headRepo: KEY(w), headBranch: 'bread-of-the-month', base: 'main' })
        hubCommit(w, h, 'main', { 'hours.txt': HOURS + 'Closed on public holidays\n' }, 'Note holiday closures in hours', 'maya')
        w.history.length = 0
      },
      panes: { hub: true },
      hubHome: '{you}/sunrise-bakery',
      tasks: [
        { text: 'The PR says it is out of date. Run `git fetch` to learn what moved on the hub.', hint: '`git fetch`', check: (w) => remoteRef(w, 'origin/main', REPO) !== null && remoteRef(w, 'origin/main', REPO) === hubBranch(w, KEY(w), 'main') },
        { text: 'Replay your branch on top of the new main with `git rebase origin/main`.', hint: '`git rebase origin/main` (while on `bread-of-the-month`)', check: (w) => branch(w, REPO) === 'bread-of-the-month' && isAncestor(w, hubBranch(w, KEY(w), 'main') ?? '', head(w, REPO) ?? '') && !isMergeCommit(w, REPO) && /bread of the month/i.test(committedFile(w, 'README.md', 'HEAD', REPO) ?? '') },
        { text: 'Try a plain `git push` and read why it is rejected.', hint: '`git push`', check: (w) => ran(w, /^git\s+push(\s+origin(\s+bread-of-the-month)?)?\s*$/) && hubBranch(w, KEY(w), 'bread-of-the-month') !== head(w, REPO) },
        { text: 'Now push with `git push --force-with-lease`.', hint: '`git push --force-with-lease`', check: (w) => hubBranch(w, KEY(w), 'bread-of-the-month') === head(w, REPO) && isAncestor(w, hubBranch(w, KEY(w), 'main') ?? '', head(w, REPO) ?? '') },
        { text: 'Merge PR #1 on the hub with **Rebase and merge**.', hint: 'Click **Merge pull request**, pick *rebase* from the method dropdown, confirm.', check: (w) => mergedPRs(w, KEY(w)).some((p) => p.head.branch === 'bread-of-the-month' && p.mergedAs === 'rebase') },
        { text: 'Switch to `main` and `git pull`, then `git log --oneline -3`: a straight line, no merge commit.', hint: '`git switch main`, `git pull`, `git log --oneline -3`', check: (w) => branch(w, REPO) === 'main' && head(w, REPO) === hubBranch(w, KEY(w), 'main') && !isMergeCommit(w, REPO) },
      ],
      takeaways: ['`git fetch` then `git rebase origin/main` replays your PR commits on top of the current main.', 'A rebased branch needs `git push --force-with-lease`; it refuses if someone else pushed in between. Never use bare `--force`.', 'Rewriting your own PR branch is fine; rewriting `main` or any shared branch is not.'],
      solution: [
        'git fetch',
        'git rebase origin/main',
        'git push',
        'git push --force-with-lease',
        (w) => { mergePR(w, hub(w, KEY(w))!, 1, 'rebase') },
        'git switch main',
        'git pull',
        'git log --oneline -3',
      ],
    },
  ],
}
