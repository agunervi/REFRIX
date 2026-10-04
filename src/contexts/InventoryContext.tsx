import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { SELECTED_INVENTORY_KEY } from '../lib/constants'
import { toUserMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { fetchOverview, syncServerClock } from '../services/inventories'
import type { InventoryOverview } from '../types/database'
import { useDebouncedCallback } from '../hooks/useDebouncedCallback'
import { useAuth } from './AuthContext'

export type ConnectionState = 'connecting' | 'connected' | 'offline'

interface InventoryListValue {
  inventories: InventoryOverview[]
  mine: InventoryOverview[]
  shared: InventoryOverview[]
  selected: InventoryOverview | null
  selectedId: string | null
  loading: boolean
  error: string | null
  connection: ConnectionState
  /** Momento (reloj local) de la última carga exitosa */
  lastSyncAt: number | null
  select: (id: string) => void
  refresh: () => Promise<void>
}

const InventoryListContext = createContext<InventoryListValue | null>(null)

function storageKey(userId: string): string {
  return `${SELECTED_INVENTORY_KEY}:${userId}`
}

export function InventoryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [inventories, setInventories] = useState<InventoryOverview[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = selectedId

  const refresh = useCallback(async () => {
    if (!userId) return
    try {
      const [rows] = await Promise.all([fetchOverview(), syncServerClock()])
      setInventories(rows)
      setError(null)
      setLastSyncAt(Date.now())
      // Mantener una selección válida: la guardada, la actual o la primera propia
      let stored: string | null = null
      try {
        stored = localStorage.getItem(storageKey(userId))
      } catch {
        /* almacenamiento no disponible */
      }
      const candidates = [selectedIdRef.current, stored]
      const valid = candidates.find((id) => id && rows.some((r) => r.id === id)) ?? null
      const fallback = rows.find((r) => r.owner_id === userId)?.id ?? rows[0]?.id ?? null
      setSelectedId(valid ?? fallback)
    } catch (e) {
      setError(toUserMessage(e))
    } finally {
      setLoading(false)
    }
  }, [userId])

  const debouncedRefresh = useDebouncedCallback(() => void refresh(), 500)

  // Carga inicial y reinicio al cambiar de usuario
  useEffect(() => {
    setInventories([])
    setSelectedId(null)
    setLoading(Boolean(userId))
    if (userId) void refresh()
  }, [userId, refresh])

  // Tiempo real: cambios en inventarios, colaboradores y movimientos de cualquiera de mis inventarios.
  // (Los DELETE no son filtrables en Realtime, por eso también se refresca al volver a la app.)
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`overview:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventories' }, () => debouncedRefresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_members' }, () => debouncedRefresh())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_movements' }, () => debouncedRefresh())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('connected')
          void refresh()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnection('offline')
        } else {
          setConnection('connecting')
        }
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, debouncedRefresh, refresh])

  // Al volver a la pestaña o recuperar internet se actualiza todo
  useEffect(() => {
    if (!userId) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const onOnline = () => void refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [userId, refresh])

  const select = useCallback(
    (id: string) => {
      setSelectedId(id)
      if (userId) {
        try {
          localStorage.setItem(storageKey(userId), id)
        } catch {
          /* almacenamiento no disponible */
        }
      }
    },
    [userId],
  )

  const value = useMemo<InventoryListValue>(() => {
    const mine = inventories.filter((i) => i.owner_id === userId)
    const shared = inventories.filter((i) => i.owner_id !== userId)
    const selected = inventories.find((i) => i.id === selectedId) ?? null
    return { inventories, mine, shared, selected, selectedId, loading, error, connection, lastSyncAt, select, refresh }
  }, [inventories, userId, selectedId, loading, error, connection, lastSyncAt, select, refresh])

  return <InventoryListContext.Provider value={value}>{children}</InventoryListContext.Provider>
}

export function useInventories(): InventoryListValue {
  const ctx = useContext(InventoryListContext)
  if (!ctx) throw new Error('useInventories debe usarse dentro de InventoryProvider')
  return ctx
}
