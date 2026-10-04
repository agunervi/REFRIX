import { COLOR_PALETTE, COMMON_UNITS } from '../lib/constants'
import { parseCsv, toCsv, unprotectFormula } from '../lib/csv'
import { normalizeText } from '../utils/cn'
import type { Category, Location, Product, ProductInput, Subcategory } from '../types/database'
import { insertProductsBatch } from './products'
import { createNamed, createSubcategory, createUnit, fetchStructure } from './structure'

export const CSV_HEADERS = [
  'Nombre',
  'Ubicación',
  'Categoría',
  'Subcategoría',
  'Cantidad',
  'Unidad',
  'Stock mínimo',
  'Marca',
  'Vencimiento',
  'Notas',
] as const

export const MAX_IMPORT_ROWS = 2000

export function exportProductsCsv(
  products: Product[],
  locations: Location[],
  categories: Category[],
  subcategories: Subcategory[],
): string {
  const loc = new Map(locations.map((l) => [l.id, l.name]))
  const cat = new Map(categories.map((c) => [c.id, c.name]))
  const sub = new Map(subcategories.map((s) => [s.id, s.name]))
  const rows = products.map((p) => [
    p.name,
    loc.get(p.location_id ?? '') ?? '',
    cat.get(p.category_id ?? '') ?? '',
    sub.get(p.subcategory_id ?? '') ?? '',
    String(p.quantity).replace('.', ','),
    p.unit,
    String(p.min_stock).replace('.', ','),
    p.brand ?? '',
    p.expiry_date ?? '',
    p.notes ?? '',
  ])
  return toCsv([[...CSV_HEADERS], ...rows])
}

export function templateCsv(): string {
  return toCsv([
    [...CSV_HEADERS],
    ['Leche entera', 'Cocina', 'Lácteos', '', '6', 'litros', '2', 'Soprole', '2026-12-31', ''],
    ['Papel higiénico', 'Baño', 'Aseo', '', '12', 'rollos', '4', '', '', 'Comprar en pack'],
  ])
}

export interface ImportReport {
  imported: number
  skipped: Array<{ line: number; reason: string }>
  createdLocations: number
  createdCategories: number
}

export interface ParsedRow {
  line: number
  name: string
  location: string
  category: string
  subcategory: string
  quantity: number
  unit: string
  min: number
  brand: string
  expiry: string
  notes: string
}

const ALIASES: Record<string, string[]> = {
  name: ['nombre', 'producto', 'name'],
  location: ['ubicacion', 'lugar', 'location'],
  category: ['categoria', 'category'],
  subcategory: ['subcategoria', 'subcategory'],
  quantity: ['cantidad', 'stock', 'quantity'],
  unit: ['unidad', 'unit'],
  min: ['stock minimo', 'minimo', 'min', 'min stock'],
  brand: ['marca', 'brand'],
  expiry: ['vencimiento', 'fecha de vencimiento', 'expiry', 'caducidad'],
  notes: ['notas', 'nota', 'notes'],
}

function toNumber(value: string): number {
  return Number(value.trim().replace(',', '.'))
}

