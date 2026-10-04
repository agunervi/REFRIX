import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useTicker } from '../../hooks/useTicker'
import { describeChange } from '../../lib/stock'
import { formatDateTime, serverNow, sinceLabel, updatedLabel } from '../../lib/time'
import { fetchLastMovement } from '../../services/inventories'
import type { Movement } from '../../types/database'
import { cn } from '../../utils/cn'
import { Sheet } from '../ui/Sheet'
import { Spinner } from '../ui/Misc'

export type IndicatorState = 'synced' | 'syncing' | 'offline'

interface SyncIndicatorProps {
  inventoryId: string
  /** last_inventory_change_at: hora de la base de datos */
  lastChangeAt: string
  state: IndicatorState
  /** Reloj local de la última sincronización exitosa (para el modo sin conexión) */
  lastSyncAt?: number | null
  justReconnected?: boolean
  /** Último movimiento ya cargado (evita una consulta al abrir el detalle) */
  knownLastChange?: Movement | null
  compact?: boolean
  className?: string
}

const DOT: Record<IndicatorState, string> = {
  synced: 'bg-emerald-500',
  syncing: 'bg-amber-500 animate-pulse-dot',
  offline: 'bg-red-500',
}

/** "🟢 ACTUALIZADO HASTA 15:42" + estado de sincronización. Al tocarlo muestra el último cambio. */
export function SyncIndicator({
  inventoryId,
  lastChangeAt,
  state,
  lastSyncAt,
  justReconnected,
  knownLastChange,
  compact,
  className,
}: SyncIndicatorProps) {
  useTicker(15_000)
  const [open, setOpen] = useState(false)

  const main =
    state === 'offline'
      ? `Sin conexión, última actualización ${lastSyncAt ? sinceLabel(lastSyncAt) : 'desconocida'}`
      : justReconnected
        ? 'Sincronizado, actualizado ahora'
        : state === 'syncing' && compact
          ? 'Sincronizando...'
          : updatedLabel(lastChangeAt, serverNow())
  const secondary =
    state === 'offline' ? null : state === 'syncing' ? 'Sincronizando...' : justReconnected ? null : 'Sincronizado'

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        aria-label={`${main}. Ver última modificación`}
        className={cn(
          'group inline-flex max-w-full items-center gap-2 rounded-xl text-left transition hover:bg-stone-100/80 dark:hover:bg-neutral-800/80',
          compact ? 'px-1.5 py-1' : 'px-2.5 py-1.5',
          className,
        )}
      >
        <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', DOT[state])} aria-hidden />
        <span className="min-w-0">
          <span
            className={cn(
              'block truncate font-semibold tracking-wide text-stone-700 dark:text-neutral-200',
              compact ? 'text-[11px]' : 'text-xs',
            )}
          >
            {main}
          </span>
          {!compact && secondary && (
            <span className="block text-[11px] text-stone-500 dark:text-neutral-400">{secondary}</span>
          )}
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-stone-400 opacity-0 transition group-hover:opacity-100" aria-hidden />
      </button>
      {open && (
        <LastChangeSheet
          inventoryId={inventoryId}
          known={knownLastChange}
          lastChangeAt={lastChangeAt}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function LastChangeSheet({
  inventoryId,
  known,
  lastChangeAt,
  onClose,
}: {
  inventoryId: string
  known?: Movement | null
  lastChangeAt: string
  onClose: () => void
}) {
  const [movement, setMovement] = useState<Movement | null | undefined>(known ?? undefined)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    fetchLastMovement(inventoryId)
      .then((m) => active && setMovement(m))
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
  }, [inventoryId])

  return (
    <Sheet open onClose={onClose} title="Última modificación" description="Hora tomada de la base de datos, no del reloj de tu dispositivo.">
      {movement === undefined && !error && <Spinner />}
      {error && !movement && (
        <p className="text-sm text-red-600">No se pudo consultar la última modificación. Revisa tu conexión.</p>
      )}
      {movement === null && <p className="text-sm text-stone-500">Todavía no hay modificaciones en este inventario.</p>}
      {movement && (
        <dl className="space-y-4 text-sm">
          <Row label="Fecha y hora" value={formatDateTime(movement.created_at)} />
          <Row label="Producto" value={movement.product_name} />
          <Row label="Cambio" value={describeChange(movement)} />
          <Row label="Modificado por" value={movement.user_name} />
        </dl>
      )}
      <p className="mt-5 text-xs text-stone-400">Marca del inventario: {formatDateTime(lastChangeAt)}</p>
    </Sheet>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-stone-100 pb-3 dark:border-neutral-800">
      <dt className="text-stone-500 dark:text-neutral-400">{label}</dt>
      <dd className="text-right font-medium text-stone-900 dark:text-neutral-100">{value}</dd>
    </div>
  )
}
