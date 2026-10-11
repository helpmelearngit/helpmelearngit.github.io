import type { Module } from '../types'
import { HOME, sh, seedRepo, writeFiles, repo, cwdIn, ran, fileHas, fileExists, staged, unstaged, untracked, clean, commitCount, lastMessage, hasCommit, committedFile, inIndex, head } from '../helpers'

const BAKERY = {
  'README.md': '# Sunrise Bakery\n\nFresh bread, every morning since 2019.\n',
  'menu.md': '# Menu\n\n- Sourdough loaf — $7\n- Croissant — $3.50\n',
  'hours.txt': 'Mon-Fri 7am-3pm\nSat 8am-1pm\n',
}

const whyGit = `
Maya runs Sunrise Bakery with you. Last Tuesday she emailed \`menu_final.md\`. On Wednesday came \`menu_final_v2.md\`. By Friday the folder held \`menu_FINAL_really.md\`, \`menu_v2_mayas_edits.md\` and a copy with no name at all. Nobody knew which one was on the website. Someone had deleted the croissant line and nobody knew who, or why.

This is the problem Git solves. Not "backups". Not "the cloud". **History you can trust**: who changed what, when, why, and the power to go back.

## What Git actually is

Git is a program that watches one folder, your **project**, and lets you save **snapshots** of it. Each snapshot is called a **commit**. A commit remembers every file exactly as it was, plus a message, an author and a time. Snapshots link to the one before them, so the chain of commits *is* the history of the project.

\`\`\`figure
 menu.md  hours.txt  README.md            menu.md  hours.txt  README.md
┌──────────────────────────────┐        ┌──────────────────────────────┐
│  "Add croissant to menu"     │ ◀───── │  "Open on Saturdays"         │
│  Maya · Tue 09:12            │        │  You · Wed 14:40             │
└──────────────────────────────┘        └──────────────────────────────┘
          commit 1                                 commit 2
caption: Each commit is a full snapshot of the folder plus a note. Commits point back at their parent.
\`\`\`

Everything Git knows lives in one hidden folder, \`.git\`, inside your project. Delete \`.git\` and the project is just files again. Copy the project somewhere else and the history travels with it. There is no server involved unless you want one (that is Module 4).

## Three words you will hear constantly

| Word | Means |
|---|---|
| **Repository** (repo) | A folder that Git is tracking. The project plus its \`.git\` history. |
| **Commit** | One saved snapshot with a message. Also the verb: "commit your work". |
| **Working tree** | The actual files you see and edit, as they are right now. |

## Turning a folder into a repository

One command: \`git init\`. Run it inside the folder you want to track.

\`\`\`bash
$ cd sunrise-bakery
$ git init
Initialized empty Git repository in /home/you/sunrise-bakery/.git/
$ ls -a
.  ..  .git  README.md  hours.txt  menu.md
\`\`\`

Nothing about your files changed. Git simply created \`.git\` and is now *able* to take snapshots. It has not taken one yet. Peek inside: \`cat .git/HEAD\` prints \`ref: refs/heads/main\`, which is Git's way of saying "the current line of history is called **main**". We will come back to that word in Module 2.

> **Why**
> Starting with \`git init\` instead of a download means you understand the one thing most tutorials skip: a repository is just a folder with a \`.git\` inside. Every clone, every GitHub project, every open-source library is exactly this.

## Gotchas

> **Warning**
> Run \`git init\` in the *project* folder, never in your home folder. A repository in \`~\` would try to track your entire computer. If you do it by accident, \`rm -r .git\` undoes it completely.

## Up next

Git is watching the bakery folder but has saved nothing. Next you learn the three places a change lives on its way to becoming a commit.
`

