import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Package, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import { ProductCard } from '../components/inventory/ProductCard'
import { ProductFormSheet, type ProductFormTarget } from '../components/inventory/ProductFormSheet'
import { SetQuantitySheet } from '../components/inventory/SetQuantitySheet'
import { Button } from '../components/ui/Button'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { Field, Select } from '../components/ui/Field'
import { EmptyState, IconBadge } from '../components/ui/Misc'
import { Segmented } from '../components/ui/Segmented'
import { Sheet } from '../components/ui/Sheet'
import { useInventoryData } from '../contexts/InventoryDataContext'
import { useToast } from '../contexts/ToastContext'
import { toUserMessage } from '../lib/errors'
import { expiryOf } from '../lib/stock'
import { removeProductImage } from '../services/images'
import { deleteProduct } from '../services/products'
import type { Category, Product, StockStatus } from '../types/database'
import { cn, normalizeText } from '../utils/cn'

type StatusFilter = 'all' | StockStatus | 'expiring'
type SortKey = 'name' | 'qty-asc' | 'qty-desc' | 'expiry' | 'recent'
type GroupMode = 'category' | 'none'

const SORTERS: Record<SortKey, (a: Product, b: Product) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, 'es'),
  'qty-asc': (a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name, 'es'),
  'qty-desc': (a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'es'),
  expiry: (a, b) => {
    if (!a.expiry_date && !b.expiry_date) return a.name.localeCompare(b.name, 'es')
    if (!a.expiry_date) return 1
    if (!b.expiry_date) return -1
    return a.expiry_date.localeCompare(b.expiry_date)
  },
  recent: (a, b) => b.updated_at.localeCompare(a.updated_at),
}

const SORT_LABELS: Record<SortKey, string> = {
  name: 'Nombre (A a Z)',
  'qty-asc': 'Cantidad: menor a mayor',
  'qty-desc': 'Cantidad: mayor a menor',
  expiry: 'Vencimiento más próximo',
  recent: 'Modificados recientemente',
}

