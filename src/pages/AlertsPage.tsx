import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Bell, BellOff, CalendarClock, CheckCheck, Clock, History, PackageX, Trash2 } from 'lucide-react'
import { Badge, Card, EmptyState, SectionTitle, Spinner } from '../components/ui/Misc'
import { Button } from '../components/ui/Button'
import { Field, Input, Select } from '../components/ui/Field'
import { Segmented } from '../components/ui/Segmented'
import { useInventoryData } from '../contexts/InventoryDataContext'
import { useToast } from '../contexts/ToastContext'
import { useTicker } from '../hooks/useTicker'
import { toUserMessage } from '../lib/errors'
import { ACTION_LABELS, EXPIRY_META, describeChange, expiryOf, expiryText, formatQty } from '../lib/stock'
import { formatDate, formatDateTime, formatScheduled, timeAgo } from '../lib/time'
import { fetchMovements, HISTORY_PAGE, type HistoryFilters } from '../services/history'
import { deleteNotification, markAllNotificationsRead, markNotificationRead } from '../services/notifications'
import type { AppNotification, Movement, NotificationType } from '../types/database'
import { cn } from '../utils/cn'

type Tab = 'notificaciones' | 'vencimientos' | 'historial'

const TYPE_META: Record<NotificationType, { icon: typeof Bell; tone: string }> = {
  low_stock: { icon: AlertTriangle, tone: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  out_of_stock: { icon: PackageX, tone: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
  expiring: { icon: Clock, tone: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  expired: { icon: CalendarClock, tone: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
  info: { icon: Bell, tone: 'bg-stone-100 text-stone-600 dark:bg-neutral-800 dark:text-neutral-300' },
}

export default function AlertsPage() {
  const data = useInventoryData()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = raw === 'vencimientos' || raw === 'historial' ? raw : 'notificaciones'
  const setTab = (t: Tab) => setParams(t === 'notificaciones' ? {} : { tab: t }, { replace: true })

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-neutral-50">Alertas</h1>
      <Segmented<Tab>
        label="Secciones de alertas"
        value={tab}
        onChange={setTab}
        options={[
          {
            value: 'notificaciones',
            label: (
              <>
                Avisos
                {data.unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">
                    {data.unreadCount}
                  </span>
                )}
              </>
            ),
          },
          { value: 'vencimientos', label: 'Vencimientos' },
          { value: 'historial', label: 'Historial' },
        ]}
      />
      {tab === 'notificaciones' && <NotificationsTab />}
      {tab === 'vencimientos' && <ExpiryTab />}
      {tab === 'historial' && <HistoryTab />}
    </div>
  )
}

// ------------------------------------------------------------------ avisos
function NotificationsTab() {
  const data = useInventoryData()
  const toast = useToast()
  const navigate = useNavigate()
  useTicker(30_000)

  const open = async (n: AppNotification) => {
    try {
      if (!n.read_at) {
        await markNotificationRead(n.id)
        void data.reload('notifications')
      }
    } catch {
      /* si falla marcar como leída igual se abre el producto */
    }
    if (n.product_id && data.products.some((p) => p.id === n.product_id)) navigate(`/inventario?p=${n.product_id}`)
    else if (n.product_id) toast.info('Ese producto ya no existe.')
  }

  const remove = async (n: AppNotification) => {
    try {
      await deleteNotification(n.id)
      await data.reload('notifications')
    } catch (e) {
      toast.error(toUserMessage(e))
    }
  }

  const markAll = async () => {
    try {
      await markAllNotificationsRead(data.inventory.id)
      await data.reload('notifications')
    } catch (e) {
      toast.error(toUserMessage(e))
    }
  }

  return (
    <div className="space-y-6">
      {data.alerts.length > 0 && (
        <section aria-label="Avisos por correo programados">
          <SectionTitle>Avisos por correo programados</SectionTitle>
          <Card className="divide-y divide-stone-100 dark:divide-neutral-800">
            {data.alerts.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <Clock className="h-5 w-5 shrink-0 text-stone-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-stone-900 dark:text-neutral-100">{a.product?.name ?? 'Producto'}</p>
                  <p className="text-sm text-stone-500 dark:text-neutral-400">
                    {a.level === 'out' ? 'Agotado' : a.level === 'low' ? 'Stock bajo' : a.level === 'soon' ? 'Por vencer' : 'Vencido'}
                    {a.product && a.kind === 'stock' ? `, quedan ${formatQty(a.product.quantity)} ${a.product.unit}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-right text-xs text-stone-500 dark:text-neutral-400">
                  Aviso desde
                  <br />
                  {formatScheduled(a.scheduled_at)}
                </span>
              </div>
            ))}
          </Card>
          <p className="mt-2 text-xs text-stone-500 dark:text-neutral-400">
            Si el stock se recupera antes de esa hora, el aviso se cancela solo. Cada persona recibe el correo según su tiempo de espera en Configuración, Notificaciones.
          </p>
        </section>
      )}

      <section aria-label="Notificaciones">
        <SectionTitle
          action={
            data.unreadCount > 0 && (
              <Button size="sm" variant="ghost" icon={<CheckCheck className="h-4 w-4" />} onClick={() => void markAll()}>
                Marcar leídas
              </Button>
            )
          }
        >
          Notificaciones
        </SectionTitle>
        {data.notifications.length === 0 ? (
          <EmptyState
            icon={<BellOff className="h-7 w-7" />}
            title="Sin notificaciones"
            message="Te avisaremos aquí cuando un producto quede bajo el mínimo, se agote o esté por vencer."
          />
        ) : (
          <ul className="space-y-2">
            {data.notifications.map((n) => {
              const meta = TYPE_META[n.type]
              const Icon = meta.icon
              return (
                <li
                  key={n.id}
                  className={cn(
                    'flex items-start gap-3 rounded-2xl border p-3.5',
                    n.read_at
                      ? 'border-stone-200/60 bg-white/60 dark:border-neutral-800 dark:bg-neutral-900/50'
                      : 'border-emerald-200 bg-white shadow-sm dark:border-emerald-500/30 dark:bg-neutral-900',
                  )}
                >
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', meta.tone)}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <button type="button" onClick={() => void open(n)} className="min-w-0 flex-1 text-left">
                    <span className={cn('block text-base text-stone-900 dark:text-neutral-100', !n.read_at && 'font-semibold')}>
                      {n.message}
                    </span>
                    <span className="mt-0.5 block text-xs text-stone-500 dark:text-neutral-400">
                      {timeAgo(n.created_at)}
                      {!n.read_at && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle" aria-label="Sin leer" />}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(n)}
                    aria-label="Eliminar notificación"
                    className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-stone-400 hover:bg-stone-100 dark:hover:bg-neutral-800"
                  >
                    <Trash2 className="h-4.5 w-4.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

// -------------------------------------------------------------- vencimientos
function ExpiryTab() {
  const data = useInventoryData()
  const navigate = useNavigate()
  const [onlyUrgent, setOnlyUrgent] = useState(false)

  const rows = useMemo(
    () =>
      data.products
        .filter((p) => p.expiry_date)
        .map((p) => ({ product: p, ...expiryOf(p.expiry_date) }))
        .filter((r) => !onlyUrgent || r.status === 'soon' || r.status === 'expired')
        .sort((a, b) => (a.product.expiry_date ?? '').localeCompare(b.product.expiry_date ?? '')),
    [data.products, onlyUrgent],
  )

  return (
    <section aria-label="Próximos vencimientos" className="space-y-3">
      <SectionTitle
        action={
          <button
            type="button"
            onClick={() => setOnlyUrgent((v) => !v)}
            aria-pressed={onlyUrgent}
            className={cn(
              'h-9 rounded-full border px-3.5 text-sm font-medium',
              onlyUrgent ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-stone-300 bg-white text-stone-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200',
            )}
          >
            Solo urgentes
          </button>
        }
      >
        Próximos vencimientos
      </SectionTitle>
      {rows.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-7 w-7" />}
          title={onlyUrgent ? 'Nada vence pronto' : 'Ningún producto tiene fecha de vencimiento'}
          message={onlyUrgent ? 'No hay productos vencidos ni que venzan en los próximos 7 días.' : 'Agrega una fecha de vencimiento al editar un producto.'}
        />
      ) : (
        <ul className="space-y-2">
          {rows.map(({ product, status, days }) => {
            const meta = status === 'none' ? null : EXPIRY_META[status]
            return (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/inventario?p=${product.id}`)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-stone-200/80 bg-white p-3.5 text-left shadow-sm transition hover:bg-stone-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/60"
                >
                  <span
                    className={cn(
                      'h-3 w-3 shrink-0 rounded-full',
                      status === 'expired' ? 'bg-red-500' : status === 'soon' ? 'bg-amber-500' : 'bg-emerald-500',
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-stone-900 dark:text-neutral-100">{product.name}</span>
                    <span className="block text-sm text-stone-500 dark:text-neutral-400">
                      {product.expiry_date && formatDate(product.expiry_date)}
                      {days !== null && ` · ${expiryText(days)}`}
                    </span>
                  </span>
                  {meta && <Badge className={meta.badge}>{meta.label}</Badge>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ------------------------------------------------------------------ historial
function HistoryTab() {
  const data = useInventoryData()
  const [filters, setFilters] = useState<HistoryFilters>({})
  const [rows, setRows] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const requestId = useRef(0)
  useTicker(60_000)

  const inventoryId = data.inventory.id

  const loadFirst = useCallback(
    async (quiet: boolean) => {
      const id = ++requestId.current
      if (!quiet) setLoading(true)
      try {
        const page = await fetchMovements(inventoryId, filters)
        if (id !== requestId.current) return
        setRows(page)
        setHasMore(page.length === HISTORY_PAGE)
        setError(null)
      } catch (e) {
        if (id === requestId.current) setError(toUserMessage(e))
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    },
    [inventoryId, filters],
  )

  useEffect(() => {
    void loadFirst(false)
  }, [loadFirst])

  // Movimientos nuevos (propios o de otras personas) refrescan la primera página
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    void loadFirst(true)
  }, [data.movementsVersion, loadFirst])

  const loadMore = async () => {
    const last = rows[rows.length - 1]
    if (!last) return
    setLoadingMore(true)
    try {
      const page = await fetchMovements(inventoryId, filters, last.created_at)
      const known = new Set(rows.map((r) => r.id))
      setRows([...rows, ...page.filter((r) => !known.has(r.id))])
      setHasMore(page.length === HISTORY_PAGE)
    } catch (e) {
      setError(toUserMessage(e))
    } finally {
      setLoadingMore(false)
    }
  }

  const set = (patch: Partial<HistoryFilters>) => setFilters((prev) => ({ ...prev, ...patch }))
  const hasFilters = Boolean(filters.productId || filters.userId || filters.from || filters.to)

  return (
    <section aria-label="Historial de cambios" className="space-y-4">
      <Card className="grid gap-3 p-4 sm:grid-cols-2">
        <Field label="Producto">
          {(id) => (
            <Select id={id} value={filters.productId ?? ''} onChange={(e) => set({ productId: e.target.value || undefined })}>
              <option value="">Todos</option>
              {data.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Usuario">
          {(id) => (
            <Select id={id} value={filters.userId ?? ''} onChange={(e) => set({ userId: e.target.value || undefined })}>
              <option value="">Todos</option>
              {data.members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.user?.display_name || m.user?.email || 'Usuario'}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Desde">
          {(id) => <Input id={id} type="date" value={filters.from ?? ''} max={filters.to} onChange={(e) => set({ from: e.target.value || undefined })} />}
        </Field>
        <Field label="Hasta">
          {(id) => <Input id={id} type="date" value={filters.to ?? ''} min={filters.from} onChange={(e) => set({ to: e.target.value || undefined })} />}
        </Field>
        {hasFilters && (
          <div className="sm:col-span-2">
            <Button variant="ghost" size="sm" onClick={() => setFilters({})}>
              Limpiar filtros
            </Button>
          </div>
        )}
      </Card>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<History className="h-7 w-7" />}
          title="Sin movimientos"
          message={hasFilters ? 'No hay cambios con esos filtros.' : 'Aquí quedará registrado cada cambio de stock y de productos.'}
        />
      ) : (
        <>
          <ul className="space-y-2">
            {rows.map((m) => (
              <MovementRow key={m.id} movement={m} />
            ))}
          </ul>
          {hasMore && (
            <Button variant="secondary" full loading={loadingMore} onClick={() => void loadMore()}>
              Cargar más
            </Button>
          )}
        </>
      )}
    </section>
  )
}

function MovementRow({ movement: m }: { movement: Movement }) {
  const positive = m.diff > 0
  const showDiff = (m.action === 'increase' || m.action === 'decrease' || m.action === 'set' || m.action === 'purchase' || m.action === 'clear') && m.diff !== 0
  return (
    <li className="rounded-2xl border border-stone-200/80 bg-white p-3.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-stone-900 dark:text-neutral-100">{m.product_name}</p>
          <p className="text-sm text-stone-600 dark:text-neutral-300">{ACTION_LABELS[m.action]}</p>
          <p className="mt-0.5 text-sm text-stone-500 dark:text-neutral-400">{describeChange(m)}</p>
        </div>
        {showDiff && (
          <span
            className={cn(
              'shrink-0 rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums',
              positive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
            )}
          >
            {positive ? '+' : ''}
            {formatQty(m.diff)}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-stone-500 dark:text-neutral-400">
        {m.user_name} · {formatDateTime(m.created_at)} ({timeAgo(m.created_at)})
      </p>
    </li>
  )
}
