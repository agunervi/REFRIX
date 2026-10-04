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
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { showBrowserNotification } from '../lib/browserNotify'
import { COMMON_UNITS } from '../lib/constants'
import { toUserMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { normalizeMovement, normalizeProduct, statusOf } from '../lib/stock'
import { fetchLastMovement, syncServerClock } from '../services/inventories'
import { fetchMembers } from '../services/members'
import { fetchNotifications, fetchPendingAlerts } from '../services/notifications'
import { adjustQuantity, fetchProducts, setQuantity as setQuantityRpc } from '../services/products'
import { fetchShopping } from '../services/shopping'
import { fetchStructure, type Structure } from '../services/structure'
import type {
  AppNotification,
  Category,
  CustomUnit,
  InventoryOverview,
  Location,
  Member,
  Movement,
  PendingAlert,
  Product,
  Role,
  ShoppingItem,
  Subcategory,
} from '../types/database'
import { useDebouncedCallback } from '../hooks/useDebouncedCallback'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useAuth } from './AuthContext'
import { useInventories } from './InventoryContext'
import { useToast } from './ToastContext'

export type SyncState = 'synced' | 'syncing' | 'offline'
export type Part = 'products' | 'structure' | 'shopping' | 'members' | 'notifications' | 'alerts' | 'lastChange'

const ALL_PARTS: Part[] = ['products', 'structure', 'shopping', 'members', 'notifications', 'alerts', 'lastChange']
const EMPTY_STRUCTURE: Structure = { locations: [], categories: [], subcategories: [], units: [] }

export interface InventoryData {
  inventory: InventoryOverview
  role: Role
  canWrite: boolean
  canAdmin: boolean
  isOwner: boolean
  loading: boolean
  error: string | null
  products: Product[]
  locations: Location[]
  categories: Category[]
  subcategories: Subcategory[]
  customUnits: CustomUnit[]
  allUnits: string[]
  shopping: ShoppingItem[]
  members: Member[]
  notifications: AppNotification[]
  unreadCount: number
  alerts: PendingAlert[]
  lastChange: Movement | null
  /** Aumenta con cada movimiento nuevo; sirve para refrescar el historial */
  movementsVersion: number
  sync: SyncState
  lastSyncAt: number | null
  justReconnected: boolean
  adjust: (product: Product, delta: number) => Promise<void>
  setQuantity: (product: Product, quantity: number, action?: 'set' | 'clear') => Promise<void>
  reload: (...parts: Part[]) => Promise<void>
  track: <T>(promise: Promise<T>) => Promise<T>
  applyProduct: (product: Product) => void
}

const InventoryDataContext = createContext<InventoryData | null>(null)

const round3 = (n: number) => Math.round(n * 1000) / 1000

function sortByName<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

interface ProviderProps {
  inventory: InventoryOverview
  children: ReactNode
}

