import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Camera, ImageOff, Plus, Trash2 } from 'lucide-react'
import { useInventoryData } from '../../contexts/InventoryDataContext'
import { useToast } from '../../contexts/ToastContext'
import { COLOR_PALETTE } from '../../lib/constants'
import { toUserMessage } from '../../lib/errors'
import { formatQty } from '../../lib/stock'
import { formatDateTime } from '../../lib/time'
import { removeProductImage, uploadProductImage } from '../../services/images'
import { createProduct, updateProduct } from '../../services/products'
import { createNamed, createSubcategory, createUnit } from '../../services/structure'
import type { Product, ProductInput } from '../../types/database'
import { Button } from '../ui/Button'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Sheet } from '../ui/Sheet'
import { ProductImage } from './ProductImage'
import { parseNumber } from './SetQuantitySheet'

const NEW = '__new__'

export type ProductFormTarget = { mode: 'create'; template?: Partial<Product> } | { mode: 'edit'; product: Product }

interface Props {
  target: ProductFormTarget | null
  onClose: () => void
  onSaved?: (product: Product) => void
  defaultLocationId?: string | null
}

export function ProductFormSheet({ target, onClose, onSaved, defaultLocationId }: Props) {
  const title =
    target?.mode === 'edit' ? (target.product ? 'Producto' : '') : target?.template?.name ? 'Duplicar producto' : 'Nuevo producto'
  return (
    <Sheet open={target !== null} onClose={onClose} title={title} size="lg">
      {target && (
        <Form
          key={target.mode === 'edit' ? target.product.id : 'new'}
          target={target}
          onClose={onClose}
          onSaved={onSaved}
          defaultLocationId={defaultLocationId ?? null}
        />
      )}
    </Sheet>
  )
}

function numText(n: number): string {
  return String(n).replace('.', ',')
}