const threeAreas = `
You ran \`git init\`. Now \`git status\` says your files are *untracked*, which sounds alarming and is not. It means: "I see these files, but you have not told me to remember them." Saving a snapshot in Git is a two-step move, and understanding those two steps is the single most useful idea in this course.

## Three places

Every file lives in up to three places at once:

\`\`\`figure
   WORKING TREE            STAGING AREA              REPOSITORY
  (your files, now)      (the next snapshot,         (saved history,
                          being assembled)            permanent)

   menu.md  ──git add──▶  menu.md  ──git commit──▶  commit a1b2c3
   hours.txt               hours.txt                 "Add Saturday hours"
   README.md
caption: git add copies a file's current state into the staging area. git commit turns the staging area into a commit.
\`\`\`

1. **Working tree** – the real files. You edit here.
2. **Staging area** (also called the *index*) – a waiting room. You put the exact changes you want in the next snapshot here, with \`git add\`.
3. **Repository** – the chain of commits. \`git commit\` takes whatever is in the staging area and seals it as a new commit.

Why the middle step? Because you often change five files but only three belong together. The staging area lets you compose a commit that tells one clear story. You will feel the benefit in the diff lesson.

## The loop you will run a thousand times

\`\`\`bash
$ git status
On branch main

No commits yet

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	README.md
	hours.txt
	menu.md

$ git add README.md
$ git status
Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
	new file:   README.md

Untracked files:
	hours.txt
	menu.md

$ git commit -m "Add project README"
[main (root-commit) 3f2a9c1] Add project README
 1 file changed, 3 insertions(+)
 create mode 100644 README.md
\`\`\`

Read \`git status\` top to bottom and it tells you *exactly* which of the three places each file is in, and even which command moves it. Run it before and after everything. There is no such thing as running \`git status\` too often.

### Adding more than one file

\`git add menu.md hours.txt\` stages two files. \`git add .\` stages everything in the current folder (the dot means "here"). Early on, prefer naming files: it keeps you aware of what goes into each commit.

### The commit message

\`-m "..."\` attaches the message. Write it like a short headline in the present tense: *Add Saturday hours*, *Fix croissant price*. Future-you reading \`git log\` will be grateful. Leave out \`-m\` and Git opens an editor for a longer message; try it later.

> **Why**
> Git's safety comes from this: a commit is permanent and complete. Once "Add project README" exists, no amount of editing or deleting the file can lose that version. Every later lesson about undoing things depends on commits being a solid floor you can always stand back on.

## Gotchas

- \`git add\` captures the file *as it is right now*. Edit it again afterwards and the new edit is **not** staged. \`git status\` will show the file in both lists. Run \`git add\` again.
- A commit with nothing staged does nothing. Git will tell you.
- \`git commit\` without \`-m\` is not stuck. It opened an editor for your message.

## Up next

With the loop in your hands, you will build a few commits and read them back with \`git log\`.
`