/** Debe montarse con key={inventory.id}: así el estado nunca se mezcla entre inventarios. */
export function InventoryDataProvider({ inventory, children }: ProviderProps) {
  const { user } = useAuth()
  const toast = useToast()
  const online = useOnlineStatus()
  const { refresh: refreshOverview } = useInventories()

  const inventoryId = inventory.id
  const userId = user?.id ?? ''

  const [products, setProducts] = useState<Product[]>([])
  const [structure, setStructure] = useState<Structure>(EMPTY_STRUCTURE)
  const [shopping, setShopping] = useState<ShoppingItem[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [alerts, setAlerts] = useState<PendingAlert[]>([])
  const [lastChange, setLastChange] = useState<Movement | null>(null)
  const [movementsVersion, setMovementsVersion] = useState(0)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  const [refreshing, setRefreshing] = useState(0)
  const [channelState, setChannelState] = useState<'connecting' | 'subscribed' | 'error'>('connecting')
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)
  const [justReconnected, setJustReconnected] = useState(false)

  const inflight = useRef(new Map<string, number>())
  const structureVersion = useRef(inventory.structure_version)
  const loadedOnce = useRef(false)

  // ---------------------------------------------------------------- carga
  const load = useCallback(
    async (parts: Part[], quiet = false) => {
      if (!userId) return
      if (!quiet) setRefreshing((n) => n + 1)
      try {
        const has = (p: Part) => parts.includes(p)
        const tasks: Promise<unknown>[] = []
        if (has('products')) tasks.push(fetchProducts(inventoryId).then(setProducts))
        if (has('structure')) tasks.push(fetchStructure(inventoryId).then(setStructure))
        if (has('shopping')) tasks.push(fetchShopping(inventoryId).then(setShopping))
        if (has('members')) tasks.push(fetchMembers(inventoryId).then(setMembers))
        if (has('notifications')) tasks.push(fetchNotifications(inventoryId, userId).then(setNotifications))
        if (has('alerts')) tasks.push(fetchPendingAlerts(inventoryId).then(setAlerts))
        if (has('lastChange')) tasks.push(fetchLastMovement(inventoryId).then(setLastChange))
        await Promise.all(tasks)
        loadedOnce.current = true
        setError(null)
        setLastSyncAt(Date.now())
      } catch (e) {
        if (!loadedOnce.current) setError(toUserMessage(e))
      } finally {
        if (!quiet) setRefreshing((n) => n - 1)
      }
    },
    [inventoryId, userId],
  )

  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    let active = true
    void load(ALL_PARTS).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [load])

  const reload = useCallback((...parts: Part[]) => load(parts.length ? parts : ALL_PARTS, true), [load])

  const reloadStructure = useDebouncedCallback(() => {
    void loadRef.current(['structure', 'shopping', 'members', 'alerts'], true)
  }, 300)

  const reloadAux = useDebouncedCallback(() => {
    void loadRef.current(['notifications', 'alerts'], true)
  }, 800)

  // Cambió la estructura según el inventario recibido desde la lista (respaldo del canal)
  useEffect(() => {
    if (inventory.structure_version !== structureVersion.current) {
      structureVersion.current = inventory.structure_version
      reloadStructure()
    }
  }, [inventory.structure_version, reloadStructure])

  // ------------------------------------------------------------ tiempo real
  useEffect(() => {
    if (!userId) return

    const onProduct = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (payload.eventType === 'DELETE') {
        const id = (payload.old as { id?: string }).id
        if (id) setProducts((prev) => prev.filter((p) => p.id !== id))
        return
      }
      const product = normalizeProduct(payload.new)
      // Si yo tengo cambios en vuelo sobre este producto, mi respuesta manda
      if ((inflight.current.get(product.id) ?? 0) > 0) return
      setProducts((prev) => {
        const exists = prev.some((p) => p.id === product.id)
        return sortByName(exists ? prev.map((p) => (p.id === product.id ? product : p)) : [...prev, product])
      })
    }

    const onMovement = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (payload.eventType !== 'INSERT') return
      const movement = normalizeMovement(payload.new)
      setLastChange((prev) => (!prev || movement.created_at >= prev.created_at ? movement : prev))
      setMovementsVersion((v) => v + 1)
      if (movement.action === 'delete' && movement.product_id) {
        const id = movement.product_id
        setProducts((prev) => prev.filter((p) => p.id !== id))
      }
      reloadAux()
    }

    const onInventory = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (payload.eventType !== 'UPDATE') return
      const version = Number((payload.new as { structure_version?: number }).structure_version ?? 0)
      if (version !== structureVersion.current) {
        structureVersion.current = version
        reloadStructure()
      }
      void refreshOverview()
    }

    const onNotification = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (payload.eventType === 'DELETE') {
        const id = (payload.old as { id?: string }).id
        if (id) setNotifications((prev) => prev.filter((n) => n.id !== id))
        return
      }
      const n = payload.new as unknown as AppNotification
      if (n.inventory_id !== inventoryId) return
      setNotifications((prev) => [n, ...prev.filter((x) => x.id !== n.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)))
      if (payload.eventType === 'INSERT' && document.visibilityState !== 'visible') {
        void showBrowserNotification({
          title: inventory.name,
          body: n.message,
          url: `/i/${inventoryId}/alertas`,
          tag: n.id,
        })
      }
    }

    const channel = supabase
      .channel(`inv:${inventoryId}:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `inventory_id=eq.${inventoryId}` }, onProduct)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_movements', filter: `inventory_id=eq.${inventoryId}` }, onMovement)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'inventories', filter: `id=eq.${inventoryId}` }, onInventory)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, onNotification)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_alerts', filter: `inventory_id=eq.${inventoryId}` }, () => reloadAux())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setChannelState('subscribed')
          // Al (re)conectar se recupera lo que pudo perderse mientras no había canal
          const reconnect = loadedOnce.current
          void loadRef.current(ALL_PARTS, !reconnect)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setChannelState('error')
        } else {
          setChannelState('connecting')
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [inventoryId, inventory.name, userId, reloadStructure, reloadAux, refreshOverview])

  // Recuperar internet o volver a la pestaña
  useEffect(() => {
    const onOnline = () => {
      void syncServerClock()
      void loadRef.current(ALL_PARTS)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void loadRef.current(['products', 'lastChange', 'notifications', 'alerts'], true)
      }
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // ------------------------------------------------------ estado de sincronización
  const sync: SyncState =
    !online || channelState === 'error'
      ? 'offline'
      : pending > 0 || refreshing > 0 || channelState === 'connecting'
        ? 'syncing'
        : 'synced'

  const prevSync = useRef<SyncState>(sync)
  useEffect(() => {
    let timer: number | undefined
    if (prevSync.current === 'offline' && sync === 'synced') {
      setJustReconnected(true)
      timer = window.setTimeout(() => setJustReconnected(false), 5000)
    }
    prevSync.current = sync
    return () => window.clearTimeout(timer)
  }, [sync])

  // -------------------------------------------------------------- acciones
  const track = useCallback(async <T,>(promise: Promise<T>): Promise<T> => {
    setPending((n) => n + 1)
    try {
      return await promise
    } finally {
      setPending((n) => n - 1)
    }
  }, [])

  const applyProduct = useCallback((product: Product) => {
    setProducts((prev) => {
      const exists = prev.some((p) => p.id === product.id)
      return sortByName(exists ? prev.map((p) => (p.id === product.id ? product : p)) : [...prev, product])
    })
  }, [])

  const finishInflight = (id: string): number => {
    const left = (inflight.current.get(id) ?? 1) - 1
    if (left <= 0) inflight.current.delete(id)
    else inflight.current.set(id, left)
    return left
  }

  const adjust = useCallback(
    async (product: Product, delta: number) => {
      const id = product.id
      // Actualización optimista: el toque responde al instante
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p
          const quantity = Math.max(0, round3(p.quantity + delta))
          return { ...p, quantity, stock_status: statusOf(quantity, p.min_stock) }
        }),
      )
      inflight.current.set(id, (inflight.current.get(id) ?? 0) + 1)
      setPending((n) => n + 1)
      try {
        const row = await adjustQuantity(id, delta)
        if (finishInflight(id) <= 0) applyProduct(row)
      } catch (e) {
        finishInflight(id)
        toast.error(toUserMessage(e))
        void loadRef.current(['products'], true)
      } finally {
        setPending((n) => n - 1)
      }
    },
    [applyProduct, toast],
  )

  const setQuantity = useCallback(
    async (product: Product, quantity: number, action: 'set' | 'clear' = 'set') => {
      const id = product.id
      inflight.current.set(id, (inflight.current.get(id) ?? 0) + 1)
      setPending((n) => n + 1)
      try {
        const row = await setQuantityRpc(id, quantity, action)
        if (finishInflight(id) <= 0) applyProduct(row)
      } catch (e) {
        finishInflight(id)
        toast.error(toUserMessage(e))
        void loadRef.current(['products'], true)
      } finally {
        setPending((n) => n - 1)
      }
    },
    [applyProduct, toast],
  )

  // --------------------------------------------------------------- derivados
  const role = inventory.my_role
  const allUnits = useMemo(() => {
    const common = new Set<string>(COMMON_UNITS)
    const extra = structure.units.map((u) => u.name).filter((n) => !common.has(n))
    return [...COMMON_UNITS, ...extra]
  }, [structure.units])

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read_at).length, [notifications])

  const value = useMemo<InventoryData>(
    () => ({
      inventory,
      role,
      canWrite: role !== 'viewer',
      canAdmin: role === 'owner' || role === 'admin',
      isOwner: role === 'owner',
      loading,
      error,
      products,
      locations: structure.locations,
      categories: structure.categories,
      subcategories: structure.subcategories,
      customUnits: structure.units,
      allUnits,
      shopping,
      members,
      notifications,
      unreadCount,
      alerts,
      lastChange,
      movementsVersion,
      sync,
      lastSyncAt,
      justReconnected,
      adjust,
      setQuantity,
      reload,
      track,
      applyProduct,
    }),
    [
      inventory, role, loading, error, products, structure, allUnits, shopping, members, notifications,
      unreadCount, alerts, lastChange, movementsVersion, sync, lastSyncAt, justReconnected,
      adjust, setQuantity, reload, track, applyProduct,
    ],
  )

  return <InventoryDataContext.Provider value={value}>{children}</InventoryDataContext.Provider>
}

export function useInventoryData(): InventoryData {
  const ctx = useContext(InventoryDataContext)
  if (!ctx) throw new Error('useInventoryData debe usarse dentro de InventoryDataProvider')
  return ctx
}

export function useOptionalInventoryData(): InventoryData | null {
  return useContext(InventoryDataContext)
}
