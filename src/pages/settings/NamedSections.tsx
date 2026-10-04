import { useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Field, Input, Select } from '../../components/ui/Field'
import { Card, ColorPicker, EmptyState, IconBadge, IconPicker } from '../../components/ui/Misc'
import { Sheet } from '../../components/ui/Sheet'
import { useInventoryData } from '../../contexts/InventoryDataContext'
import { useToast } from '../../contexts/ToastContext'
import { COLOR_PALETTE } from '../../lib/constants'
import { toUserMessage } from '../../lib/errors'
import { ICON_KEYS } from '../../lib/icons'
import {
  createNamed,
  deleteCategory,
  deleteLocation,
  reorder,
  updateNamed,
  type NamedInput,
} from '../../services/structure'
import type { Category, Location } from '../../types/database'
import { cn } from '../../utils/cn'
import { ReadOnlyNotice } from './shared'

type Kind = 'locations' | 'categories'
type Item = Location | Category
type DeleteMode = 'move' | 'orphan' | 'delete'

const TEXT = {
  locations: {
    singular: 'ubicación',
    plural: 'ubicaciones',
    newTitle: 'Nueva ubicación',
    editTitle: 'Editar ubicación',
    empty: 'Aún no tienes ubicaciones',
    emptyMsg: 'Crea lugares como Cocina, Baño o Bodega para saber dónde está cada cosa.',
    defaultIcon: 'package',
    placeholder: 'Cocina',
    moveLabel: 'Mover los productos a otra ubicación',
    orphanLabel: 'Dejar los productos sin ubicación',
    deleteLabel: (n: number) => `Eliminar también ${n === 1 ? 'el producto' : `los ${n} productos`}`,
  },
  categories: {
    singular: 'categoría',
    plural: 'categorías',
    newTitle: 'Nueva categoría',
    editTitle: 'Editar categoría',
    empty: 'Aún no tienes categorías',
    emptyMsg: 'Crea categorías como Alimentos, Aseo o Mascotas para agrupar tus productos.',
    defaultIcon: 'package',
    placeholder: 'Alimentos',
    moveLabel: 'Mover los productos a otra categoría',
    orphanLabel: 'Dejar los productos sin categoría',
    deleteLabel: (n: number) => `Eliminar también ${n === 1 ? 'el producto' : `los ${n} productos`}`,
  },
} as const

export function LocationsSection() {
  return <NamedSection kind="locations" />
}

export function CategoriesSection() {
  return <NamedSection kind="categories" />
}