const history = `
One commit is a snapshot. Several commits are a **history**, and history is what makes Git useful: you can see how the project got here, and you can go back.

## Build a history, one story at a time

The habit to form: make a change, stage it, commit it with a message that says *what* and *why*. Small commits, each about one thing.

\`\`\`bash
$ echo "- Cinnamon roll — $4" >> menu.md
$ git add menu.md
$ git commit -m "Add cinnamon roll to menu"
[main 8c1d2e4] Add cinnamon roll to menu
 1 file changed, 1 insertion(+)
\`\`\`

Why one thing per commit? Because later you will want to undo *only* the cinnamon roll, or find out *when* the price changed. A commit that mixes six unrelated edits cannot be picked apart.

## Reading history

\`git log\` lists commits, newest first, with everything Git recorded:

\`\`\`bash
$ git log
commit 8c1d2e4f... (HEAD -> main)
Author: You <you@example.com>
Date:   Mon Oct 5 09:12:00 2026 +0000

    Add cinnamon roll to menu

commit 3f2a9c1a...
Author: You <you@example.com>
Date:   Mon Oct 5 09:03:00 2026 +0000

    Add project README
\`\`\`

That long hex string is the commit's **hash**: a fingerprint computed from the snapshot, its message, author, time and parent. Change any of those and the hash changes. That is how Git guarantees history cannot be silently altered. You will usually refer to a commit by the first seven characters, \`8c1d2e4\`.

Most days you want the compact view:

\`\`\`bash
$ git log --oneline
8c1d2e4 (HEAD -> main) Add cinnamon roll to menu
3f2a9c1 Add project README
\`\`\`

\`HEAD\` marks the commit you are currently standing on. \`main\` is the name of this line of history. Both point at the newest commit right now; in Module 2 they will start to move independently.

\`\`\`figure
 3f2a9c1 ◀── 8c1d2e4 ◀── HEAD -> main
 "Add README"   "Add cinnamon roll"
caption: Each new commit points to its parent. HEAD and main ride along on the newest one.
\`\`\`

## Writing messages people will thank you for

- Present tense, imperative: *Add*, *Fix*, *Remove*, *Update*. Read it as "this commit will…".
- Under about 50 characters for the first line.
- Say *why* when the *what* is not obvious: *Raise croissant price to cover butter cost*, not *Update menu*.

> **Why**
> Everything powerful in Git (branches, undo, code review, finding who broke what) is built on this chain of small, well-described commits. A history of ten tiny commits is worth more than one giant "updates" commit, because each link can be inspected, reverted or shared on its own.

> **Tip**
> Look at the project in the **graph pane**. Every commit you make appears as a node. Watching the graph grow as you type is the fastest way to build an intuition for what the commands do.

## Gotchas

> **Warning**
> \`git add\` then more editing then \`git commit\` commits the *first* version, not the latest. \`git status\` would have warned you: the file appears under both "to be committed" and "not staged". When in doubt, \`git add\` again before committing.

## Up next

Before each commit you should know exactly what is about to be saved. \`git diff\` shows you.
`

const diff = `
Maya asks: "What did you change in the menu?" You could open the file and squint. Or you could ask Git, which knows the exact lines that differ between any two states of the project. That is \`git diff\`.

## Three diffs for three places

Remember the three areas? \`git diff\` compares them pairwise:

| Command | Compares | Answers |
|---|---|---|
| \`git diff\` | working tree **vs** staging area | "What have I edited but not staged yet?" |
| \`git diff --staged\` | staging area **vs** last commit | "What exactly will go into my next commit?" |
| \`git diff HEAD\` | working tree **vs** last commit | "Everything I have changed since the last commit." |

(\`--cached\` is an older spelling of \`--staged\`. Same thing.)

## Reading a diff

\`\`\`bash
$ git diff
diff --git a/hours.txt b/hours.txt
--- a/hours.txt
+++ b/hours.txt
@@ -1,2 +1,2 @@
 Mon-Fri 7am-3pm
-Sat 8am-1pm
+Sat 8am-2pm
\`\`\`

- Lines starting with \`-\` were removed (shown red in the terminal).
- Lines starting with \`+\` were added (green).
- A changed line shows as one removal plus one addition.
- Lines with a leading space are unchanged context, so you can see where the change sits.
- The \`@@ -1,2 +1,2 @@\` header says: this chunk starts at line 1 and spans 2 lines, in both the old and new versions.

## The reason the staging area exists

You edited two files this morning: fixed the Saturday hours **and** added a new pastry to the menu. Two different stories. Stage only the hours fix, check with \`git diff --staged\` that it is alone, and commit it. The menu change is still waiting in your working tree, untouched, ready for its own commit.

\`\`\`bash
$ git add hours.txt
$ git diff --staged          # only hours.txt shows up
$ git commit -m "Extend Saturday hours to 2pm"
$ git diff                   # menu.md is still here, unstaged
\`\`\`

This is why the diff and the staging area go together. \`git diff --staged\` is your last look before a commit becomes permanent. Make it a reflex.

> **Why**
> Code review (Module 5) is nothing more than other people reading your diffs. If your commits each tell one clean story, reviewers understand them in seconds. Mixed commits are where bugs hide.

## A shortcut, used carefully

\`git commit -a -m "..."\` stages every *tracked* file that changed and commits in one go. Handy when you really did change one thing. It never adds new files, and it skips the \`--staged\` check, so use it when you are sure.

## Gotchas

- \`git diff\` shows nothing after \`git add\`? Correct: the working tree and staging area now match. Use \`--staged\`.
- New, untracked files never appear in \`git diff\`. Git only diffs files it has been told about.

## Up next

You can see every change before it is saved. Now you can undo changes at each of the three stages.
`