export default function InventoryPage() {
  const data = useInventoryData()
  const toast = useToast()
  const confirm = useConfirm()
  const [params, setParams] = useSearchParams()

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [locationId, setLocationId] = useState<string>('all')
  const [categoryId, setCategoryId] = useState<string>('all')
  const [subcategoryId, setSubcategoryId] = useState<string>('all')
  const [sort, setSort] = useState<SortKey>('name')
  const [group, setGroup] = useState<GroupMode>('category')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [form, setForm] = useState<ProductFormTarget | null>(null)
  const [qtyProduct, setQtyProduct] = useState<Product | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)

  const locationById = useMemo(() => new Map(data.locations.map((l) => [l.id, l])), [data.locations])
  const categoryById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories])
  const subById = useMemo(() => new Map(data.subcategories.map((s) => [s.id, s])), [data.subcategories])

  // Abrir un producto desde un enlace (?p=<id>), por ejemplo desde una alerta
  const openId = params.get('p')
  useEffect(() => {
    if (!openId || data.loading) return
    const product = data.products.find((p) => p.id === openId)
    if (product) {
      setForm({ mode: 'edit', product })
      setHighlight(product.id)
      window.setTimeout(() => setHighlight(null), 3500)
    } else {
      toast.info('Ese producto ya no existe.')
    }
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('p')
      return next
    }, { replace: true })
  }, [openId, data.loading, data.products, setParams, toast])

  const counts = useMemo(() => {
    let low = 0
    let out = 0
    let expiring = 0
    for (const p of data.products) {
      if (p.stock_status === 'low') low++
      if (p.stock_status === 'out') out++
      const e = expiryOf(p.expiry_date).status
      if (e === 'soon' || e === 'expired') expiring++
    }
    return { all: data.products.length, low, out, expiring }
  }, [data.products])

  const filtered = useMemo(() => {
    const q = normalizeText(query)
    const list = data.products.filter((p) => {
      if (status === 'expiring') {
        const e = expiryOf(p.expiry_date).status
        if (e !== 'soon' && e !== 'expired') return false
      } else if (status !== 'all' && p.stock_status !== status) {
        return false
      }
      if (locationId === 'none' ? p.location_id !== null : locationId !== 'all' && p.location_id !== locationId) return false
      if (categoryId === 'none' ? p.category_id !== null : categoryId !== 'all' && p.category_id !== categoryId) return false
      if (subcategoryId !== 'all' && p.subcategory_id !== subcategoryId) return false
      if (q) {
        const haystack = normalizeText(
          [
            p.name,
            p.brand ?? '',
            p.notes ?? '',
            locationById.get(p.location_id ?? '')?.name ?? '',
            categoryById.get(p.category_id ?? '')?.name ?? '',
            subById.get(p.subcategory_id ?? '')?.name ?? '',
          ].join(' '),
        )
        if (!haystack.includes(q)) return false
      }
      return true
    })
    return list.sort(SORTERS[sort])
  }, [data.products, status, locationId, categoryId, subcategoryId, query, sort, locationById, categoryById, subById])

  const groups = useMemo(() => {
    if (group === 'none') return [{ key: 'all', category: undefined as Category | undefined, subs: [{ key: '', name: '', items: filtered }] }]
    const result: Array<{ key: string; category: Category | undefined; subs: Array<{ key: string; name: string; items: Product[] }> }> = []
    const catOrder = [...data.categories.map((c) => c.id), 'none']
    for (const cid of catOrder) {
      const inCat = filtered.filter((p) => (p.category_id ?? 'none') === cid)
      if (inCat.length === 0) continue
      const subs: Array<{ key: string; name: string; items: Product[] }> = []
      const withoutSub = inCat.filter((p) => !p.subcategory_id || !subById.has(p.subcategory_id))
      if (withoutSub.length) subs.push({ key: 'none', name: '', items: withoutSub })
      for (const s of data.subcategories.filter((s) => s.category_id === cid)) {
        const items = inCat.filter((p) => p.subcategory_id === s.id)
        if (items.length) subs.push({ key: s.id, name: s.name, items })
      }
      result.push({ key: cid, category: categoryById.get(cid), subs })
    }
    return result
  }, [filtered, group, data.categories, data.subcategories, categoryById, subById])

  const activeFilters =
    (categoryId !== 'all' ? 1 : 0) + (subcategoryId !== 'all' ? 1 : 0) + (sort !== 'name' ? 1 : 0) + (group !== 'category' ? 1 : 0)
  const hasAnyFilter = query !== '' || status !== 'all' || locationId !== 'all' || categoryId !== 'all' || subcategoryId !== 'all'

  const resetFilters = () => {
    setQuery('')
    setStatus('all')
    setLocationId('all')
    setCategoryId('all')
    setSubcategoryId('all')
  }

  // ------------------------------------------------------------- acciones
  const onClear = async (p: Product) => {
    const ok = await confirm({
      title: `Vaciar "${p.name}"`,
      message: 'La cantidad quedará en 0 y el producto pasará a la lista de compras. Queda registrado en el historial.',
      confirmLabel: 'Vaciar stock',
      danger: true,
    })
    if (ok) await data.setQuantity(p, 0, 'clear')
  }

  const onDelete = async (p: Product) => {
    const ok = await confirm({
      title: `Eliminar "${p.name}"`,
      message: 'El producto se elimina del inventario. El historial conserva el registro de lo que pasó con él.',
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    try {
      await data.track(deleteProduct(p.id))
      if (p.image_path) void removeProductImage(p.image_path)
      toast.success(`"${p.name}" eliminado.`)
      void data.reload('products', 'shopping', 'alerts', 'notifications')
    } catch (e) {
      toast.error(toUserMessage(e))
    }
  }

  const onDuplicate = (p: Product) => {
    setForm({
      mode: 'create',
      template: { ...p, name: `${p.name} (copia)`, image_path: null },
    })
  }

  const onSaveQty = (p: Product, quantity: number) => void data.setQuantity(p, quantity, 'set')

  const subsOfFilterCategory = categoryId !== 'all' && categoryId !== 'none' ? data.subcategories.filter((s) => s.category_id === categoryId) : []

  // ------------------------------------------------------------------ vista
  const noStructure = data.locations.length === 0 || data.categories.length === 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-neutral-50">Inventario</h1>
        {data.canWrite && (
          <Button icon={<Plus className="h-5 w-5" />} onClick={() => setForm({ mode: 'create' })} className="max-sm:hidden">
            Agregar producto
          </Button>
        )}
      </div>

      {data.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {data.error}
        </p>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar productos"
            aria-label="Buscar productos"
            className="h-12 w-full rounded-xl border border-stone-300 bg-white pl-11 pr-10 text-base text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Borrar búsqueda"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-neutral-800"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          aria-label="Filtros y orden"
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-stone-300 bg-white text-stone-700 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
        >
          <SlidersHorizontal className="h-5 w-5" />
          {activeFilters > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[11px] font-bold text-white">
              {activeFilters}
            </span>
          )}
        </button>
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0" role="group" aria-label="Estado de stock">
        <Chip active={status === 'all'} onClick={() => setStatus('all')}>Todos ({counts.all})</Chip>
        <Chip active={status === 'low'} onClick={() => setStatus('low')} dot="bg-amber-500">Stock bajo ({counts.low})</Chip>
        <Chip active={status === 'out'} onClick={() => setStatus('out')} dot="bg-red-500">Agotados ({counts.out})</Chip>
        <Chip active={status === 'expiring'} onClick={() => setStatus('expiring')}>Por vencer ({counts.expiring})</Chip>
      </div>

      {data.locations.length > 0 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0" role="group" aria-label="Ubicación">
          <Chip active={locationId === 'all'} onClick={() => setLocationId('all')}>Todas las ubicaciones</Chip>
          {data.locations.map((l) => (
            <Chip key={l.id} active={locationId === l.id} onClick={() => setLocationId(l.id)}>
              {l.name}
            </Chip>
          ))}
        </div>
      )}

      {data.loading ? (
        <ListSkeleton />
      ) : data.products.length === 0 ? (
        <EmptyState
          icon={<Package className="h-7 w-7" />}
          title="Este inventario está vacío"
          message={
            data.canWrite
              ? noStructure
                ? 'Primero crea al menos una ubicación y una categoría en Configuración, o agrégalas al crear tu primer producto.'
                : 'Agrega tu primer producto para empezar a controlar el stock.'
              : 'Todavía no hay productos. Quien administra el inventario puede agregarlos.'
          }
          action={
            data.canWrite ? (
              <Button icon={<Plus className="h-5 w-5" />} onClick={() => setForm({ mode: 'create' })}>
                Agregar producto
              </Button>
            ) : undefined
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="h-7 w-7" />}
          title="Sin resultados"
          message="Ningún producto coincide con la búsqueda o los filtros elegidos."
          action={hasAnyFilter ? <Button variant="secondary" onClick={resetFilters}>Limpiar filtros</Button> : undefined}
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.category?.name ?? 'Productos'}>
              {group === 'category' && (
                <div className="mb-2 flex items-center gap-2.5">
                  {g.category ? <IconBadge icon={g.category.icon} color={g.category.color} size="sm" /> : <IconBadge icon="package" color="#64748b" size="sm" />}
                  <h2 className="text-base font-semibold text-stone-900 dark:text-neutral-100">{g.category?.name ?? 'Sin categoría'}</h2>
                  <span className="text-sm text-stone-500 dark:text-neutral-400">
                    {g.subs.reduce((n, s) => n + s.items.length, 0)}
                  </span>
                </div>
              )}
              <div className="space-y-4">
                {g.subs.map((s) => (
                  <div key={s.key}>
                    {s.name && (
                      <h3 className="mb-1.5 ml-1 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-neutral-400">
                        {s.name}
                      </h3>
                    )}
                    <div className="grid gap-3 md:grid-cols-2">
                      {s.items.map((p) => (
                        <ProductCard
                          key={p.id}
                          product={p}
                          category={categoryById.get(p.category_id ?? '')}
                          location={locationById.get(p.location_id ?? '')}
                          canWrite={data.canWrite}
                          highlighted={highlight === p.id}
                          onAdjust={(prod, delta) => void data.adjust(prod, delta)}
                          onOpen={(prod) => setForm({ mode: 'edit', product: prod })}
                          onEditQuantity={setQtyProduct}
                          onDuplicate={onDuplicate}
                          onClear={(prod) => void onClear(prod)}
                          onDelete={(prod) => void onDelete(prod)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {data.canWrite && (
        <button
          type="button"
          onClick={() => setForm({ mode: 'create' })}
          aria-label="Agregar producto"
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-900/25 transition active:scale-95 sm:hidden"
        >
          <Plus className="h-7 w-7" />
        </button>
      )}

      <ProductFormSheet
        target={form}
        onClose={() => setForm(null)}
        defaultLocationId={locationId !== 'all' && locationId !== 'none' ? locationId : null}
      />
      <SetQuantitySheet product={qtyProduct} onClose={() => setQtyProduct(null)} onSave={onSaveQty} />

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtros y orden"
        footer={
          <div className="flex gap-3">
            <Button
              variant="secondary"
              full
              onClick={() => {
                setCategoryId('all')
                setSubcategoryId('all')
                setSort('name')
                setGroup('category')
              }}
            >
              Restablecer
            </Button>
            <Button full onClick={() => setFiltersOpen(false)}>
              Ver {filtered.length} {filtered.length === 1 ? 'producto' : 'productos'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Categoría">
            {(id) => (
              <Select
                id={id}
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value)
                  setSubcategoryId('all')
                }}
              >
                <option value="all">Todas</option>
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="none">Sin categoría</option>
              </Select>
            )}
          </Field>
          {subsOfFilterCategory.length > 0 && (
            <Field label="Subcategoría">
              {(id) => (
                <Select id={id} value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)}>
                  <option value="all">Todas</option>
                  {subsOfFilterCategory.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Field label="Ordenar por">
            {(id) => (
              <Select id={id} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABELS[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-medium text-stone-700 dark:text-neutral-300">Vista</p>
            <Segmented<GroupMode>
              label="Agrupar productos"
              value={group}
              onChange={setGroup}
              options={[
                { value: 'category', label: 'Por categoría' },
                { value: 'none', label: 'Lista simple' },
              ]}
            />
          </div>
        </div>
      </Sheet>
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
  dot,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  dot?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition',
        active
          ? 'border-emerald-600 bg-emerald-600 text-white'
          : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200',
      )}
    >
      {dot && <span className={cn('h-2 w-2 rounded-full', dot)} aria-hidden />}
      {children}
    </button>
  )
}

function ListSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-32 animate-pulse rounded-2xl bg-stone-200/70 dark:bg-neutral-800" />
      ))}
    </div>
  )
}
