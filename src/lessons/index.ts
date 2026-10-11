import type { Module, Lesson } from './types'

const found = import.meta.glob<{ module: Module }>('./modules/*.ts', { eager: true })
const ORDER = ['terminal', 'basics', 'branches', 'history', 'remotes', 'prs', 'forks', 'mastery']

export const modules: Module[] = ORDER.map((id) => Object.values(found).find((m) => m.module?.id === id)?.module).filter((m): m is Module => !!m)
export const lessons: Lesson[] = modules.flatMap((m) => m.lessons)
export const moduleOf = (lesson: Lesson) => modules.find((m) => m.lessons.includes(lesson))!
export const findLesson = (id: string) => lessons.find((l) => l.id === id)
export const nextLesson = (id: string) => lessons[lessons.findIndex((l) => l.id === id) + 1]
export const prevLesson = (id: string) => lessons[lessons.findIndex((l) => l.id === id) - 1]
export const lessonNumber = (id: string) => lessons.findIndex((l) => l.id === id) + 1
