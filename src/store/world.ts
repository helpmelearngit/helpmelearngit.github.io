import { useSyncExternalStore } from 'react'
import type { World } from '../engine/world'

/** Re-render when the world changes (any command, hub action, editor save). */
export const useWorld = (w: World) => useSyncExternalStore(w.subscribe.bind(w), () => w.version)
