import type { Module } from '../types'
import { HOME, sh, cwdIs, fileExists, dirExists, fileHas, file, ran, visited } from '../helpers'

const navigate = `
Before Git, a few minutes with the terminal. Git is a command-line tool: you type a command, press Enter, and read what comes back. The terminal on the right is a safe copy of a real one. Nothing you do here touches your computer.

## Where am I?

A terminal is always *somewhere*: inside one folder, called the **working directory**. Every command you run acts on that folder unless you say otherwise. Three commands cover almost all navigation:

| Command | Means | Think of it as |
|---|---|---|
| \`pwd\` | print working directory | "Where am I?" |
| \`ls\` | list | "What is here?" |
| \`cd <folder>\` | change directory | "Go there." |

\`\`\`bash
$ pwd
/home/you
$ ls
documents  photos
$ cd documents
$ pwd
/home/you/documents
\`\`\`

## Paths

A **path** is an address for a file or folder. \`/home/you/documents\` is an *absolute* path: it starts at the root \`/\` and spells out every step. \`documents\` on its own is a *relative* path: it starts from where you are now.

Two special names save a lot of typing:

- \`..\` means "the folder above me". \`cd ..\` goes up one level.
- \`~\` means your home folder. \`cd ~\` (or just \`cd\`) takes you home from anywhere.

\`\`\`figure
/                      ← root, the top of everything
└── home/
    └── you/           ← ~ (home)
        ├── documents/
        └── photos/
caption: The folder tree. Paths are just directions through it.
\`\`\`

> **Tip**
> Press **Tab** while typing a name and the terminal completes it for you. Press the **↑** arrow to bring back the previous command. These two keys will save you hours.

## Hidden files

Names that start with a dot (\`.git\`, \`.gitignore\`) are hidden. \`ls\` skips them; \`ls -a\` ("all") shows them. Git keeps its entire database inside a hidden \`.git\` folder, so you will use \`ls -a\` often.

> **Why**
> Git commands act on "the repository you are standing in". If \`git status\` ever says *not a git repository*, the first question is: where am I? \`pwd\` answers it.

## Up next

Looking around is half of it. Next you will create folders and files, which is what Git tracks.
`

const files = `
Git tracks files. Before it can track anything you need to create a few, and you need to be able to peek inside them. Four small commands do the job.

## Creating things

| Command | Does |
|---|---|
| \`mkdir <name>\` | make a new folder |
| \`touch <file>\` | create an empty file (or update its timestamp) |
| \`echo "text" > <file>\` | write text into a file, **replacing** what was there |
| \`echo "text" >> <file>\` | **append** text to the end of a file |

\`\`\`bash
$ mkdir notes
$ cd notes
$ echo "Buy flour" > todo.txt
$ echo "Call Maya" >> todo.txt
$ cat todo.txt
Buy flour
Call Maya
\`\`\`

The \`>\` arrow is called a **redirect**: it sends the output of a command into a file instead of onto the screen. One arrow overwrites, two arrows append. Mixing them up is the most common beginner slip.

## Reading things

\`cat <file>\` prints the whole file. For long files, \`head <file>\` shows the first ten lines and \`tail <file>\` the last ten.

## Removing and renaming

- \`rm <file>\` deletes a file. There is no trash can; it is gone.
- \`rm -r <folder>\` deletes a folder and everything in it. The \`-r\` means *recursive*.
- \`mv <old> <new>\` renames or moves.

> **Warning**
> \`rm\` does not ask twice. This is exactly the kind of mistake Git exists to protect you from: once a file is committed, deleting it by accident is a thirty-second fix. Until then, be careful.

> **Why**
> Every Git lesson from here on starts with "edit a file, then…". \`echo\`, \`cat\` and the editor pane are how you make and inspect those edits, and \`rm\` is the mistake Git will soon let you undo.

## The editor pane

Typing \`echo\` for every change gets old fast. The **Editor** tab above the terminal is a small code editor. Type \`code menu.md\` to open a file there, edit, and press **⌘S / Ctrl+S** to save. Real developers bounce between the editor and the terminal all day; you will too.

## Up next

You can now move around, create files and read them. That is all the terminal you need to start Git. Next: why Git exists at all.
`