function NamedSection({ kind }: { kind: Kind }) {
  const data = useInventoryData()
  const toast = useToast()
  const t = TEXT[kind]
  const items: Item[] = kind === 'locations' ? data.locations : data.categories
  const [editing, setEditing] = useState<Item | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Item | null>(null)
  const [moving, setMoving] = useState(false)

  const countOf = (item: Item): number =>
    data.products.filter((p) => (kind === 'locations' ? p.location_id : p.category_id) === item.id).length

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= items.length) return
    const ids = items.map((i) => i.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    setMoving(true)
    try {
      await data.track(reorder(kind, ids))
      await data.reload('structure')
    } catch (e) {
      toast.error(toUserMessage(e))
    } finally {
      setMoving(false)
    }
  }

  return (
    <div className="space-y-4">
      {!data.canWrite && <ReadOnlyNotice />}
      {data.canWrite && (
        <Button icon={<Plus className="h-5 w-5" />} onClick={() => setEditing('new')}>
          Agregar {t.singular}
        </Button>
      )}

      {items.length === 0 ? (
        <EmptyState icon={<Plus className="h-7 w-7" />} title={t.empty} message={t.emptyMsg} />
      ) : (
        <Card className="divide-y divide-stone-100 dark:divide-neutral-800">
          {items.map((item, index) => {
            const count = countOf(item)
            return (
              <div key={item.id} className="flex items-center gap-3 px-3.5 py-3">
                <IconBadge icon={item.icon} color={item.color} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-stone-900 dark:text-neutral-100">{item.name}</p>
                  <p className="text-xs text-stone-500 dark:text-neutral-400">
                    {count} {count === 1 ? 'producto' : 'productos'}
                  </p>
                </div>
                {data.canWrite && (
                  <div className="flex shrink-0 items-center">
                    <IconButton label={`Subir ${item.name}`} disabled={index === 0 || moving} onClick={() => void move(index, -1)}>
                      <ArrowUp className="h-4.5 w-4.5" />
                    </IconButton>
                    <IconButton label={`Bajar ${item.name}`} disabled={index === items.length - 1 || moving} onClick={() => void move(index, 1)}>
                      <ArrowDown className="h-4.5 w-4.5" />
                    </IconButton>
                    <IconButton label={`Editar ${item.name}`} onClick={() => setEditing(item)}>
                      <Pencil className="h-4.5 w-4.5" />
                    </IconButton>
                    <IconButton label={`Eliminar ${item.name}`} danger onClick={() => setDeleting(item)}>
                      <Trash2 className="h-4.5 w-4.5" />
                    </IconButton>
                  </div>
                )}
              </div>
            )
          })}
        </Card>
      )}

      <EditSheet kind={kind} target={editing} onClose={() => setEditing(null)} />
      <DeleteSheet kind={kind} item={deleting} count={deleting ? countOf(deleting) : 0} others={items.filter((i) => i.id !== deleting?.id)} onClose={() => setDeleting(null)} />
    </div>
  )
}

export function IconButton({
  label,
  onClick,
  children,
  danger,
  disabled,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-xl transition disabled:opacity-30',
        danger
          ? 'text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10'
          : 'text-stone-500 hover:bg-stone-100 dark:text-neutral-400 dark:hover:bg-neutral-800',
      )}
    >
      {children}
    </button>
  )
}

function EditSheet({ kind, target, onClose }: { kind: Kind; target: Item | 'new' | null; onClose: () => void }) {
  const t = TEXT[kind]
  return (
    <Sheet open={target !== null} onClose={onClose} title={target === 'new' ? t.newTitle : t.editTitle}>
      {target && <EditForm key={target === 'new' ? 'new' : target.id} kind={kind} target={target} onClose={onClose} />}
    </Sheet>
  )
}

