import { useState } from 'react'
import { Copy, Eraser, MapPin, Minus, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { STATUS_META, formatQty, stepFor } from '../../lib/stock'
import type { Category, Location, Product } from '../../types/database'
import { cn } from '../../utils/cn'
import { Sheet } from '../ui/Sheet'
import { IconBadge } from '../ui/Misc'
import { ExpiryBadge, StatusBadge } from './Badges'
import { ProductImage } from './ProductImage'

interface ProductCardProps {
  product: Product
  category?: Category
  location?: Location
  canWrite: boolean
  highlighted?: boolean
  onAdjust: (product: Product, delta: number) => void
  onOpen: (product: Product) => void
  onEditQuantity: (product: Product) => void
  onDuplicate: (product: Product) => void
  onClear: (product: Product) => void
  onDelete: (product: Product) => void
}

export function ProductCard({
  product,
  category,
  location,
  canWrite,
  highlighted,
  onAdjust,
  onOpen,
  onEditQuantity,
  onDuplicate,
  onClear,
  onDelete,
}: ProductCardProps) {
  const [menu, setMenu] = useState(false)
  const step = stepFor(product.unit)
  const meta = STATUS_META[product.stock_status]

  return (
    <article
      id={`product-${product.id}`}
      className={cn(
        'rounded-2xl border bg-white p-3.5 shadow-sm transition dark:bg-neutral-900',
        product.stock_status === 'out'
          ? 'border-red-200 dark:border-red-500/30'
          : product.stock_status === 'low'
            ? 'border-amber-200 dark:border-amber-500/30'
            : 'border-stone-200/80 dark:border-neutral-800',
        highlighted && 'ring-2 ring-emerald-500',
      )}
    >
      <div className="flex items-start gap-3">
        {product.image_path ? (
          <ProductImage path={product.image_path} alt={product.name} className="h-12 w-12 shrink-0 rounded-xl" />
        ) : (
          <IconBadge icon={category?.icon ?? 'package'} color={category?.color ?? '#64748b'} />
        )}
        <button
          type="button"
          onClick={() => onOpen(product)}
          className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-emerald-600"
        >
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-base font-semibold text-stone-900 dark:text-neutral-100">{product.name}</span>
            {product.brand && <span className="truncate text-sm text-stone-500 dark:text-neutral-400">{product.brand}</span>}
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-xs text-stone-500 dark:text-neutral-400">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{location?.name ?? 'Sin ubicación'}</span>
            {category && <span className="truncate">· {category.name}</span>}
          </span>
        </button>
        {canWrite && (
          <button
            type="button"
            onClick={() => setMenu(true)}
            aria-label={`Más acciones para ${product.name}`}
            className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <StatusBadge status={product.stock_status} />
          <ExpiryBadge date={product.expiry_date} />
        </div>

        {canWrite ? (
          <div className="flex shrink-0 items-center gap-1" role="group" aria-label={`Cantidad de ${product.name}`}>
            <button
              type="button"
              onClick={() => onAdjust(product, -step)}
              disabled={product.quantity <= 0}
              aria-label={`Quitar ${formatQty(step)} ${product.unit}`}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-stone-100 text-stone-800 transition active:scale-95 disabled:opacity-35 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <Minus className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => onEditQuantity(product)}
              aria-label={`Cantidad actual: ${formatQty(product.quantity)} ${product.unit}. Tocar para escribir otra`}
              className="min-w-[4.5rem] rounded-xl px-2 py-1 text-center focus-visible:outline-2 focus-visible:outline-emerald-600"
            >
              <span className={cn('block text-xl font-bold leading-tight tabular-nums', product.stock_status === 'out' && 'text-red-600 dark:text-red-400')}>
                {formatQty(product.quantity)}
              </span>
              <span className="block max-w-[5.5rem] truncate text-[11px] leading-tight text-stone-500 dark:text-neutral-400">
                {product.unit}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onAdjust(product, step)}
              aria-label={`Agregar ${formatQty(step)} ${product.unit}`}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white transition active:scale-95"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <div className="text-right">
            <span className="block text-xl font-bold tabular-nums">{formatQty(product.quantity)}</span>
            <span className="block text-[11px] text-stone-500 dark:text-neutral-400">{product.unit}</span>
          </div>
        )}
      </div>
      {product.stock_status !== 'ok' && (
        <p className="mt-2 text-xs text-stone-500 dark:text-neutral-400">
          <span className={cn('mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle', meta.dot)} aria-hidden />
          Mínimo configurado: {formatQty(product.min_stock)} {product.unit}
        </p>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={product.name}>
        <ul className="-mx-2 space-y-1">
          <MenuItem icon={Pencil} label="Editar producto" onClick={() => { setMenu(false); onOpen(product) }} />
          <MenuItem icon={Copy} label="Duplicar" onClick={() => { setMenu(false); onDuplicate(product) }} />
          <MenuItem icon={Eraser} label="Vaciar stock (dejar en 0)" disabled={product.quantity === 0} onClick={() => { setMenu(false); onClear(product) }} />
          <MenuItem icon={Trash2} label="Eliminar" danger onClick={() => { setMenu(false); onDelete(product) }} />
        </ul>
      </Sheet>
    </article>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: typeof Pencil
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'flex h-13 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium transition disabled:opacity-40',
          danger
            ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'
            : 'text-stone-800 hover:bg-stone-100 dark:text-neutral-100 dark:hover:bg-neutral-800',
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
        {label}
      </button>
    </li>
  )
}
