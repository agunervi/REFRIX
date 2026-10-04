import { supabase } from '../lib/supabase'
import { normalizeProduct } from '../lib/stock'
import type { Product, ProductInput } from '../types/database'
import { must, mustAffect, mustOk } from './helpers'

const PAGE_SIZE = 1000

export async function fetchProducts(inventoryId: string): Promise<Product[]> {
  const all: Product[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const rows = must(
      await supabase
        .from('products')
        .select('*')
        .eq('inventory_id', inventoryId)
        .order('name')
        .range(from, from + PAGE_SIZE - 1),
    ) as Record<string, unknown>[]
    all.push(...rows.map(normalizeProduct))
    if (rows.length < PAGE_SIZE) break
  }
  return all
}

export async function createProduct(inventoryId: string, input: ProductInput): Promise<Product> {
  const row = must(
    await supabase
      .from('products')
      .insert({ inventory_id: inventoryId, ...input })
      .select('*')
      .single(),
  )
  return normalizeProduct(row as Record<string, unknown>)
}

export async function updateProduct(id: string, patch: Partial<ProductInput>): Promise<Product> {
  const rows = must(await supabase.from('products').update(patch).eq('id', id).select('*')) as Record<string, unknown>[]
  if (rows.length === 0) {
    throw { message: 'No tienes permiso para modificar este producto.', code: '42501' }
  }
  return normalizeProduct(rows[0])
}

export async function deleteProduct(id: string): Promise<void> {
  mustAffect(await supabase.from('products').delete().eq('id', id).select('id'))
}

/** Ajuste atómico en el servidor: dos personas pulsando "+" a la vez suman ambas. */
export async function adjustQuantity(id: string, delta: number): Promise<Product> {
  const row = must(await supabase.rpc('adjust_product_quantity', { p_product: id, p_delta: delta }))
  return normalizeProduct(row as Record<string, unknown>)
}

export async function setQuantity(id: string, quantity: number, action: 'set' | 'clear' = 'set'): Promise<Product> {
  const row = must(await supabase.rpc('set_product_quantity', { p_product: id, p_quantity: quantity, p_action: action }))
  return normalizeProduct(row as Record<string, unknown>)
}

export async function insertProductsBatch(inventoryId: string, rows: ProductInput[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => ({ inventory_id: inventoryId, ...r }))
    mustOk(await supabase.from('products').insert(chunk))
  }
}
