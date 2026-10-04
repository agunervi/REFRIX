import { useEffect, useState } from 'react'

/** Fuerza un render cada cierto tiempo (para textos relativos como "hace 2 min"). */
export function useTicker(intervalMs = 20_000): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return tick
}
