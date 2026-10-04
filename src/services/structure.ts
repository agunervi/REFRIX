import { supabase } from '../lib/supabase'
import type { Category, CustomUnit, Location, Subcategory } from '../types/database'
import { must, mustAffect, mustOk } from './helpers'

export interface Structure {
  locations: Location[]
  categories: Category[]
  subcategories: Subcategory[]
  units: CustomUnit[]
}

export async function fetchStructure(inventoryId: string): Promise<Structure> {
  const [locations, categories, subcategories, units] = await Promise.all([
    supabase.from('locations').select('*').eq('inventory_id', inventoryId).order('sort_order').order('name'),
    supabase.from('categories').select('*').eq('inventory_id', inventoryId).order('sort_order').order('name'),
    supabase.from('subcategories').select('*').eq('inventory_id', inventoryId).order('sort_order').order('name'),
    supabase.from('custom_units').select('*').eq('inventory_id', inventoryId).order('name'),
  ])
  return {
    locations: must(locations) as Location[],
    categories: must(categories) as Category[],
    subcategories: must(subcategories) as Subcategory[],
    units: must(units) as CustomUnit[],
  }
}

export interface NamedInput {
  name: string
  icon: string
  color: string
}

type NamedTable = 'locations' | 'categories'

export async function createNamed(
  table: NamedTable,
  inventoryId: string,
  input: NamedInput,
  sortOrder: number,
): Promise<string> {
  const row = must(
    await supabase
      .from(table)
      .insert({ inventory_id: inventoryId, ...input, sort_order: sortOrder })
      .select('id')
      .single(),
  )
  return (row as { id: string }).id
}

export async function updateNamed(table: NamedTable, id: string, patch: Partial<NamedInput>): Promise<void> {
  mustAffect(await supabase.from(table).update(patch).eq('id', id).select('id'))
}

export async function reorder(table: NamedTable | 'subcategories', orderedIds: string[]): Promise<void> {
  const results = await Promise.all(
    orderedIds.map((id, index) => supabase.from(table).update({ sort_order: index + 1 }).eq('id', id)),
  )
  for (const r of results) mustOk(r)
}

export async function deleteLocation(id: string, mode: 'move' | 'orphan' | 'delete', target?: string): Promise<void> {
  mustOk(await supabase.rpc('delete_location', { p_location: id, p_mode: mode, p_target: target ?? null }))
}

export async function deleteCategory(id: string, mode: 'move' | 'orphan' | 'delete', target?: string): Promise<void> {
  mustOk(await supabase.rpc('delete_category', { p_category: id, p_mode: mode, p_target: target ?? null }))
}

export async function createSubcategory(
  inventoryId: string,
  categoryId: string,
  name: string,
  sortOrder: number,
): Promise<string> {
  const row = must(
    await supabase
      .from('subcategories')
      .insert({ inventory_id: inventoryId, category_id: categoryId, name, sort_order: sortOrder })
      .select('id')
      .single(),
  )
  return (row as { id: string }).id
}

export async function updateSubcategory(
  id: string,
  patch: Partial<Pick<Subcategory, 'name' | 'category_id'>>,
): Promise<void> {
  mustAffect(await supabase.from('subcategories').update(patch).eq('id', id).select('id'))
}

export async function deleteSubcategory(id: string): Promise<void> {
  mustAffect(await supabase.from('subcategories').delete().eq('id', id).select('id'))
}

export async function createUnit(inventoryId: string, name: string): Promise<void> {
  mustOk(await supabase.from('custom_units').insert({ inventory_id: inventoryId, name }))
}

export async function deleteUnit(id: string): Promise<void> {
  mustAffect(await supabase.from('custom_units').delete().eq('id', id).select('id'))
}
