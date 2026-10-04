import { supabase } from '../lib/supabase'
import type { Priority, ShoppingItem } from '../types/database'
import { must, mustAffect, mustOk } from './helpers'

export async function fetchShopping(inventoryId: string): Promise<ShoppingItem[]> {
  const rows = must(
    await supabase
      .from('shopping_list')
      .select('*')
      .eq('inventory_id', inventoryId)
      .order('created_at', { ascending: true }),
  )
  return (rows as ShoppingItem[]).map((r) => ({
    ...r,
    quantity_needed: r.quantity_needed == null ? null : Number(r.quantity_needed),
  }))
}

export async function addManualItem(
  inventoryId: string,
  input: { name: string; quantity_needed?: number | null; unit?: string | null; note?: string | null },
): Promise<void> {
  mustOk(
    await supabase.from('shopping_list').insert({
      inventory_id: inventoryId,
      name: input.name,
      quantity_needed: input.quantity_needed ?? null,
      unit: input.unit ?? null,
      note: input.note ?? null,
      auto: false,
      reason: 'manual',
    }),
  )
}

export async function updateShoppingItem(
  id: string,
  patch: Partial<{ name: string; quantity_needed: number | null; unit: string | null; note: string | null; priority: Priority }>,
): Promise<void> {
  mustAffect(await supabase.from('shopping_list').update(patch).eq('id', id).select('id'))
}

export async function deleteShoppingItem(id: string): Promise<void> {
  mustAffect(await supabase.from('shopping_list').delete().eq('id', id).select('id'))
}

/** Marca comprado y, si se indica, suma esa cantidad al stock del producto. */
export async function markBought(id: string, addToStock?: number): Promise<void> {
  mustOk(await supabase.rpc('mark_shopping_item_bought', { p_item: id, p_add: addToStock ?? null }))
}

export async function reopenItem(id: string): Promise<void> {
  mustAffect(
    await supabase
      .from('shopping_list')
      .update({ is_bought: false, bought_at: null, bought_by: null })
      .eq('id', id)
      .select('id'),
  )
}

export async function clearBought(inventoryId: string): Promise<void> {
  mustOk(await supabase.from('shopping_list').delete().eq('inventory_id', inventoryId).eq('is_bought', true))
}
