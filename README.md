# helpmelearngit

Learn Git by doing, in the browser: a linear course of simulated exercises with a real-feeling terminal, a small code editor and a mini GitHub (pull requests, reviews, issues, CI checks, forks). Nothing runs on a server; progress is stored in the browser.

Live site: https://helpmelearngit.github.io

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine tests + every lesson's reference solution
npm run build      # static site in dist/
```

## How it is built

- `src/engine/` — a from-scratch Git model: content-addressed objects, refs, index, three-way merge, rebase, stash, reflog, remotes, plus a shell (`shell.ts`) and the simulated GitHub (`hub.ts`). No dependencies.
- `src/lessons/` — the curriculum. Each module is one file in `modules/`; see `docs/CONTENT.md` for the authoring guide. `lessons.test.ts` proves every lesson is completable.
- `src/ui/` — terminal, editor (CodeMirror), commit graph, GitHub pane, workspace.
- `src/pages/` — landing, curriculum, lesson, profile.

## Deploy

Pushes to `main` build and deploy through GitHub Actions (`.github/workflows/deploy.yml`).

One-time setup (the Actions token cannot do this itself): **Settings → Pages → Build and deployment → Source → GitHub Actions**. Then re-run the latest workflow from the Actions tab, or push any commit.

## Contributing a lesson

Read `docs/CONTENT.md`, copy the shape of `src/lessons/modules/basics.ts`, add a `solution`, run `npm test`.
