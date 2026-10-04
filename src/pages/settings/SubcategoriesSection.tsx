import { useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { Field, Input, Select } from '../../components/ui/Field'
import { Card, EmptyState, IconBadge } from '../../components/ui/Misc'
import { Sheet } from '../../components/ui/Sheet'
import { useInventoryData } from '../../contexts/InventoryDataContext'
import { useToast } from '../../contexts/ToastContext'
import { COMMON_UNITS } from '../../lib/constants'
import { toUserMessage } from '../../lib/errors'
import { createSubcategory, createUnit, deleteSubcategory, deleteUnit, reorder, updateSubcategory } from '../../services/structure'
import type { Subcategory } from '../../types/database'
import { IconButton } from './NamedSections'
import { ReadOnlyNotice } from './shared'

type Target = { mode: 'new'; categoryId: string } | { mode: 'edit'; sub: Subcategory }

export function SubcategoriesSection() {
  const data = useInventoryData()
  const toast = useToast()
  const confirm = useConfirm()
  const [target, setTarget] = useState<Target | null>(null)
  const [busy, setBusy] = useState(false)

  const countOf = (id: string) => data.products.filter((p) => p.subcategory_id === id).length

  const move = async (categoryId: string, index: number, dir: -1 | 1) => {
    const list = data.subcategories.filter((s) => s.category_id === categoryId)
    const to = index + dir
    if (to < 0 || to >= list.length) return
    const ids = list.map((s) => s.id)
    ;[ids[index], ids[to]] = [ids[to], ids[index]]
    setBusy(true)
    try {
      await data.track(reorder('subcategories', ids))
      await data.reload('structure')
    } catch (e) {
      toast.error(toUserMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (s: Subcategory) => {
    const n = countOf(s.id)
    const ok = await confirm({
      title: `Eliminar "${s.name}"`,
      message:
        n > 0
          ? `${n} ${n === 1 ? 'producto queda' : 'productos quedan'} en su categoría, sin subcategoría. Los productos no se eliminan.`
          : 'Se elimina la subcategoría.',
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    try {
      await data.track(deleteSubcategory(s.id))
      await data.reload('structure', 'products')
      toast.success('Subcategoría eliminada.')
    } catch (e) {
      toast.error(toUserMessage(e))
    }
  }

  if (data.categories.length === 0) {
    return (
      <EmptyState
        icon={<Plus className="h-7 w-7" />}
        title="Primero crea una categoría"
        message="Las subcategorías son divisiones dentro de una categoría, por ejemplo Lácteos dentro de Alimentos."
      />
    )
  }

  return (
    <div className="space-y-5">
      {!data.canWrite && <ReadOnlyNotice />}
      <p className="text-sm text-stone-500 dark:text-neutral-400">Son opcionales: úsalas solo si te ayudan a ordenar una categoría grande.</p>
      {data.categories.map((c) => {
        const subs = data.subcategories.filter((s) => s.category_id === c.id)
        return (
          <section key={c.id} aria-label={c.name}>
            <div className="mb-2 flex items-center gap-2.5">
              <IconBadge icon={c.icon} color={c.color} size="sm" />
              <h3 className="flex-1 font-semibold text-stone-900 dark:text-neutral-100">{c.name}</h3>
              {data.canWrite && (
                <Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => setTarget({ mode: 'new', categoryId: c.id })}>
                  Agregar
                </Button>
              )}
            </div>
            {subs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-stone-300 px-4 py-3 text-sm text-stone-500 dark:border-neutral-700 dark:text-neutral-400">
                Sin subcategorías.
              </p>
            ) : (
              <Card className="divide-y divide-stone-100 dark:divide-neutral-800">
                {subs.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-stone-900 dark:text-neutral-100">{s.name}</p>
                      <p className="text-xs text-stone-500 dark:text-neutral-400">{countOf(s.id)} productos</p>
                    </div>
                    {data.canWrite && (
                      <div className="flex shrink-0 items-center">
                        <IconButton label={`Subir ${s.name}`} disabled={i === 0 || busy} onClick={() => void move(c.id, i, -1)}>
                          <ArrowUp className="h-4.5 w-4.5" />
                        </IconButton>
                        <IconButton label={`Bajar ${s.name}`} disabled={i === subs.length - 1 || busy} onClick={() => void move(c.id, i, 1)}>
                          <ArrowDown className="h-4.5 w-4.5" />
                        </IconButton>
                        <IconButton label={`Renombrar ${s.name}`} onClick={() => setTarget({ mode: 'edit', sub: s })}>
                          <Pencil className="h-4.5 w-4.5" />
                        </IconButton>
                        <IconButton label={`Eliminar ${s.name}`} danger onClick={() => void remove(s)}>
                          <Trash2 className="h-4.5 w-4.5" />
                        </IconButton>
                      </div>
                    )}
                  </div>
                ))}
              </Card>
            )}
          </section>
        )
      })}

      <Sheet open={target !== null} onClose={() => setTarget(null)} title={target?.mode === 'edit' ? 'Renombrar subcategoría' : 'Nueva subcategoría'}>
        {target && <SubForm key={target.mode === 'edit' ? target.sub.id : target.categoryId} target={target} onClose={() => setTarget(null)} />}
      </Sheet>
    </div>
  )
}

function SubForm({ target, onClose }: { target: Target; onClose: () => void }) {
  const data = useInventoryData()
  const toast = useToast()
  const existing = target.mode === 'edit' ? target.sub : null
  const [categoryId, setCategoryId] = useState(existing?.category_id ?? (target as { categoryId: string }).categoryId)
  const [name, setName] = useState(existing?.name ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Ponle un nombre.')
    const siblings = data.subcategories.filter((s) => s.category_id === categoryId && s.id !== existing?.id)
    if (siblings.some((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase())) {
      return setError('Ya existe una subcategoría con ese nombre en esta categoría.')
    }
    setSaving(true)
    try {
      if (existing) await data.track(updateSubcategory(existing.id, { name: name.trim() }))
      else await data.track(createSubcategory(data.inventory.id, categoryId, name.trim(), siblings.length + 1))
      await data.reload('structure', 'products')
      toast.success(existing ? 'Cambios guardados.' : 'Subcategoría creada.')
      onClose()
    } catch (err) {
      setError(toUserMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {!existing && (
        <Field label="Categoría">
          {(id) => (
            <Select id={id} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
        </Field>
      )}
      <Field label="Nombre" required error={error}>
        {(id) => <Input id={id} value={name} onChange={(e) => { setName(e.target.value); setError(null) }} placeholder="Lácteos" maxLength={60} autoComplete="off" />}
      </Field>
      <Button type="submit" size="lg" full loading={saving}>{existing ? 'Guardar cambios' : 'Crear'}</Button>
    </form>
  )
}

// ------------------------------------------------------------------ unidades
export function UnitsSection() {
  const data = useInventoryData()
  const toast = useToast()
  const confirm = useConfirm()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return setError('Escribe el nombre de la unidad.')
    if (data.allUnits.some((u) => u.toLowerCase() === n.toLowerCase())) return setError('Esa unidad ya existe.')
    setSaving(true)
    try {
      await data.track(createUnit(data.inventory.id, n))
      await data.reload('structure')
      setName('')
      setError(null)
      toast.success('Unidad agregada.')
    } catch (err) {
      setError(toUserMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string, unitName: string) => {
    const used = data.products.filter((p) => p.unit === unitName).length
    const ok = await confirm({
      title: `Eliminar la unidad "${unitName}"`,
      message:
        used > 0
          ? `${used} ${used === 1 ? 'producto la usa' : 'productos la usan'} y la conservan, pero ya no aparecerá en las opciones.`
          : 'Se elimina de las opciones.',
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    try {
      await data.track(deleteUnit(id))
      await data.reload('structure')
    } catch (e) {
      toast.error(toUserMessage(e))
    }
  }

  return (
    <div className="space-y-5">
      {!data.canWrite && <ReadOnlyNotice />}
      {data.canWrite && (
        <form onSubmit={add} className="flex items-start gap-2" noValidate>
          <div className="flex-1">
            <Field label="Nueva unidad" error={error}>
              {(id) => <Input id={id} value={name} onChange={(e) => { setName(e.target.value); setError(null) }} placeholder="sachets, docenas, tarros..." maxLength={30} autoComplete="off" />}
            </Field>
          </div>
          <Button type="submit" className="mt-[1.65rem]" loading={saving} aria-label="Agregar unidad">
            <Plus className="h-5 w-5" />
          </Button>
        </form>
      )}

      <section aria-label="Unidades propias">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-neutral-400">Tus unidades</h3>
        {data.customUnits.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 px-4 py-3 text-sm text-stone-500 dark:border-neutral-700 dark:text-neutral-400">
            Aún no creaste unidades propias.
          </p>
        ) : (
          <Card className="divide-y divide-stone-100 dark:divide-neutral-800">
            {data.customUnits.map((u) => (
              <div key={u.id} className="flex items-center gap-2 px-3.5 py-2.5">
                <span className="flex-1 font-medium text-stone-900 dark:text-neutral-100">{u.name}</span>
                {data.canWrite && (
                  <IconButton label={`Eliminar ${u.name}`} danger onClick={() => void remove(u.id, u.name)}>
                    <Trash2 className="h-4.5 w-4.5" />
                  </IconButton>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>

      <section aria-label="Unidades comunes">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-neutral-400">Unidades comunes (siempre disponibles)</h3>
        <div className="flex flex-wrap gap-2">
          {COMMON_UNITS.map((u) => (
            <span key={u} className="rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-700 dark:bg-neutral-800 dark:text-neutral-300">
              {u}
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}
