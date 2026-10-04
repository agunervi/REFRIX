import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { THEME_KEY } from '../lib/constants'

export type ThemePref = 'light' | 'dark' | 'system'

interface ThemeValue {
  pref: ThemePref
  isDark: boolean
  setPref: (pref: ThemePref) => void
}

const ThemeContext = createContext<ThemeValue | null>(null)

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* almacenamiento no disponible */
  }
  return 'system'
}

function resolveDark(pref: ThemePref): boolean {
  if (pref === 'dark') return true
  if (pref === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readPref)
  const [isDark, setIsDark] = useState(() => resolveDark(readPref()))

  useEffect(() => {
    const apply = () => {
      const dark = resolveDark(pref)
      setIsDark(dark)
      document.documentElement.classList.toggle('dark', dark)
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#0a0a0a' : '#10b981')
    }
    apply()
    if (pref !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [pref])

  const setPref = useCallback((next: ThemePref) => {
    setPrefState(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      /* almacenamiento no disponible */
    }
  }, [])

  const value = useMemo(() => ({ pref, isDark, setPref }), [pref, isDark, setPref])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider')
  return ctx
}
