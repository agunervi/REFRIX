import { supabase } from '../lib/supabase'
import { normalizeMovement } from '../lib/stock'
import { setServerOffset } from '../lib/time'
import type { InventoryOverview, Movement } from '../types/database'
import { must, mustAffect, mustOk } from './helpers'

export async function fetchOverview(): Promise<InventoryOverview[]> {
  const rows = must(await supabase.from('inventory_overview').select('*').order('name'))
  return (rows as InventoryOverview[]).map((r) => ({
    ...r,
    product_count: Number(r.product_count),
    low_count: Number(r.low_count),
    out_count: Number(r.out_count),
    expiring_count: Number(r.expiring_count),
    expired_count: Number(r.expired_count),
    structure_version: Number(r.structure_version),
  }))
}

/** Mide el desfase del reloj local respecto de la base de datos. */
export async function syncServerClock(): Promise<void> {
  const sent = Date.now()
  const { data, error } = await supabase.rpc('server_now')
  const received = Date.now()
  if (!error && typeof data === 'string') setServerOffset(data, sent, received)
}

export interface InventoryInput {
  name: string
  description: string | null
  icon: string
  color: string
}

export async function createInventory(input: InventoryInput, ownerId: string): Promise<string> {
  const row = must(
    await supabase
      .from('inventories')
      .insert({ owner_id: ownerId, ...input })
      .select('id')
      .single(),
  )
  return (row as { id: string }).id
}

export async function updateInventory(id: string, patch: Partial<InventoryInput>): Promise<void> {
  mustAffect(await supabase.from('inventories').update(patch).eq('id', id).select('id'))
}

export async function deleteInventory(id: string): Promise<void> {
  mustAffect(
    await supabase.from('inventories').delete().eq('id', id).select('id'),
    'Solo el propietario puede eliminar el inventario.',
  )
}

export async function transferOwnership(inventoryId: string, newOwnerId: string): Promise<void> {
  mustOk(await supabase.rpc('transfer_ownership', { p_inventory: inventoryId, p_new_owner: newOwnerId }))
}

export async function fetchLastMovement(inventoryId: string): Promise<Movement | null> {
  const rows = must(
    await supabase
      .from('inventory_movements')
      .select('*')
      .eq('inventory_id', inventoryId)
      .order('created_at', { ascending: false })
      .limit(1),
  )
  const first = (rows as Record<string, unknown>[])[0]
  return first ? normalizeMovement(first) : null
}

export async function seedExampleData(inventoryId: string): Promise<void> {
  mustOk(await supabase.rpc('seed_example_data', { p_inventory: inventoryId }))
}

export async function removeExampleData(inventoryId: string): Promise<void> {
  mustOk(await supabase.rpc('remove_example_data', { p_inventory: inventoryId }))
}