function EditForm({ kind, target, onClose }: { kind: Kind; target: Item | 'new'; onClose: () => void }) {
  const data = useInventoryData()
  const toast = useToast()
  const t = TEXT[kind]
  const existing = target === 'new' ? null : target
  const [name, setName] = useState(existing?.name ?? '')
  const [icon, setIcon] = useState(existing?.icon ?? t.defaultIcon)
  const [color, setColor] = useState<string>(existing?.color ?? COLOR_PALETTE[kind === 'locations' ? 0 : 8])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Ponle un nombre.')
    const duplicate = (kind === 'locations' ? data.locations : data.categories).some(
      (i) => i.id !== existing?.id && i.name.trim().toLowerCase() === name.trim().toLowerCase(),
    )
    if (duplicate) return setError(`Ya tienes una ${t.singular} con ese nombre.`)
    setSaving(true)
    const input: NamedInput = { name: name.trim(), icon, color }
    try {
      if (existing) await data.track(updateNamed(kind, existing.id, input))
      else {
        const count = kind === 'locations' ? data.locations.length : data.categories.length
        await data.track(createNamed(kind, data.inventory.id, input, count + 1))
      }
      await data.reload('structure', 'products')
      toast.success(existing ? 'Cambios guardados.' : `${t.singular[0].toUpperCase()}${t.singular.slice(1)} creada.`)
      onClose()
    } catch (err) {
      setError(toUserMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="flex items-center gap-3">
        <IconBadge icon={icon} color={color} size="lg" />
        <div className="min-w-0 flex-1">
          <Field label="Nombre" required error={error}>
            {(id) => <Input id={id} value={name} onChange={(e) => { setName(e.target.value); setError(null) }} placeholder={t.placeholder} maxLength={60} autoComplete="off" />}
          </Field>
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-stone-700 dark:text-neutral-300">Ícono</p>
        <IconPicker value={icon} onChange={setIcon} keys={ICON_KEYS} color={color} />
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-stone-700 dark:text-neutral-300">Color</p>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <Button type="submit" size="lg" full loading={saving}>
        {existing ? 'Guardar cambios' : 'Crear'}
      </Button>
    </form>
  )
}

function DeleteSheet({
  kind,
  item,
  count,
  others,
  onClose,
}: {
  kind: Kind
  item: Item | null
  count: number
  others: Item[]
  onClose: () => void
}) {
  const t = TEXT[kind]
  return (
    <Sheet open={item !== null} onClose={onClose} title={item ? `Eliminar "${item.name}"` : ''}>
      {item && <DeleteForm key={item.id} kind={kind} item={item} count={count} others={others} onClose={onClose} t={t} />}
    </Sheet>
  )
}

function DeleteForm({
  kind,
  item,
  count,
  others,
  onClose,
  t,
}: {
  kind: Kind
  item: Item
  count: number
  others: Item[]
  onClose: () => void
  t: (typeof TEXT)[Kind]
}) {
  const data = useInventoryData()
  const toast = useToast()
  const [mode, setMode] = useState<DeleteMode>(others.length > 0 ? 'move' : 'orphan')
  const [target, setTarget] = useState(others[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    try {
      const fn = kind === 'locations' ? deleteLocation : deleteCategory
      await data.track(fn(item.id, count === 0 ? 'orphan' : mode, mode === 'move' ? target : undefined))
      await data.reload('structure', 'products', 'shopping', 'alerts', 'notifications')
      toast.success(`${t.singular[0].toUpperCase()}${t.singular.slice(1)} eliminada.`)
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (count === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-stone-600 dark:text-neutral-300">No hay productos en esta {t.singular}. Se elimina sin afectar nada más.</p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <Button variant="secondary" full onClick={onClose}>Cancelar</Button>
          <Button variant="danger" full loading={busy} onClick={() => void run()}>Eliminar</Button>
        </div>
      </div>
    )
  }

  const options: Array<{ value: DeleteMode; label: string; disabled?: boolean }> = [
    { value: 'move', label: t.moveLabel, disabled: others.length === 0 },
    { value: 'orphan', label: t.orphanLabel },
    { value: 'delete', label: t.deleteLabel(count) },
  ]

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600 dark:text-neutral-300">
        Esta {t.singular} tiene {count} {count === 1 ? 'producto' : 'productos'}. ¿Qué hacemos con {count === 1 ? 'él' : 'ellos'}?
      </p>
      <div role="radiogroup" aria-label="Qué hacer con los productos" className="space-y-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm',
              mode === o.value ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'border-stone-200 dark:border-neutral-700',
              o.disabled && 'cursor-not-allowed opacity-40',
              o.value === 'delete' && mode === 'delete' && 'border-red-500 bg-red-50 dark:bg-red-500/10',
            )}
          >
            <input type="radio" name="delete-mode" className="h-4 w-4 accent-emerald-600" checked={mode === o.value} disabled={o.disabled} onChange={() => setMode(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
      {mode === 'move' && (
        <Field label={`Mover a`}>
          {(id) => (
            <Select id={id} value={target} onChange={(e) => setTarget(e.target.value)}>
              {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          )}
        </Field>
      )}
      {mode === 'delete' && (
        <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          Los productos se eliminan de forma definitiva. El historial conserva el registro.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <Button variant="secondary" full onClick={onClose}>Cancelar</Button>
        <Button variant="danger" full loading={busy} disabled={mode === 'move' && !target} onClick={() => void run()}>
          Eliminar {t.singular}
        </Button>
      </div>
    </div>
  )
}
