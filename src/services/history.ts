import { supabase } from '../lib/supabase'
import { normalizeMovement } from '../lib/stock'
import type { Movement } from '../types/database'
import { must } from './helpers'

export interface HistoryFilters {
  productId?: string
  userId?: string
  /** YYYY-MM-DD, inclusive (hora local del navegador) */
  from?: string
  /** YYYY-MM-DD, inclusive */
  to?: string
}

export const HISTORY_PAGE = 50

export async function fetchMovements(
  inventoryId: string,
  filters: HistoryFilters = {},
  before?: string,
): Promise<Movement[]> {
  let query = supabase
    .from('inventory_movements')
    .select('*')
    .eq('inventory_id', inventoryId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_PAGE)

  if (filters.productId) query = query.eq('product_id', filters.productId)
  if (filters.userId) query = query.eq('user_id', filters.userId)
  if (filters.from) query = query.gte('created_at', new Date(`${filters.from}T00:00:00`).toISOString())
  if (filters.to) query = query.lt('created_at', new Date(new Date(`${filters.to}T00:00:00`).getTime() + 86_400_000).toISOString())
  if (before) query = query.lt('created_at', before)

  const rows = must(await query) as Record<string, unknown>[]
  return rows.map(normalizeMovement)
}