const undo = `
Everyone types the wrong thing sometimes. Git makes that cheap, as long as you know which of the three areas holds the mistake. There is one undo tool per area.

## Undo in the working tree: \`git restore\`

You edited \`menu.md\`, made a mess, and want the version from your last commit back.

\`\`\`bash
$ git restore menu.md
\`\`\`

Done. The file is reset to what the staging area holds (which, unless you staged something, is the last commit). Your edits are gone for good, so look at \`git diff\` first.

## Undo in the staging area: \`git restore --staged\`

You staged \`hours.txt\` but realise it belongs in a different commit. Pull it back out of the waiting room:

\`\`\`bash
$ git restore --staged hours.txt
\`\`\`

The file is **unstaged** but your edits are untouched; they are still in the working tree. This is pure bookkeeping and completely safe.

\`\`\`figure
  WORKING TREE   ◀── git restore --staged ──   STAGING AREA   ◀── (next lesson) ──   REPOSITORY
       ▲
       └── git restore <file>  (discard edits, take the staged/committed version)
caption: Each undo command moves a change one step back toward safety. Nothing here touches committed history.
\`\`\`

## Fix the last commit: \`git commit --amend\`

You committed with the message *Add cinamon roll* and the typo is bothering you. Or you forgot to include a file. \`--amend\` replaces the last commit with a corrected one:

\`\`\`bash
$ git commit --amend -m "Add cinnamon roll to menu"
\`\`\`

Forgot a file? Stage it, then \`git commit --amend --no-edit\` folds it into the previous commit and keeps the message.

> **Why**
> Knowing one undo per area is what makes experimenting cheap. You can try an edit, stage it, even commit it, and still back out in seconds, so there is never a reason to keep a \`menu_backup_v2.md\` lying around again.

> **Danger**
> \`--amend\` *rewrites* the last commit: it gets a new hash. On your own machine that is harmless. Once a commit has been pushed somewhere others can see (Module 4), amending it causes trouble for them. Rule: amend only commits nobody else has yet.

## Which one do I need?

| The mistake is… | Use |
|---|---|
| in a file I edited but did not stage | \`git restore <file>\` |
| staged, but I changed my mind | \`git restore --staged <file>\` |
| in the last commit (message or missing file) | \`git commit --amend\` |
| in an older commit | Module 3: \`reset\`, \`revert\`, \`reflog\` |

> **Note**
> Older tutorials use \`git checkout -- <file>\` and \`git reset HEAD <file>\` for the first two. They still work; \`restore\` was added in 2019 to make the intent obvious.

## Up next

You can create history and polish the latest step of it. Next, the idea that makes Git different from "save as": working on several versions at once with **branches**.
`

