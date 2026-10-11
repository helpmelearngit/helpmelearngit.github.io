/**
 * Every lesson must be completable: run its reference solution and confirm each task check passes in order.
 * Also guards against tasks that are already satisfied right after setup.
 */
import { describe, it, expect } from 'vitest'
import { World } from '../engine/world'
import { exec } from '../engine/shell'
import { modules } from './index'
import type { Lesson } from './types'

export function walkLesson(lesson: Lesson, handle = 'you') {
  const w = new World()
  w.user.handle = handle
  lesson.setup(w)
  const seen = new Set<string>()
  const ctx = { once: (k: string, fn: () => void) => { if (!seen.has(k)) { seen.add(k); fn() } } }
  let done = 0
  const tick = () => { lesson.onTick?.(w, ctx); while (done < lesson.tasks.length && lesson.tasks[done].check(w)) done++ }
  tick()
  const afterSetup = done
  const trace: string[] = []
  for (const step of lesson.solution) {
    if (typeof step === 'string') { const r = exec(w, step); trace.push(`$ ${step}\n` + r.lines.map((l) => l.map((s) => s.t).join('')).join('\n')) } else { step(w); w.bump(); trace.push('[hub action]') }
    tick()
  }
  return { w, done, afterSetup, trace }
}

describe('lessons', () => {
  expect(modules.length).toBeGreaterThan(0)
  for (const m of modules) {
    describe(m.id, () => {
      for (const lesson of m.lessons) {
        it(`${lesson.id}: ${lesson.title}`, () => {
          expect(lesson.tasks.length).toBeGreaterThanOrEqual(2)
          expect(lesson.article.length).toBeGreaterThan(800)
          expect(lesson.takeaways.length).toBeGreaterThanOrEqual(2)
          const { done, afterSetup, trace } = walkLesson(lesson)
          expect(afterSetup, 'a task is already satisfied right after setup').toBe(0)
          expect(done, `only ${done}/${lesson.tasks.length} tasks completed by the solution.\nNext task: "${lesson.tasks[done]?.text}"\nTrace:\n${trace.join('\n')}`).toBe(lesson.tasks.length)
        })
      }
    })
  }
  it('lesson ids are unique and slug-like', () => {
    const ids = modules.flatMap((m) => m.lessons.map((l) => l.id))
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
  })
})