function toIsoDate(value: string): string | null {
  const v = value.trim()
  if (!v) return ''
  let y: number, m: number, d: number
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v)
  if (match) {
    y = +match[1]
    m = +match[2]
    d = +match[3]
  } else if ((match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v))) {
    d = +match[1]
    m = +match[2]
    y = +match[3]
  } else return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseImport(text: string): { rows: ParsedRow[]; skipped: ImportReport['skipped']; fatal?: string } {
  const table = parseCsv(text)
  if (table.length < 2) return { rows: [], skipped: [], fatal: 'El archivo no tiene filas de productos.' }
  if (table.length - 1 > MAX_IMPORT_ROWS) {
    return { rows: [], skipped: [], fatal: `El archivo tiene más de ${MAX_IMPORT_ROWS} filas. Divídelo en partes.` }
  }

  const header = table[0].map((h) => normalizeText(h))
  const col: Record<string, number> = {}
  for (const [key, names] of Object.entries(ALIASES)) col[key] = header.findIndex((h) => names.includes(h))
  const missing = (['name', 'location', 'category', 'quantity', 'unit', 'min'] as const).filter((k) => col[k] < 0)
  if (missing.length > 0) {
    return {
      rows: [],
      skipped: [],
      fatal: 'Faltan columnas obligatorias. Descarga la plantilla para ver el formato esperado.',
    }
  }

  const get = (row: string[], key: string): string => (col[key] >= 0 ? unprotectFormula((row[col[key]] ?? '').trim()) : '')
  const rows: ParsedRow[] = []
  const skipped: ImportReport['skipped'] = []

  table.slice(1).forEach((raw, i) => {
    const line = i + 2
    const name = get(raw, 'name')
    const quantity = toNumber(get(raw, 'quantity'))
    const min = toNumber(get(raw, 'min'))
    const expiry = toIsoDate(get(raw, 'expiry'))
    const reason =
      !name ? 'Falta el nombre'
      : name.length > 120 ? 'El nombre es demasiado largo'
      : !get(raw, 'location') ? 'Falta la ubicación'
      : !get(raw, 'category') ? 'Falta la categoría'
      : !get(raw, 'unit') ? 'Falta la unidad'
      : Number.isNaN(quantity) || quantity < 0 ? 'Cantidad inválida'
      : Number.isNaN(min) || min < 0 ? 'Stock mínimo inválido'
      : expiry === null ? 'Fecha de vencimiento inválida (usa AAAA-MM-DD o DD/MM/AAAA)'
      : null
    if (reason) {
      skipped.push({ line, reason })
      return
    }
    rows.push({
      line,
      name,
      location: get(raw, 'location'),
      category: get(raw, 'category'),
      subcategory: get(raw, 'subcategory'),
      quantity: Math.round(quantity * 1000) / 1000,
      unit: get(raw, 'unit'),
      min: Math.round(min * 1000) / 1000,
      brand: get(raw, 'brand'),
      expiry: expiry ?? '',
      notes: get(raw, 'notes'),
    })
  })
  return { rows, skipped }
}

/** Importa productos creando las ubicaciones, categorías, subcategorías y unidades que falten. */
export async function importProducts(inventoryId: string, rows: ParsedRow[]): Promise<Omit<ImportReport, 'skipped'>> {
  const structure = await fetchStructure(inventoryId)
  const locIds = new Map(structure.locations.map((l) => [normalizeText(l.name), l.id]))
  const catIds = new Map(structure.categories.map((c) => [normalizeText(c.name), c.id]))
  const subIds = new Map(structure.subcategories.map((s) => [`${s.category_id}|${normalizeText(s.name)}`, s.id]))
  const unitNames = new Set<string>(structure.units.map((u) => normalizeText(u.name)))
  let locOrder = structure.locations.length
  let catOrder = structure.categories.length
  const subOrder = new Map<string, number>()
  let createdLocations = 0
  let createdCategories = 0

  for (const u of COMMON_UNITS) unitNames.add(normalizeText(u))

  const inputs: ProductInput[] = []
  for (const r of rows) {
    const lk = normalizeText(r.location)
    let locationId = locIds.get(lk)
    if (!locationId) {
      locationId = await createNamed(
        'locations',
        inventoryId,
        { name: r.location, icon: 'package', color: COLOR_PALETTE[locOrder % COLOR_PALETTE.length] },
        ++locOrder,
      )
      locIds.set(lk, locationId)
      createdLocations++
    }
    const ck = normalizeText(r.category)
    let categoryId = catIds.get(ck)
    if (!categoryId) {
      categoryId = await createNamed(
        'categories',
        inventoryId,
        { name: r.category, icon: 'package', color: COLOR_PALETTE[(catOrder + 4) % COLOR_PALETTE.length] },
        ++catOrder,
      )
      catIds.set(ck, categoryId)
      createdCategories++
    }
    let subcategoryId: string | null = null
    if (r.subcategory) {
      const sk = `${categoryId}|${normalizeText(r.subcategory)}`
      subcategoryId = subIds.get(sk) ?? null
      if (!subcategoryId) {
        const order = (subOrder.get(categoryId) ?? structure.subcategories.filter((s) => s.category_id === categoryId).length) + 1
        subOrder.set(categoryId, order)
        subcategoryId = await createSubcategory(inventoryId, categoryId, r.subcategory, order)
        subIds.set(sk, subcategoryId)
      }
    }
    const uk = normalizeText(r.unit)
    if (!unitNames.has(uk)) {
      await createUnit(inventoryId, r.unit)
      unitNames.add(uk)
    }
    inputs.push({
      name: r.name,
      location_id: locationId,
      category_id: categoryId,
      subcategory_id: subcategoryId,
      quantity: r.quantity,
      unit: r.unit,
      min_stock: r.min,
      brand: r.brand || null,
      expiry_date: r.expiry || null,
      notes: r.notes || null,
      image_path: null,
    })
  }

  await insertProductsBatch(inventoryId, inputs)
  return { imported: inputs.length, createdLocations, createdCategories }
}
