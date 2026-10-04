import { useState, type FormEvent } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useInventories } from '../../contexts/InventoryContext'
import { useToast } from '../../contexts/ToastContext'
import { COLOR_PALETTE } from '../../lib/constants'
import { toUserMessage } from '../../lib/errors'
import { INVENTORY_ICON_KEYS } from '../../lib/icons'
import { createInventory, seedExampleData } from '../../services/inventories'
import { Button } from '../ui/Button'
import { Field, Input, Textarea } from '../ui/Field'
import { ColorPicker, IconBadge, IconPicker } from '../ui/Misc'
import { Sheet } from '../ui/Sheet'
import { Switch } from '../ui/Switch'

export function CreateInventorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const { refresh, select } = useInventories()
  const toast = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('home')
  const [color, setColor] = useState<string>(COLOR_PALETTE[0])
  const [withExample, setWithExample] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (!name.trim()) {
      setError('Ponle un nombre al inventario.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const id = await createInventory(
        { name: name.trim(), description: description.trim() || null, icon, color },
        user.id,
      )
      if (withExample) await seedExampleData(id)
      await refresh()
      select(id)
      toast.success(`Inventario "${name.trim()}" creado.`)
      setName('')
      setDescription('')
      setWithExample(false)
      onClose()
    } catch (err) {
      setError(toUserMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Crear inventario"
      description="Cada inventario es independiente: tiene sus propios productos, compras e historial."
      footer={
        <Button type="submit" form="create-inventory" size="lg" full loading={saving}>
          Crear inventario
        </Button>
      }
    >
      <form id="create-inventory" onSubmit={submit} className="space-y-5">
        <div className="flex items-center gap-3">
          <IconBadge icon={icon} color={color} size="lg" />
          <div className="min-w-0 flex-1">
            <Field label="Nombre" required error={error}>
              {(id) => (
                <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Casa" maxLength={80} autoComplete="off" />
              )}
            </Field>
          </div>
        </div>
        <Field label="Descripción (opcional)">
          {(id) => (
            <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Inventario general de mi casa." maxLength={300} className="min-h-20" />
          )}
        </Field>
        <div>
          <p className="mb-2 text-sm font-medium text-stone-700 dark:text-neutral-300">Ícono</p>
          <IconPicker value={icon} onChange={setIcon} keys={INVENTORY_ICON_KEYS} color={color} />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-stone-700 dark:text-neutral-300">Color</p>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <Switch
          checked={withExample}
          onChange={setWithExample}
          label="Usar estructura de ejemplo"
          description="Agrega ubicaciones, categorías y productos de muestra que puedes eliminar por completo después."
        />
      </form>
    </Sheet>
  )
}
