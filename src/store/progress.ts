import { useSyncExternalStore } from 'react'

export interface Profile { name: string; handle: string; createdAt: number }
export interface Progress {
  profile: Profile | null
  done: Record<string, number> // lessonId -> completed at (ms)
  tasks: Record<string, number> // lessonId -> tasks completed so far
  lastLesson: string | null
  skipPrimer: boolean
}

const KEY = 'hmlg:progress:v1'
const empty = (): Progress => ({ profile: null, done: {}, tasks: {}, lastLesson: null, skipPrimer: false })

let state: Progress = (() => { try { return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) ?? 'null') } } catch { return empty() } })()
const listeners = new Set<() => void>()
function set(next: Progress) {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* private mode etc. */ }
  listeners.forEach((l) => l())
}

export const progress = {
  get: () => state,
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } },
  createProfile(name: string, handle: string) {
    set({ ...state, profile: { name: name.trim() || 'You', handle: handle.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'you', createdAt: Date.now() } })
  },
  taskDone(lessonId: string, count: number) { if ((state.tasks[lessonId] ?? 0) < count) set({ ...state, tasks: { ...state.tasks, [lessonId]: count }, lastLesson: lessonId }) },
  lessonDone(lessonId: string) { if (!state.done[lessonId]) set({ ...state, done: { ...state.done, [lessonId]: Date.now() }, lastLesson: lessonId }) },
  visit(lessonId: string) { if (state.lastLesson !== lessonId) set({ ...state, lastLesson: lessonId }) },
  resetLesson(lessonId: string) { const done = { ...state.done }, tasks = { ...state.tasks }; delete done[lessonId]; delete tasks[lessonId]; set({ ...state, done, tasks }) },
  setSkipPrimer(v: boolean) { set({ ...state, skipPrimer: v }) },
  reset() { set(empty()) },
  export: () => JSON.stringify(state, null, 2),
  import(json: string) { const p = JSON.parse(json); if (!p || typeof p !== 'object' || !('done' in p)) throw new Error('Not a progress file'); set({ ...empty(), ...p }) },
}

export const useProgress = () => useSyncExternalStore(progress.subscribe, progress.get)