export const module: Module = {
  id: 'terminal',
  title: 'Terminal primer',
  blurb: 'Ten minutes with the command line so the rest of the course makes sense. Skip it if you already know cd and ls.',
  optional: true,
  lessons: [
    {
      id: 'terminal-navigate',
      title: 'Where am I?',
      tagline: 'pwd, ls and cd: moving around a folder tree from the keyboard.',
      minutes: 6,
      article: navigate,
      setup: (w) => {
        sh(w, 'mkdir ~/documents', 'mkdir ~/photos', 'mkdir ~/documents/recipes', 'echo "Sunrise Bakery notes" > ~/documents/notes.txt', 'echo "sourdough: 24h ferment" > ~/documents/recipes/sourdough.txt', 'echo "hidden config" > ~/documents/.secret')
        w.cwd = HOME
      },
      panes: { editor: false, graph: false },
      tasks: [
        { text: 'Print the folder you are in with `pwd`.', hint: 'Type `pwd` and press Enter.', check: (w) => ran(w, /^pwd\b/) },
        { text: 'Go into the `documents` folder.', hint: '`cd documents`', check: (w) => cwdIs(w, 'documents') || cwdIs(w, 'documents/recipes') },
        { text: 'Go one level deeper, into `recipes`, then come back up to `documents` with `cd ..`.', hint: '`cd recipes` then `cd ..`', check: (w) => cwdIs(w, 'documents') && visited(w, 'documents/recipes') },
        { text: 'List the hidden files in `documents` with `ls -a`. You should spot `.secret`.', hint: '`ls -a`', check: (w) => ran(w, /^ls\s+-a/) },
        { text: 'Jump straight home with `cd ~`.', hint: '`cd ~` or just `cd`', check: (w) => cwdIs(w, '~') && visited(w, 'documents') },
      ],
      takeaways: ['The terminal always sits in one folder: `pwd` tells you which.', '`ls` lists, `ls -a` includes hidden dot-files like `.git`.', '`cd ..` goes up, `cd ~` goes home, Tab completes names.'],
      solution: ['pwd', 'cd documents', 'cd recipes', 'cd ..', 'ls -a', 'cd ~'],
    },
    {
      id: 'terminal-files',
      title: 'Making and reading files',
      tagline: 'mkdir, touch, echo, cat and rm: everything Git will later keep safe.',
      minutes: 7,
      article: files,
      setup: (w) => { w.cwd = HOME },
      panes: { graph: false },
      tasks: [
        { text: 'Create a folder called `sunrise-bakery` and move into it.', hint: '`mkdir sunrise-bakery` then `cd sunrise-bakery`', check: (w) => dirExists(w, 'sunrise-bakery') && cwdIs(w, 'sunrise-bakery') },
        { text: 'Create a file `hours.txt` containing the line `Mon-Fri 7am-3pm` using `echo` and `>`.', hint: '`echo "Mon-Fri 7am-3pm" > hours.txt`', check: (w) => fileHas(w, 'sunrise-bakery/hours.txt', 'Mon-Fri 7am-3pm') },
        { text: 'Append a second line `Sat 8am-1pm` with `>>` (two arrows, so the first line survives).', hint: '`echo "Sat 8am-1pm" >> hours.txt`', check: (w) => fileHas(w, 'sunrise-bakery/hours.txt', 'Mon-Fri 7am-3pm') && fileHas(w, 'sunrise-bakery/hours.txt', 'Sat 8am-1pm') },
        { text: 'Read the file back with `cat hours.txt` and confirm both lines are there.', hint: '`cat hours.txt`', check: (w) => ran(w, /^cat\s+hours\.txt/) },
        { text: 'Create an empty file `scratch.txt` with `touch`, then delete it again with `rm`.', hint: '`touch scratch.txt` then `rm scratch.txt`', check: (w) => !fileExists(w, 'sunrise-bakery/scratch.txt') && ran(w, /^touch\s+scratch\.txt/) && ran(w, /^rm\s+scratch\.txt/) },
        { text: 'Open `hours.txt` in the editor pane with `code hours.txt`, add a third line `Sun closed`, and save with ⌘S / Ctrl+S.', hint: '`code hours.txt`, type the line at the end, save.', check: (w) => fileHas(w, 'sunrise-bakery/hours.txt', /Sun closed/i) && (file(w, 'sunrise-bakery/hours.txt') ?? '').split('\n').filter(Boolean).length >= 3 },
      ],
      takeaways: ['`>` overwrites a file, `>>` appends to it.', '`cat` shows a file; `rm` deletes with no undo, which is where Git comes in.', 'Use the editor pane for anything longer than one line.'],
      solution: ['mkdir sunrise-bakery', 'cd sunrise-bakery', 'echo "Mon-Fri 7am-3pm" > hours.txt', 'echo "Sat 8am-1pm" >> hours.txt', 'cat hours.txt', 'touch scratch.txt', 'rm scratch.txt', 'echo "Sun closed" >> hours.txt'],
    },
  ],
}
