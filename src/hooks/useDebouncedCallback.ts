import { useCallback, useEffect, useRef } from 'react'

/** Agrupa llamadas seguidas en una sola (útil para refrescos disparados por Realtime). */
export function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
): (...args: Args) => void {
  const fnRef = useRef(fn)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return useCallback(
    (...args: Args) => {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => fnRef.current(...args), delayMs)
    },
    [delayMs],
  )
}
