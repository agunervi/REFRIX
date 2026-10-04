import { AlertTriangle, Package, PackageX, UserRound } from 'lucide-react'
import { ROLE_LABELS } from '../../lib/constants'
import type { InventoryOverview } from '../../types/database'
import { cn } from '../../utils/cn'
import { SyncIndicator, type IndicatorState } from '../sync/SyncIndicator'
import { Badge, IconBadge } from '../ui/Misc'

interface Props {
  inventory: InventoryOverview
  active: boolean
  state: IndicatorState
  lastSyncAt: number | null
  showOwner?: boolean
  onOpen: (inventory: InventoryOverview) => void
}

/** Tarjeta de un inventario en el panel de inicio. */
export function InventoryCard({ inventory, active, state, lastSyncAt, showOwner, onOpen }: Props) {
  return (
    <div
      className={cn(
        'relative rounded-2xl border bg-white p-4 shadow-sm transition dark:bg-neutral-900',
        active ? 'border-emerald-500 ring-1 ring-emerald-500/40' : 'border-stone-200/80 dark:border-neutral-800',
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(inventory)}
        className="block w-full rounded-xl text-left focus-visible:outline-2 focus-visible:outline-emerald-600"
        aria-label={`Abrir inventario ${inventory.name}`}
      >
        <div className="flex items-start gap-3">
          <IconBadge icon={inventory.icon} color={inventory.color} size="lg" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold text-stone-900 dark:text-neutral-100">{inventory.name}</h3>
            <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-stone-500 dark:text-neutral-400">
              <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {showOwner ? `De ${inventory.owner_name ?? 'otra persona'}` : 'Tuyo'}
            </p>
          </div>
          <Badge
            className={
              inventory.my_role === 'owner'
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200'
                : 'bg-stone-100 text-stone-700 dark:bg-neutral-800 dark:text-neutral-300'
            }
          >
            {ROLE_LABELS[inventory.my_role]}
          </Badge>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat icon={<Package className="h-4 w-4" aria-hidden />} value={inventory.product_count} label="Productos" />
          <Stat
            icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
            value={inventory.low_count}
            label="Stock bajo"
            tone={inventory.low_count > 0 ? 'amber' : undefined}
          />
          <Stat
            icon={<PackageX className="h-4 w-4" aria-hidden />}
            value={inventory.out_count}
            label="Agotados"
            tone={inventory.out_count > 0 ? 'red' : undefined}
          />
        </dl>
      </button>
      <div className="mt-3 border-t border-stone-100 pt-2 dark:border-neutral-800">
        <SyncIndicator
          inventoryId={inventory.id}
          lastChangeAt={inventory.last_inventory_change_at}
          state={state}
          lastSyncAt={lastSyncAt}
          compact
        />
      </div>
    </div>
  )
}

function Stat({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode
  value: number
  label: string
  tone?: 'amber' | 'red'
}) {
  return (
    <div
      className={cn(
        'rounded-xl px-2 py-2',
        tone === 'amber'
          ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'
          : tone === 'red'
            ? 'bg-red-50 text-red-800 dark:bg-red-500/15 dark:text-red-200'
            : 'bg-stone-50 text-stone-700 dark:bg-neutral-800 dark:text-neutral-200',
      )}
    >
      <dt className="flex items-center justify-center gap-1 text-[11px] font-medium opacity-80">
        {icon}
        {label}
      </dt>
      <dd className="text-xl font-bold tabular-nums">{value}</dd>
    </div>
  )
}
