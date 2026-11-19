"use client"

import { useSyncExternalStore } from "react"

const subscribe = () => () => {}

/**
 * `false` no SSR e na hidratação, `true` depois no cliente.
 * Substitui o padrão `useEffect(() => setMounted(true), [])` sem setState em effect.
 */
export function useIsMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