export const module: Module = {
  id: 'basics',
  title: 'Your first repository',
  blurb: 'What Git is, why it exists, and the add-commit loop you will use for the rest of your life.',
  lessons: [
    {
      id: 'basics-why-git',
      title: 'Why Git exists',
      tagline: 'The menu_FINAL_v2 problem, snapshots, and turning a folder into a repository.',
      minutes: 8,
      article: whyGit,
      setup: (w) => { writeFiles(w, 'sunrise-bakery', BAKERY); w.cwd = HOME },
      panes: { graph: false },
      tasks: [
        { text: 'Move into the `sunrise-bakery` folder and look at what is there.', hint: '`cd sunrise-bakery` then `ls`', check: (w) => cwdIn(w, 'sunrise-bakery') },
        { text: 'Turn the folder into a repository with `git init`.', hint: '`git init` (while inside sunrise-bakery)', check: (w) => !!repo(w, 'sunrise-bakery') },
        { text: 'Prove the hidden `.git` folder appeared with `ls -a`.', hint: '`ls -a`', check: (w) => !!repo(w, 'sunrise-bakery') && ran(w, /^ls\s+-a/) },
        { text: 'Read `.git/HEAD` with `cat` to see which line of history you are on.', hint: '`cat .git/HEAD`', check: (w) => ran(w, /^cat\s+\.git\/HEAD/) },
        { text: 'Ask Git what it sees with `git status`.', hint: '`git status`', check: (w) => ran(w, /^git\s+status/) && !!repo(w, 'sunrise-bakery') },
      ],
      takeaways: ['A repository is just a folder with a `.git` directory inside.', '`git init` starts tracking; it changes none of your files.', 'A commit is a complete snapshot plus a message, linked to the one before.'],
      solution: ['cd sunrise-bakery', 'ls', 'git init', 'ls -a', 'cat .git/HEAD', 'git status'],
    },
    {
      id: 'basics-three-areas',
      title: 'Working tree, staging area, repository',
      tagline: 'The two-step save: git add puts changes in the waiting room, git commit seals them.',
      minutes: 10,
      article: threeAreas,
      setup: (w) => { writeFiles(w, 'sunrise-bakery', BAKERY); sh(w, 'cd ~/sunrise-bakery', 'git init') },
      tasks: [
        { text: 'Run `git status` and read which files are untracked.', hint: '`git status`', check: (w) => ran(w, /^git\s+status/) },
        { text: 'Stage just `README.md` with `git add`.', hint: '`git add README.md`', check: (w) => inIndex(w, 'README.md', 'sunrise-bakery') && !inIndex(w, 'menu.md', 'sunrise-bakery') || hasCommit(w, /README/i, 'HEAD', 'sunrise-bakery') },
        { text: 'Run `git status` again and notice README.md moved to "Changes to be committed".', hint: '`git status`', check: (w) => (staged(w, 'sunrise-bakery').includes('README.md') && w.history.filter((c) => /^git\s+status/.test(c)).length >= 2) || commitCount(w, 'HEAD', 'sunrise-bakery') >= 1 },
        { text: 'Make your first commit with the message `Add project README`.', hint: '`git commit -m "Add project README"`', check: (w) => hasCommit(w, /README/i, 'HEAD', 'sunrise-bakery') },
        { text: 'Stage both remaining files (`menu.md` and `hours.txt`) in one command and commit them as `Add menu and opening hours`.', hint: '`git add menu.md hours.txt` then `git commit -m "Add menu and opening hours"`', check: (w) => commitCount(w, 'HEAD', 'sunrise-bakery') >= 2 && committedFile(w, 'menu.md', 'HEAD', 'sunrise-bakery') !== null && committedFile(w, 'hours.txt', 'HEAD', 'sunrise-bakery') !== null },
        { text: 'Confirm with `git status` that the working tree is clean.', hint: '`git status`', check: (w) => clean(w, 'sunrise-bakery') && untracked(w, 'sunrise-bakery').length === 0 && w.history.filter((c) => /^git\s+status/.test(c)).length >= 3 },
      ],
      takeaways: ['Changes travel working tree → staging area → repository.', '`git add` stages a file as it is right now; `git commit -m` seals the staging area.', '`git status` always tells you where each file is and what to do next.'],
      solution: ['git status', 'git add README.md', 'git status', 'git commit -m "Add project README"', 'git add menu.md hours.txt', 'git commit -m "Add menu and opening hours"', 'git status'],
    },
    {
      id: 'basics-history',
      title: 'Building and reading history',
      tagline: 'Several small commits, good messages, and git log to read them back.',
      minutes: 9,
      article: history,
      setup: (w) => {
        seedRepo(w, 'sunrise-bakery', [
          { msg: 'Add project README', files: { 'README.md': BAKERY['README.md'] } },
          { msg: 'Add menu and opening hours', files: { 'menu.md': BAKERY['menu.md'], 'hours.txt': BAKERY['hours.txt'] } },
        ])
      },
      tasks: [
        { text: 'Add the line `- Cinnamon roll — $4` to the end of `menu.md` (editor or `echo >>`).', hint: '`echo "- Cinnamon roll — $4" >> menu.md`', check: (w) => fileHas(w, 'sunrise-bakery/menu.md', /cinnamon roll/i) },
        { text: 'Stage and commit it with the message `Add cinnamon roll to menu`.', hint: '`git add menu.md` then `git commit -m "Add cinnamon roll to menu"`', check: (w) => hasCommit(w, /cinnamon roll/i, 'HEAD', 'sunrise-bakery') },
        { text: 'Create `recipes/sourdough.md` with at least one line about sourdough, then commit it with a message of your own.', hint: '`mkdir recipes`, `echo "# Sourdough\\n24 hour cold ferment." > recipes/sourdough.md`, `git add recipes`, `git commit -m "Add sourdough recipe"`', check: (w) => committedFile(w, 'recipes/sourdough.md', 'HEAD', 'sunrise-bakery') !== null && commitCount(w, 'HEAD', 'sunrise-bakery') >= 4 },
        { text: 'Read the full history with `git log`.', hint: '`git log`', check: (w) => ran(w, /^git\s+log\s*$/) },
        { text: 'Now the compact version: `git log --oneline`.', hint: '`git log --oneline`', check: (w) => ran(w, /^git\s+log\s+--oneline/) && commitCount(w, 'HEAD', 'sunrise-bakery') >= 4 },
      ],
      takeaways: ['One commit per logical change, with a present-tense headline.', 'A commit hash is a fingerprint of the snapshot and its history.', '`git log --oneline` is the everyday view; HEAD marks where you stand.'],
      solution: ['echo "- Cinnamon roll — $4" >> menu.md', 'git add menu.md', 'git commit -m "Add cinnamon roll to menu"', 'mkdir recipes', 'echo "# Sourdough" > recipes/sourdough.md', 'git add recipes', 'git commit -m "Add sourdough recipe"', 'git log', 'git log --oneline'],
    },
    {
      id: 'basics-diff',
      title: 'Seeing what changed',
      tagline: 'git diff for each of the three areas, and composing a commit that tells one story.',
      minutes: 9,
      article: diff,
      setup: (w) => {
        seedRepo(w, 'sunrise-bakery', [
          { msg: 'Add project README', files: { 'README.md': BAKERY['README.md'] } },
          { msg: 'Add menu and opening hours', files: { 'menu.md': BAKERY['menu.md'], 'hours.txt': BAKERY['hours.txt'] } },
          { msg: 'Add cinnamon roll to menu', files: { 'menu.md': BAKERY['menu.md'] + '- Cinnamon roll — $4\n' } },
        ])
        writeFiles(w, 'sunrise-bakery', { 'hours.txt': 'Mon-Fri 7am-3pm\nSat 8am-2pm\n', 'menu.md': BAKERY['menu.md'] + '- Cinnamon roll — $4\n- Almond croissant — $4.50\n' })
      },
      tasks: [
        { text: 'You arrive to find two edited files. See both changes with `git diff`.', hint: '`git diff`', check: (w) => ran(w, /^git\s+diff\s*$/) },
        { text: 'Stage only `hours.txt`; leave `menu.md` alone.', hint: '`git add hours.txt`', check: (w) => staged(w, 'sunrise-bakery').includes('hours.txt') && !staged(w, 'sunrise-bakery').includes('menu.md') },
        { text: 'Check exactly what will be committed with `git diff --staged`.', hint: '`git diff --staged`', check: (w) => ran(w, /^git\s+diff\s+(--staged|--cached)/) && staged(w, 'sunrise-bakery').includes('hours.txt') },
        { text: 'Commit it as `Extend Saturday hours to 2pm`.', hint: '`git commit -m "Extend Saturday hours to 2pm"`', check: (w) => hasCommit(w, /saturday/i, 'HEAD', 'sunrise-bakery') && committedFile(w, 'hours.txt', 'HEAD', 'sunrise-bakery')?.includes('2pm') === true },
        { text: 'Now commit the menu change on its own as `Add almond croissant to menu`.', hint: '`git add menu.md` then `git commit -m "Add almond croissant to menu"` (or `git commit -am ...`)', check: (w) => hasCommit(w, /almond/i, 'HEAD', 'sunrise-bakery') && clean(w, 'sunrise-bakery') },
      ],
      takeaways: ['`git diff` = unstaged edits; `git diff --staged` = what the next commit contains.', 'Red `-` lines are gone, green `+` lines are new.', 'Stage selectively so each commit tells one story.'],
      solution: ['git diff', 'git add hours.txt', 'git diff --staged', 'git commit -m "Extend Saturday hours to 2pm"', 'git commit -am "Add almond croissant to menu"'],
    },
    {
      id: 'basics-undo',
      title: 'Undoing safely',
      tagline: 'restore, restore --staged and commit --amend: one undo per area.',
      minutes: 9,
      article: undo,
      setup: (w) => {
        seedRepo(w, 'sunrise-bakery', [
          { msg: 'Add project README', files: { 'README.md': BAKERY['README.md'] } },
          { msg: 'Add menu and opening hours', files: { 'menu.md': BAKERY['menu.md'], 'hours.txt': BAKERY['hours.txt'] } },
          { msg: 'Add cinamon roll to menu', files: { 'menu.md': BAKERY['menu.md'] + '- Cinnamon roll — $4\n' } },
        ])
        writeFiles(w, 'sunrise-bakery', { 'menu.md': '# Menu\n\n- Sourdough loaf — $7\n- Croissant — $3.50\n- Cinnamon roll — $4\nasdfkjh OOPS keyboard mash\n', 'hours.txt': 'Mon-Fri 7am-3pm\nSat 8am-1pm\nSun closed\n' })
        sh(w, 'git add hours.txt')
      },
      tasks: [
        { text: 'Someone mashed the keyboard into `menu.md`. Look at the damage with `git diff`, then throw the edit away with `git restore`.', hint: '`git restore menu.md`', check: (w) => !fileHas(w, 'sunrise-bakery/menu.md', /OOPS/) && fileHas(w, 'sunrise-bakery/menu.md', /Cinnamon/) },
        { text: '`hours.txt` is already staged but should not go in the next commit yet. Unstage it without losing the edit.', hint: '`git restore --staged hours.txt`', check: (w) => !staged(w, 'sunrise-bakery').includes('hours.txt') && unstaged(w, 'sunrise-bakery').includes('hours.txt') && fileHas(w, 'sunrise-bakery/hours.txt', /Sun closed/) },
        { text: 'The last commit message says *cinamon*. Fix the typo with `git commit --amend`.', hint: '`git commit --amend -m "Add cinnamon roll to menu"`', check: (w) => /cinnamon/i.test(lastMessage(w, 'sunrise-bakery')) && !/cinamon/i.test(lastMessage(w, 'sunrise-bakery')) && commitCount(w, 'HEAD', 'sunrise-bakery') === 3 },
        { text: 'Now commit the Sunday hours as `Add Sunday closure to hours`.', hint: '`git add hours.txt` then `git commit -m "Add Sunday closure to hours"`', check: (w) => hasCommit(w, /sunday/i, 'HEAD', 'sunrise-bakery') && clean(w, 'sunrise-bakery') },
        { text: 'Check `git log --oneline`: four commits, correct spelling, nothing lost.', hint: '`git log --oneline`', check: (w) => ran(w, /^git\s+log/) && commitCount(w, 'HEAD', 'sunrise-bakery') === 4 && head(w, 'sunrise-bakery') !== null && !fileExists(w, 'sunrise-bakery/.nothing') },
      ],
      takeaways: ['`git restore <file>` discards working-tree edits; look at the diff first.', '`git restore --staged <file>` unstages without touching your edits.', '`git commit --amend` rewrites the last commit; only do it before sharing.'],
      solution: ['git diff', 'git restore menu.md', 'git restore --staged hours.txt', 'git commit --amend -m "Add cinnamon roll to menu"', 'git add hours.txt', 'git commit -m "Add Sunday closure to hours"', 'git log --oneline'],
    },
  ],
}
