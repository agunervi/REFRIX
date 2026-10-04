import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, CalendarClock, ChevronRight, Mail, Package, PackageX, Plus, ShoppingCart } from 'lucide-react'
import { CreateInventorySheet } from '../components/inventory/CreateInventorySheet'
import { InventoryCard } from '../components/inventory/InventoryCard'
import { ExpiryBadge } from '../components/inventory/Badges'
import { Button } from '../components/ui/Button'
import { Card, IconBadge, SectionTitle } from '../components/ui/Misc'
import { useAuth } from '../contexts/AuthContext'
import { useInventoryData } from '../contexts/InventoryDataContext'
import { useInventories } from '../contexts/InventoryContext'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { ROLE_LABELS } from '../lib/constants'
import { toUserMessage } from '../lib/errors'
import { useToast } from '../contexts/ToastContext'
import { expiryOf, formatQty } from '../lib/stock'
import { formatDate } from '../lib/time'
import { acceptInvitationById, declineInvitationById, listMyInvitations } from '../services/invitations'
import type { InventoryOverview, MyInvitation } from '../types/database'
import { cn } from '../utils/cn'

export default function DashboardPage() {
  const data = useInventoryData()
  const { profile, user } = useAuth()
  const { mine, shared, selectedId, select, refresh, connection, lastSyncAt } = useInventories()
  const online = useOnlineStatus()
  const navigate = useNavigate()
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [invitations, setInvitations] = useState<MyInvitation[]>([])
  const [busyInvitation, setBusyInvitation] = useState<string | null>(null)

  const loadInvitations = useCallback(async () => {
    try {
      setInvitations(await listMyInvitations())
    } catch {
      /* sin conexión: se mantiene lo que había */
    }
  }, [])

  useEffect(() => {
    void loadInvitations()
    const onVisible = () => document.visibilityState === 'visible' && void loadInvitations()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadInvitations])

  const respond = async (inv: MyInvitation, accept: boolean) => {
    setBusyInvitation(inv.id)
    try {
      if (accept) {
        const inventoryId = await acceptInvitationById(inv.id)
        await refresh()
        select(inventoryId)
        toast.success(`Ahora tienes acceso a "${inv.inventory_name}".`)
      } else {
        await declineInvitationById(inv.id)
        toast.info('Invitación rechazada.')
      }
      await loadInvitations()
    } catch (e) {
      toast.error(toUserMessage(e))
    } finally {
      setBusyInvitation(null)
    }
  }

  const openInventory = (inv: InventoryOverview) => {
    select(inv.id)
    navigate('/inventario')
  }

  const cardState = (inv: InventoryOverview) =>
    inv.id === selectedId ? data.sync : !online || connection === 'offline' ? 'offline' : connection === 'connecting' ? 'syncing' : 'synced'

  const toBuy = useMemo(() => data.shopping.filter((i) => !i.is_bought), [data.shopping])
  const expiring = useMemo(
    () =>
      data.products
        .filter((p) => {
          const s = expiryOf(p.expiry_date).status
          return s === 'soon' || s === 'expired'
        })
        .sort((a, b) => (a.expiry_date ?? '').localeCompare(b.expiry_date ?? '')),
    [data.products],
  )

  const inv = data.inventory
  const firstName = (profile?.display_name ?? user?.email ?? '').split(/[\s@]/)[0]

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-stone-500 dark:text-neutral-400">Hola{firstName ? `, ${firstName}` : ''}</p>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-neutral-50">Resumen de {inv.name}</h1>
      </div>

      {invitations.length > 0 && (
        <section aria-label="Invitaciones pendientes" className="space-y-3">
          <SectionTitle>Invitaciones pendientes</SectionTitle>
          {invitations.map((i) => (
            <Card key={i.id} className="p-4">
              <div className="flex items-start gap-3">
                <IconBadge icon={i.inventory_icon} color={i.inventory_color} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-stone-900 dark:text-neutral-100">{i.inventory_name}</p>
                  <p className="text-sm text-stone-500 dark:text-neutral-400">
                    <Mail className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
                    {i.owner_name} te invita como {ROLE_LABELS[i.role].toLowerCase()}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" full disabled={busyInvitation === i.id} onClick={() => void respond(i, false)}>
                  Rechazar
                </Button>
                <Button size="sm" full loading={busyInvitation === i.id} onClick={() => void respond(i, true)}>
                  Aceptar
                </Button>
              </div>
            </Card>
          ))}
        </section>
      )}

      <section aria-label="Resumen del inventario actual">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile icon={<Package className="h-5 w-5" />} label="Productos" value={inv.product_count} to="/inventario" />
          <Tile icon={<AlertTriangle className="h-5 w-5" />} label="Stock bajo" value={inv.low_count} tone="amber" to="/inventario" />
          <Tile icon={<PackageX className="h-5 w-5" />} label="Agotados" value={inv.out_count} tone="red" to="/inventario" />
          <Tile
            icon={<CalendarClock className="h-5 w-5" />}
            label="Por vencer"
            value={inv.expiring_count + inv.expired_count}
            tone={inv.expired_count > 0 ? 'red' : 'amber'}
            to="/alertas"
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="Para comprar">
          <SectionTitle
            action={
              <Link to="/compras" className="flex items-center text-sm font-medium text-emerald-700 dark:text-emerald-300">
                Ver lista <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            }
          >
            Para comprar ({toBuy.length})
          </SectionTitle>
          <Card className="divide-y divide-stone-100 dark:divide-neutral-800">
            {toBuy.length === 0 ? (
              <EmptyLine icon={<ShoppingCart className="h-5 w-5" />} text="No hay nada pendiente por comprar." />
            ) : (
              toBuy.slice(0, 5).map((i) => (
                <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={cn('h-2.5 w-2.5 shrink-0 rounded-full', i.reason === 'out' ? 'bg-red-500' : i.reason === 'low' ? 'bg-amber-500' : 'bg-stone-400')}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-stone-900 dark:text-neutral-100">{i.name}</span>
                  {i.quantity_needed != null && (
                    <span className="shrink-0 text-sm text-stone-500 dark:text-neutral-400">
                      {formatQty(i.quantity_needed)} {i.unit}
                    </span>
                  )}
                </div>
              ))
            )}
          </Card>
        </section>

        <section aria-label="Próximos vencimientos">
          <SectionTitle
            action={
              <Link to="/alertas" className="flex items-center text-sm font-medium text-emerald-700 dark:text-emerald-300">
                Ver todos <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            }
          >
            Próximos vencimientos
          </SectionTitle>
          <Card className="divide-y divide-stone-100 dark:divide-neutral-800">
            {expiring.length === 0 ? (
              <EmptyLine icon={<CalendarClock className="h-5 w-5" />} text="Nada vence en los próximos 7 días." />
            ) : (
              expiring.slice(0, 5).map((p) => (
                <Link
                  key={p.id}
                  to={`/inventario?p=${p.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-neutral-800/60"
                >
                  <span className="min-w-0 flex-1 truncate text-stone-900 dark:text-neutral-100">{p.name}</span>
                  <span className="shrink-0 text-sm text-stone-500 dark:text-neutral-400">{p.expiry_date && formatDate(p.expiry_date)}</span>
                  <ExpiryBadge date={p.expiry_date} />
                </Link>
              ))
            )}
          </Card>
        </section>
      </div>

      <section aria-label="Mis inventarios">
        <SectionTitle
          action={
            <Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              Crear
            </Button>
          }
        >
          Mis inventarios
        </SectionTitle>
        {mine.length === 0 ? (
          <Card className="px-4 py-6 text-center text-sm text-stone-500 dark:text-neutral-400">
            No tienes inventarios propios. Crea uno para empezar.
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {mine.map((i) => (
              <InventoryCard key={i.id} inventory={i} active={i.id === selectedId} state={cardState(i)} lastSyncAt={lastSyncAt} onOpen={openInventory} />
            ))}
          </div>
        )}
      </section>

      <section aria-label="Inventarios compartidos conmigo">
        <SectionTitle>Inventarios compartidos conmigo</SectionTitle>
        {shared.length === 0 ? (
          <Card className="px-4 py-6 text-center text-sm text-stone-500 dark:text-neutral-400">
            Aún nadie ha compartido un inventario contigo. Cuando alguien te invite, aparecerá aquí.
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {shared.map((i) => (
              <InventoryCard key={i.id} inventory={i} active={i.id === selectedId} state={cardState(i)} lastSyncAt={lastSyncAt} showOwner onOpen={openInventory} />
            ))}
          </div>
        )}
      </section>

      <CreateInventorySheet open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

function Tile({
  icon,
  label,
  value,
  tone,
  to,
}: {
  icon: React.ReactNode
  label: string
  value: number
  tone?: 'amber' | 'red'
  to: string
}) {
  const active = value > 0 && tone
  return (
    <Link
      to={to}
      className={cn(
        'rounded-2xl border p-4 shadow-sm transition hover:shadow-md',
        active && tone === 'amber'
          ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100'
          : active && tone === 'red'
            ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100'
            : 'border-stone-200/80 bg-white text-stone-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100',
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium opacity-80">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
    </Link>
  )
}

function EmptyLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-5 text-sm text-stone-500 dark:text-neutral-400">
      {icon}
      {text}
    </div>
  )
}
