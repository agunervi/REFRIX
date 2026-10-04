import { useState } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { useInventories } from '../../contexts/InventoryContext'
import { ROLE_LABELS } from '../../lib/constants'
import type { InventoryOverview } from '../../types/database'
import { cn } from '../../utils/cn'
import { CreateInventorySheet } from '../inventory/CreateInventorySheet'
import { IconBadge } from '../ui/Misc'
import { Sheet } from '../ui/Sheet'

export function InventorySwitcher({ className }: { className?: string }) {
  const { selected, mine, shared, select } = useInventories()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  if (!selected) return null

  const pick = (id: string) => {
    select(id)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          'flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-left shadow-sm transition hover:bg-stone-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800',
          className,
        )}
      >
        <IconBadge icon={selected.icon} color={selected.color} size="sm" />
        <span className="min-w-0 flex-1 truncate text-base font-semibold text-stone-900 dark:text-neutral-100">
          {selected.name}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-stone-500" aria-hidden />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Cambiar de inventario">
        <div className="space-y-5">
          <Group title="Mis inventarios" items={mine} selectedId={selected.id} onPick={pick} />
          <Group title="Inventarios compartidos" items={shared} selectedId={selected.id} onPick={pick} showOwner />
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setCreating(true)
            }}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Crear inventario
          </button>
        </div>
      </Sheet>
      <CreateInventorySheet open={creating} onClose={() => setCreating(false)} />
    </>
  )
}

function Group({
  title,
  items,
  selectedId,
  onPick,
  showOwner,
}: {
  title: string
  items: InventoryOverview[]
  selectedId: string
  onPick: (id: string) => void
  showOwner?: boolean
}) {
  if (items.length === 0) return null
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-neutral-400">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((inv) => (
          <li key={inv.id}>
            <button
              type="button"
              onClick={() => onPick(inv.id)}
              aria-current={inv.id === selectedId}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
                inv.id === selectedId
                  ? 'bg-emerald-50 dark:bg-emerald-500/10'
                  : 'hover:bg-stone-100 dark:hover:bg-neutral-800',
              )}
            >
              <IconBadge icon={inv.icon} color={inv.color} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-stone-900 dark:text-neutral-100">{inv.name}</span>
                <span className="block truncate text-xs text-stone-500 dark:text-neutral-400">
                  {showOwner ? `${inv.owner_name ?? 'Otra persona'} · ${ROLE_LABELS[inv.my_role]}` : `${inv.product_count} productos`}
                  {inv.out_count > 0 && ` · ${inv.out_count} agotados`}
                </span>
              </span>
              {inv.id === selectedId && <Check className="h-5 w-5 text-emerald-600" aria-hidden />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