function Form({
  target,
  onClose,
  onSaved,
  defaultLocationId,
}: {
  target: ProductFormTarget
  onClose: () => void
  onSaved?: (p: Product) => void
  defaultLocationId: string | null
}) {
  const data = useInventoryData()
  const toast = useToast()
  const existing = target.mode === 'edit' ? target.product : null
  const base: Partial<Product> = target.mode === 'edit' ? target.product : (target.template ?? {})
  const readOnly = !data.canWrite

  const [name, setName] = useState(base.name ?? '')
  const [locationId, setLocationId] = useState(base.location_id ?? defaultLocationId ?? '')
  const [categoryId, setCategoryId] = useState(base.category_id ?? '')
  const [subcategoryId, setSubcategoryId] = useState(base.subcategory_id ?? '')
  const [quantity, setQuantity] = useState(base.quantity !== undefined ? numText(base.quantity) : '1')
  const [unit, setUnit] = useState(base.unit ?? 'unidades')
  const [minStock, setMinStock] = useState(base.min_stock !== undefined ? numText(base.min_stock) : '1')
  const [brand, setBrand] = useState(base.brand ?? '')
  const [expiry, setExpiry] = useState(base.expiry_date ?? '')
  const [notes, setNotes] = useState(base.notes ?? '')
  const [imagePath] = useState<string | null>(base.image_path ?? null)
  const [newImage, setNewImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [removeImage, setRemoveImage] = useState(false)

  // Alta rápida de ubicación / categoría / subcategoría / unidad
  const [quickLocation, setQuickLocation] = useState('')
  const [quickCategory, setQuickCategory] = useState('')
  const [quickSub, setQuickSub] = useState('')
  const [quickUnit, setQuickUnit] = useState('')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!newImage) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(newImage)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [newImage])

  const subs = data.subcategories.filter((s) => s.category_id === categoryId)
  const creatingLocation = locationId === NEW
  const creatingCategory = categoryId === NEW
  const creatingSub = subcategoryId === NEW
  const creatingUnit = unit === NEW

  const clearError = (key: string) => setErrors((prev) => ({ ...prev, [key]: '' }))

  const pickFile = (file: File | undefined) => {
    if (!file) return
    if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !file.type.startsWith('image/')) {
      setErrors((p) => ({ ...p, image: 'Elige un archivo de imagen.' }))
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setErrors((p) => ({ ...p, image: 'La imagen pesa más de 15 MB.' }))
      return
    }
    clearError('image')
    setNewImage(file)
    setRemoveImage(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (readOnly) return
    const errs: Record<string, string> = {}
    const qty = parseNumber(quantity)
    const min = parseNumber(minStock)

    if (!name.trim()) errs.name = 'El nombre es obligatorio.'
    if (!locationId) errs.location = 'Elige una ubicación.'
    if (creatingLocation && !quickLocation.trim()) errs.location = 'Escribe el nombre de la nueva ubicación.'
    if (!categoryId) errs.category = 'Elige una categoría.'
    if (creatingCategory && !quickCategory.trim()) errs.category = 'Escribe el nombre de la nueva categoría.'
    if (quantity.trim() === '' || Number.isNaN(qty) || qty < 0) errs.quantity = 'Ingresa un número mayor o igual a cero.'
    if (minStock.trim() === '' || Number.isNaN(min) || min < 0) errs.min = 'Ingresa un número mayor o igual a cero.'
    if (creatingSub && !quickSub.trim()) errs.subcategory = 'Escribe el nombre de la subcategoría.'
    if (creatingUnit && !quickUnit.trim()) errs.unit = 'Escribe el nombre de la unidad.'
    if (!creatingUnit && !unit.trim()) errs.unit = 'Elige una unidad.'
    if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) errs.expiry = 'La fecha no es válida.'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setSaving(true)
    setFormError(null)
    const uploadedNow: string[] = []
    try {
      // 1. Estructura nueva (alta rápida). Los nombres de ubicación/categoría usan campos separados
      let locId = locationId
      let catId = categoryId
      let subId = subcategoryId
      let unitName = unit

      if (creatingLocation) {
        locId = await createNamed(
          'locations',
          data.inventory.id,
          { name: quickLocation.trim(), icon: 'package', color: COLOR_PALETTE[0] },
          data.locations.length + 1,
        )
      }
      if (creatingCategory) {
        catId = await createNamed(
          'categories',
          data.inventory.id,
          { name: quickCategory.trim(), icon: 'package', color: COLOR_PALETTE[8] },
          data.categories.length + 1,
        )
        subId = ''
      }
      if (creatingSub) {
        subId = await createSubcategory(data.inventory.id, catId, quickSub.trim(), subs.length + 1)
      }
      if (creatingUnit) {
        unitName = quickUnit.trim()
        if (!data.allUnits.some((u) => u.toLowerCase() === unitName.toLowerCase())) {
          await createUnit(data.inventory.id, unitName)
        }
      }

      // 2. Imagen
      let path: string | null = removeImage ? null : imagePath
      if (newImage) {
        path = await uploadProductImage(data.inventory.id, existing?.id ?? 'nuevo', newImage)
        uploadedNow.push(path)
      }

      const input: ProductInput = {
        name: name.trim(),
        location_id: locId,
        category_id: catId,
        subcategory_id: subId || null,
        quantity: Math.round(qty * 1000) / 1000,
        unit: unitName.trim(),
        min_stock: Math.round(min * 1000) / 1000,
        brand: brand.trim() || null,
        expiry_date: expiry || null,
        notes: notes.trim() || null,
        image_path: path,
      }

      const saved = await data.track(existing ? updateProduct(existing.id, input) : createProduct(data.inventory.id, input))
      data.applyProduct(saved)

      // La imagen anterior ya no se usa
      if (existing?.image_path && existing.image_path !== path) void removeProductImage(existing.image_path)

      // La estructura pudo cambiar (alta rápida): se refresca
      if (creatingLocation || creatingCategory || creatingSub || creatingUnit) void data.reload('structure')

      toast.success(existing ? 'Cambios guardados.' : `"${saved.name}" agregado.`)
      onSaved?.(saved)
      onClose()
    } catch (err) {
      for (const p of uploadedNow) void removeProductImage(p)
      setFormError(toUserMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const shownImage = preview ?? (removeImage ? null : imagePath)

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {readOnly && (
        <p className="rounded-xl bg-stone-100 px-3.5 py-2.5 text-sm text-stone-600 dark:bg-neutral-800 dark:text-neutral-300">
          Tienes acceso de solo lectura en este inventario.
        </p>
      )}

      <fieldset disabled={readOnly || saving} className="space-y-4">
        <Field label="Nombre" required error={errors.name}>
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                clearError('name')
              }}
              placeholder="Leche entera"
              maxLength={120}
              autoComplete="off"
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Field label="Ubicación" required error={errors.location}>
              {(id) => (
                <Select
                  id={id}
                  value={locationId}
                  onChange={(e) => {
                    setLocationId(e.target.value)
                    clearError('location')
                  }}
                >
                  <option value="">Elige una ubicación</option>
                  {data.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                  <option value={NEW}>+ Crear ubicación nueva</option>
                </Select>
              )}
            </Field>
            {creatingLocation && (
              <Input
                aria-label="Nombre de la nueva ubicación"
                className="mt-2"
                value={quickLocation}
                onChange={(e) => setQuickLocation(e.target.value)}
                placeholder="Nombre de la ubicación"
                maxLength={60}
              />
            )}
          </div>

          <div>
            <Field label="Categoría" required error={errors.category}>
              {(id) => (
                <Select
                  id={id}
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value)
                    setSubcategoryId('')
                    clearError('category')
                  }}
                >
                  <option value="">Elige una categoría</option>
                  {data.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value={NEW}>+ Crear categoría nueva</option>
                </Select>
              )}
            </Field>
            {creatingCategory && (
              <Input
                aria-label="Nombre de la nueva categoría"
                className="mt-2"
                value={quickCategory}
                onChange={(e) => setQuickCategory(e.target.value)}
                placeholder="Nombre de la categoría"
                maxLength={60}
              />
            )}
          </div>
        </div>

        {categoryId && categoryId !== NEW && (
          <div>
            <Field label="Subcategoría (opcional)" error={errors.subcategory}>
              {(id) => (
                <Select
                  id={id}
                  value={subcategoryId}
                  onChange={(e) => {
                    setSubcategoryId(e.target.value)
                    clearError('subcategory')
                  }}
                >
                  <option value="">Sin subcategoría</option>
                  {subs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value={NEW}>+ Crear subcategoría nueva</option>
                </Select>
              )}
            </Field>
            {creatingSub && (
              <Input
                aria-label="Nombre de la nueva subcategoría"
                className="mt-2"
                value={quickSub}
                onChange={(e) => setQuickSub(e.target.value)}
                placeholder="Nombre de la subcategoría"
                maxLength={60}
              />
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Cantidad" required error={errors.quantity}>
            {(id) => (
              <Input
                id={id}
                inputMode="decimal"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value)
                  clearError('quantity')
                }}
                onFocus={(e) => e.target.select()}
              />
            )}
          </Field>
          <Field label="Unidad" required error={errors.unit}>
            {(id) => (
              <Select
                id={id}
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value)
                  clearError('unit')
                }}
              >
                {data.allUnits.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
                {!data.allUnits.includes(unit) && unit !== NEW && <option value={unit}>{unit}</option>}
                <option value={NEW}>+ Otra unidad...</option>
              </Select>
            )}
          </Field>
        </div>
        {creatingUnit && (
          <Input
            aria-label="Nombre de la unidad"
            value={quickUnit}
            onChange={(e) => setQuickUnit(e.target.value)}
            placeholder="Por ejemplo: sachets"
            maxLength={30}
          />
        )}

        <Field
          label="Stock mínimo"
          required
          error={errors.min}
          hint="Cuando la cantidad llegue a este valor o menos, el producto pasa a stock bajo y entra a la lista de compras."
        >
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={minStock}
              onChange={(e) => {
                setMinStock(e.target.value)
                clearError('min')
              }}
              onFocus={(e) => e.target.select()}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Marca (opcional)">
            {(id) => <Input id={id} value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={80} autoComplete="off" />}
          </Field>
          <Field label="Fecha de vencimiento (opcional)" error={errors.expiry}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={expiry}
                onChange={(e) => {
                  setExpiry(e.target.value)
                  clearError('expiry')
                }}
              />
            )}
          </Field>
        </div>

        <Field label="Notas (opcional)">
          {(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className="min-h-20" />}
        </Field>

        <div>
          <p className="mb-1.5 text-sm font-medium text-stone-700 dark:text-neutral-300">Imagen (opcional)</p>
          <div className="flex items-center gap-3">
            {shownImage ? (
              preview ? (
                <img src={preview} alt="Vista previa" className="h-20 w-20 rounded-2xl object-cover" />
              ) : (
                <ProductImage path={shownImage} alt={name || 'Producto'} className="h-20 w-20 rounded-2xl" />
              )
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-stone-100 text-stone-400 dark:bg-neutral-800">
                <ImageOff className="h-6 w-6" aria-hidden />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  pickFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <Button variant="secondary" size="sm" icon={shownImage ? <Camera className="h-4 w-4" /> : <Plus className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
                {shownImage ? 'Cambiar' : 'Agregar foto'}
              </Button>
              {shownImage && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={() => {
                    setNewImage(null)
                    setRemoveImage(true)
                  }}
                >
                  Quitar
                </Button>
              )}
            </div>
          </div>
          {errors.image && <p role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{errors.image}</p>}
        </div>
      </fieldset>

      {existing && (
        <p className="text-xs text-stone-500 dark:text-neutral-400">
          Cantidad actual guardada: {formatQty(existing.quantity)} {existing.unit}. Última modificación: {formatDateTime(existing.updated_at)}.
        </p>
      )}

      {formError && (
        <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {formError}
        </p>
      )}

      {!readOnly && (
        <div className="sticky bottom-0 -mx-5 border-t border-stone-100 bg-white px-5 pb-1 pt-3 dark:border-neutral-800 dark:bg-neutral-900">
          <Button type="submit" size="lg" full loading={saving}>
            {existing ? 'Guardar cambios' : 'Agregar producto'}
          </Button>
        </div>
      )}
    </form>
  )
}
