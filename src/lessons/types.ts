import type { World } from '../engine/world'

export interface Task {
  /** Markdown. One imperative sentence, e.g. "Stage `notes.txt` with `git add`." */
  text: string
  /** Markdown shown when learner clicks "Hint". Give the exact command. */
  hint?: string
  /** Pure predicate over world state. Must never throw. */
  check: (w: World) => boolean
}

export interface TickCtx {
  /** Run `fn` once per lesson session (keyed). Use for scripted teammate actions. */
  once: (key: string, fn: () => void) => void
}

export interface Lesson {
  /** Stable id, e.g. "branches-create". Used in URLs and progress. */
  id: string
  title: string
  /** One sentence under the title in lists. */
  tagline: string
  minutes: number
  /** Markdown article. See docs/CONTENT.md for the style guide. */
  article: string
  /** Build the starting world. */
  setup: (w: World) => void
  tasks: Task[]
  /** Runs after every command / hub action. Use ctx.once for scripted events. */
  onTick?: (w: World, ctx: TickCtx) => void
  /** Which workspace panes to show. Defaults: editor+graph on, hub off. */
  panes?: { hub?: boolean; editor?: boolean; graph?: boolean }
  /** Hub page to open first when the hub pane is on. Use `{you}` for the learner's handle, e.g. "{you}/sunrise-bakery". */
  hubHome?: string
  /** 2-4 bullets shown on completion. */
  takeaways: string[]
  /**
   * Reference solution, used by lessons.test.ts to prove every task is completable in order.
   * Strings are shell commands; functions perform hub-UI actions (open PR, merge, ...).
   */
  solution: (string | ((w: World) => void))[]
}

export interface Module {
  id: string
  title: string
  blurb: string
  optional?: boolean
  lessons: Lesson[]
}
