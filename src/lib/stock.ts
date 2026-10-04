import { EXPIRY_WARNING_DAYS } from './constants'
import { daysUntil } from './time'
import type { ExpiryStatus, Movement, Product, StockStatus } from '../types/database'

/** Misma lógica que la columna generada stock_status de la base de datos. */
export function statusOf(quantity: number, minStock: number): StockStatus {
  if (quantity <= 0) return 'out'
  if (quantity <= minStock) return 'low'
  return 'ok'
}

export const STATUS_META: Record<
  StockStatus,
  { label: string; dot: string; badge: string; ring: string; emoji: string }
> = {
  ok: {
    label: 'Stock suficiente',
    emoji: '🟢',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    ring: 'ring-emerald-500/30',
  },
  low: {
    label: 'Stock bajo',
    emoji: '🟡',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    ring: 'ring-amber-500/40',
  },
  out: {
    label: 'Agotado',
    emoji: '🔴',
    dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
    ring: 'ring-red-500/40',
  },
}

export function expiryOf(date: string | null, nowMs?: number): { status: ExpiryStatus; days: number | null } {
  if (!date) return { status: 'none', days: null }
  const days = daysUntil(date, nowMs)
  if (days < 0) return { status: 'expired', days }
  if (days <= EXPIRY_WARNING_DAYS) return { status: 'soon', days }
  return { status: 'ok', days }
}

export const EXPIRY_META: Record<Exclude<ExpiryStatus, 'none'>, { label: string; badge: string }> = {
  ok: {
    label: 'Normal',
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  soon: {
    label: 'Próximo a vencer',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  expired: {
    label: 'Vencido',
    badge: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  },
}

export function expiryText(days: number): string {
  if (days === 0) return 'Vence hoy'
  if (days === 1) return 'Vence mañana'
  if (days > 1) return `Vence en ${days} días`
  if (days === -1) return 'Venció ayer'
  return `Venció hace ${-days} días`
}

/** Paso de los botones +/- según la unidad. */
export function stepFor(unit: string): number {
  const u = unit.trim().toLowerCase()
  if (u === 'g' || u === 'ml') return 100
  if (u === 'kg' || u === 'litros' || u === 'litro' || u === 'l') return 0.5
  return 1
}

const qtyFormatter = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 })

export function formatQty(n: number): string {
  return qtyFormatter.format(n)
}

// Realtime no incluye las columnas generadas (stock_status, diff), así que se
// recalculan en el cliente. También se fuerza el tipo numérico.
export function normalizeProduct(raw: Record<string, unknown>): Product {
  const quantity = Number(raw.quantity ?? 0)
  const minStock = Number(raw.min_stock ?? 0)
  return {
    ...(raw as unknown as Product),
    quantity,
    min_stock: minStock,
    stock_status: statusOf(quantity, minStock),
  }
}

export function normalizeMovement(raw: Record<string, unknown>): Movement {
  const before = raw.quantity_before == null ? null : Number(raw.quantity_before)
  const after = raw.quantity_after == null ? null : Number(raw.quantity_after)
  return {
    ...(raw as unknown as Movement),
    quantity_before: before,
    quantity_after: after,
    diff: (after ?? 0) - (before ?? 0),
  }
}

export const ACTION_LABELS: Record<Movement['action'], string> = {
  create: 'Creó el producto',
  increase: 'Aumentó el stock',
  decrease: 'Disminuyó el stock',
  set: 'Ajustó la cantidad',
  update: 'Editó el producto',
  delete: 'Eliminó el producto',
  purchase: 'Registró una compra',
  clear: 'Vació el stock',
}

export function describeChange(m: Movement): string {
  const unit = m.unit ? ` ${m.unit}` : ''
  switch (m.action) {
    case 'create':
      return `Creado con ${formatQty(m.quantity_after ?? 0)}${unit}`
    case 'delete':
      return `Eliminado (había ${formatQty(m.quantity_before ?? 0)}${unit})`
    case 'update':
      return 'Datos del producto editados'
    default:
      return `${formatQty(m.quantity_before ?? 0)} → ${formatQty(m.quantity_after ?? 0)}${unit}`
  }
}
