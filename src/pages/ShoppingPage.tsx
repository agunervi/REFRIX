import { useMemo, useState, type FormEvent } from 'react'
import { Check, Plus, RotateCcw, ShoppingCart, Trash2 } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { Field, Input, Select } from '../components/ui/Field'
import { Badge, EmptyState, SectionTitle } from '../components/ui/Misc'
import { Sheet } from '../components/ui/Sheet'
import { parseNumber } from '../components/inventory/SetQuantitySheet'
import { useInventoryData } from '../contexts/InventoryDataContext'
import { useToast } from '../contexts/ToastContext'
import { PRIORITY_LABELS } from '../lib/constants'
import { toUserMessage } from '../lib/errors'
import { formatQty } from '../lib/stock'
import {
  addManualItem,
  clearBought,
  deleteShoppingItem,
  markBought,
  reopenItem,
  updateShoppingItem,
} from '../services/shopping'
import type { Priority, Product, ShoppingItem } from '../types/database'
import { cn } from '../utils/cn'

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, normal: 1, low: 2 }
const REASON_ORDER = { out: 0, low: 1, manual: 2 } as const

const PRIORITY_STYLE: Record<Priority, string> = {
  high: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  normal: 'bg-stone-100 text-stone-700 dark:bg-neutral-800 dark:text-neutral-300',
  low: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
}

const REASON_LABEL = { out: 'Agotado', low: 'Stock bajo', manual: 'Manual' } as const
const REASON_STYLE = {
  out: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  low: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  manual: 'bg-stone-100 text-stone-600 dark:bg-neutral-800 dark:text-neutral-300',
} as const

function describeItem(item: ShoppingItem, product: Product | undefined): string {
  if (item.quantity_needed != null) return `Comprar ${formatQty(item.quantity_needed)} ${item.unit ?? ''}`.trim()
  if (product) {
    return product.quantity <= 0
      ? `No queda stock (mínimo ${formatQty(product.min_stock)} ${product.unit})`
      : `Quedan ${formatQty(product.quantity)} ${product.unit} (mínimo ${formatQty(product.min_stock)})`
  }
  return 'Cantidad sin definir'
}

export default function ShoppingPage() {
  const data = useInventoryData()
  const toast = useToast()
  const confirm = useConfirm()
  const [adding, setAdding] = useState(false)
  const [buying, setBuying] = useState<ShoppingItem | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const { open, bought } = useMemo(() => {
    const sorted = [...data.shopping].sort(
      (a, b) =>
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        REASON_ORDER[a.reason] - REASON_ORDER[b.reason] ||
        a.name.localeCompare(b.name, 'es'),
    )
    return {
      open: sorted.filter((i) => !i.is_bought),
      bought: sorted.filter((i) => i.is_bought).sort((a, b) => (b.bought_at ?? '').localeCompare(a.bought_at ?? '')),
    }
  }, [data.shopping])

  const run = async (id: string, action: () => Promise<void>, success?: string) => {
    setBusy(id)
    try {
      await data.track(action())
      await data.reload('shopping', 'products', 'alerts', 'notifications')
      if (success) toast.success(success)
    } catch (e) {
      toast.error(toUserMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const productOf = (item: ShoppingItem) => (item.product_id ? data.products.find((p) => p.id === item.product_id) : undefined)

  const onBought = (item: ShoppingItem) => {
    // Si el ítem viene de un producto del inventario se ofrece sumar lo comprado al stock
    if (item.product_id && productOf(item)) setBuying(item)
    else void run(item.id, () => markBought(item.id), `"${item.name}" marcado como comprado.`)
  }

  const onDelete = async (item: ShoppingItem) => {
    const ok = await confirm({
      title: `Quitar "${item.name}"`,
      message: item.auto
        ? 'Este ítem se generó por el stock. Volverá a aparecer si el producto sigue bajo el mínimo.'
        : 'Se elimina de la lista de compras.',
      confirmLabel: 'Quitar',
      danger: true,
    })
    if (ok) await run(item.id, () => deleteShoppingItem(item.id))
  }

  const onClearBought = async () => {
    const ok = await confirm({
      title: 'Limpiar comprados',
      message: `Se eliminan ${bought.length} ítems ya comprados de la lista.`,
      confirmLabel: 'Limpiar',
      danger: true,
    })
    if (ok) await run('clear', () => clearBought(data.inventory.id), 'Lista limpiada.')
  }

  const cyclePriority = (item: ShoppingItem) => {
    const next: Priority = item.priority === 'normal' ? 'high' : item.priority === 'high' ? 'low' : 'normal'
    void run(item.id, () => updateShoppingItem(item.id, { priority: next }))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-neutral-50">Lista de compras</h1>
        {data.canWrite && (
          <Button icon={<Plus className="h-5 w-5" />} onClick={() => setAdding(true)}>
            Agregar
          </Button>
        )}
      </div>
      <p className="-mt-3 text-sm text-stone-500 dark:text-neutral-400">
        Los productos agotados o con stock bajo se agregan solos y salen de la lista cuando vuelves a tener stock.
      </p>

      {data.loading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-stone-200/70 dark:bg-neutral-800" />
      ) : open.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="h-7 w-7" />}
          title="No hay nada por comprar"
          message="Cuando un producto quede bajo su stock mínimo, aparecerá aquí automáticamente."
        />
      ) : (
        <ul className="space-y-2.5">
          {open.map((item) => (
            <li key={item.id} className="rounded-2xl border border-stone-200/80 bg-white p-3.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  disabled={!data.canWrite || busy === item.id}
                  onClick={() => onBought(item)}
                  aria-label={`Marcar "${item.name}" como comprado`}
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-stone-300 text-transparent transition hover:border-emerald-500 hover:text-emerald-500 disabled:opacity-40 dark:border-neutral-600"
                >
                  <Check className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-stone-900 dark:text-neutral-100">{item.name}</p>
                  <p className="mt-0.5 text-sm text-stone-500 dark:text-neutral-400">
                    {describeItem(item, productOf(item))}
                    {item.note ? ` · ${item.note}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge className={REASON_STYLE[item.reason]}>{REASON_LABEL[item.reason]}</Badge>
                    <button
                      type="button"
                      onClick={() => cyclePriority(item)}
                      disabled={!data.canWrite}
                      aria-label={`Prioridad ${PRIORITY_LABELS[item.priority]}. Tocar para cambiar`}
                      className="rounded-full focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:cursor-default"
                    >
                      <Badge className={PRIORITY_STYLE[item.priority]}>Prioridad {PRIORITY_LABELS[item.priority].toLowerCase()}</Badge>
                    </button>
                  </div>
                </div>
                {data.canWrite && (
                  <button
                    type="button"
                    onClick={() => void onDelete(item)}
                    disabled={busy === item.id}
                    aria-label={`Quitar ${item.name}`}
                    className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {bought.length > 0 && (
        <section aria-label="Comprados">
          <SectionTitle
            action={
              data.canWrite && (
                <Button size="sm" variant="ghost" onClick={() => void onClearBought()} loading={busy === 'clear'}>
                  Limpiar comprados
                </Button>
              )
            }
          >
            Comprados ({bought.length})
          </SectionTitle>
          <ul className="space-y-2">
            {bought.map((item) => (
              <li key={item.id} className="flex items-center gap-3 rounded-2xl border border-stone-200/60 bg-stone-50 px-3.5 py-3 dark:border-neutral-800 dark:bg-neutral-900/50">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <Check className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate text-stone-500 line-through dark:text-neutral-500">{item.name}</span>
                {data.canWrite && (
                  <button
                    type="button"
                    onClick={() => void run(item.id, () => reopenItem(item.id))}
                    aria-label={`Volver a poner ${item.name} en la lista`}
                    disabled={busy === item.id}
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-stone-500 hover:bg-stone-200/70 dark:hover:bg-neutral-800"
                  >
                    <RotateCcw className="h-4.5 w-4.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <AddItemSheet open={adding} onClose={() => setAdding(false)} />
      <BoughtSheet
        item={buying}
        unit={buying ? productOf(buying)?.unit ?? buying.unit ?? '' : ''}
        onClose={() => setBuying(null)}
        onConfirm={(item, add) =>
          void run(item.id, () => markBought(item.id, add), add ? `Stock actualizado: +${formatQty(add)}.` : `"${item.name}" marcado como comprado.`)
        }
      />
    </div>
  )
}

function AddItemSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Agregar a la lista">
      {open && <AddForm onClose={onClose} />}
    </Sheet>
  )
}

function AddForm({ onClose }: { onClose: () => void }) {
  const data = useInventoryData()
  const toast = useToast()
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState('unidades')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const n = qty.trim() === '' ? null : parseNumber(qty)
    if (!name.trim()) return setError('Escribe qué hay que comprar.')
    if (n !== null && (Number.isNaN(n) || n <= 0)) return setError('La cantidad debe ser un número mayor a cero.')
    setSaving(true)
    try {
      await data.track(
        addManualItem(data.inventory.id, {
          name: name.trim(),
          quantity_needed: n,
          unit: n !== null ? unit : null,
          note: note.trim() || null,
        }),
      )
      await data.reload('shopping')
      toast.success('Agregado a la lista.')
      onClose()
    } catch (err) {
      setError(toUserMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Qué comprar" required error={error}>
        {(id) => <Input id={id} value={name} onChange={(e) => { setName(e.target.value); setError(null) }} placeholder="Pilas AA" maxLength={120} autoComplete="off" />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cantidad (opcional)">
          {(id) => <Input id={id} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />}
        </Field>
        <Field label="Unidad">
          {(id) => (
            <Select id={id} value={unit} onChange={(e) => setUnit(e.target.value)}>
              {data.allUnits.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Nota (opcional)">
        {(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Marca, tienda..." />}
      </Field>
      <Button type="submit" size="lg" full loading={saving}>Agregar a la lista</Button>
    </form>
  )
}

function BoughtSheet({
  item,
  unit,
  onClose,
  onConfirm,
}: {
  item: ShoppingItem | null
  unit: string
  onClose: () => void
  onConfirm: (item: ShoppingItem, add: number | undefined) => void
}) {
  return (
    <Sheet open={item !== null} onClose={onClose} title={item ? `Compraste "${item.name}"` : ''}>
      {item && <BoughtForm key={item.id} item={item} unit={unit} onClose={onClose} onConfirm={onConfirm} />}
    </Sheet>
  )
}

function BoughtForm({
  item,
  unit,
  onClose,
  onConfirm,
}: {
  item: ShoppingItem
  unit: string
  onClose: () => void
  onConfirm: (item: ShoppingItem, add: number | undefined) => void
}) {
  const [qty, setQty] = useState(item.quantity_needed != null ? String(item.quantity_needed).replace('.', ',') : '1')
  const [error, setError] = useState<string | null>(null)

  const confirmAdd = (e: FormEvent) => {
    e.preventDefault()
    const n = parseNumber(qty)
    if (qty.trim() === '' || Number.isNaN(n) || n <= 0) return setError('Ingresa una cantidad mayor a cero.')
    onConfirm(item, Math.round(n * 1000) / 1000)
    onClose()
  }

  return (
    <form onSubmit={confirmAdd} className="space-y-4">
      <p className="text-sm text-stone-500 dark:text-neutral-400">
        Indica cuánto compraste para sumarlo al stock del inventario, o solo márcalo como comprado.
      </p>
      <Field label={`Cantidad comprada (${unit})`} error={error}>
        {(id) => <Input id={id} inputMode="decimal" value={qty} onChange={(e) => { setQty(e.target.value); setError(null) }} onFocus={(e) => e.target.select()} autoFocus />}
      </Field>
      <div className={cn('flex flex-col gap-2')}>
        <Button type="submit" size="lg" full>Sumar al stock y marcar comprado</Button>
        <Button
          variant="secondary"
          full
          onClick={() => {
            onConfirm(item, undefined)
            onClose()
          }}
        >
          Solo marcar comprado
        </Button>
      </div>
    </form>
  )
}
