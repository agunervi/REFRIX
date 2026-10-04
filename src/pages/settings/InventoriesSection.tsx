import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRightLeft, Check, DoorOpen, Plus, Trash2 } from 'lucide-react'
import { CreateInventorySheet } from '../../components/inventory/CreateInventorySheet'
import { Button } from '../../components/ui/Button'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { Field, Input, Select, Textarea } from '../../components/ui/Field'
import { Card, ColorPicker, IconBadge, IconPicker, SectionTitle } from '../../components/ui/Misc'
import { Sheet } from '../../components/ui/Sheet'
import { useAuth } from '../../contexts/AuthContext'
import { useInventories } from '../../contexts/InventoryContext'
import { useInventoryData } from '../../contexts/InventoryDataContext'
import { useToast } from '../../contexts/ToastContext'
import { ROLE_LABELS } from '../../lib/constants'
import { toUserMessage } from '../../lib/errors'
import { INVENTORY_ICON_KEYS } from '../../lib/icons'
import { deleteInventory, transferOwnership, updateInventory } from '../../services/inventories'
import { removeMember } from '../../services/members'
import { AdminOnlyNotice } from './shared'

export function InventoriesSection() {
  const data = useInventoryData()
  const { user } = useAuth()
  const { inventories, selectedId, select, refresh } = useInventories()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const inv = data.inventory

  const leave = async () => {
    const me = data.members.find((m) => m.user_id === user?.id)
    if (!me) return toast.error('No se encontró tu acceso a este inventario.')
    const ok = await confirm({
      title: `Salir de "${inv.name}"`,
      message: 'Dejarás de ver este inventario. Para volver necesitarás una nueva invitación.',
      confirmLabel: 'Salir',
      danger: true,
    })
    if (!ok) return
    try {
      await removeMember(me.id)
      await refresh()
      toast.success('Saliste del inventario.')
      navigate('/')
    } catch (e) {
      toast.error(toUserMessage(e))
    }
  }

  return (
    <div className="space-y-6">
      <section aria-label="Inventario actual" className="space-y-3">
        <SectionTitle>Inventario actual</SectionTitle>
        {data.canAdmin ? <EditCard key={inv.id} /> : (
          <>
            <AdminOnlyNotice />
            <Card className="flex items-center gap-3 p-4">
              <IconBadge icon={inv.icon} color={inv.color} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-stone-900 dark:text-neutral-100">{inv.name}</p>
                <p className="text-sm text-stone-500 dark:text-neutral-400">De {inv.owner_name} · {ROLE_LABELS[inv.my_role]}</p>
                {inv.description && <p className="mt-1 text-sm text-stone-600 dark:text-neutral-300">{inv.description}</p>}
              </div>
            </Card>
          </>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          {data.isOwner ? (
            <>
              <Button variant="secondary" icon={<ArrowRightLeft className="h-5 w-5" />} onClick={() => setTransferring(true)} disabled={data.members.length === 0}>
                Transferir propiedad
              </Button>
              <Button variant="danger" icon={<Trash2 className="h-5 w-5" />} onClick={() => setDeleting(true)}>
                Eliminar inventario
              </Button>
            </>
          ) : (
            <Button variant="secondary" icon={<DoorOpen className="h-5 w-5" />} onClick={() => void leave()}>
              Salir de este inventario
            </Button>
          )}
        </div>
        {data.isOwner && data.members.length === 0 && (
          <p className="text-xs text-stone-500 dark:text-neutral-400">Para transferir la propiedad primero invita a alguien como colaborador.</p>
        )}
      </section>

      <section aria-label="Todos mis inventarios">
        <SectionTitle
          action={
            <Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              Crear
            </Button>
          }
        >
          Todos mis inventarios
        </SectionTitle>
        <Card className="divide-y divide-stone-100 dark:divide-neutral-800">
          {inventories.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => select(i.id)}
              className="flex min-h-16 w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-stone-50 dark:hover:bg-neutral-800/60"
            >
              <IconBadge icon={i.icon} color={i.color} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-stone-900 dark:text-neutral-100">{i.name}</span>
                <span className="block text-xs text-stone-500 dark:text-neutral-400">
                  {i.owner_id === user?.id ? 'Tuyo' : `De ${i.owner_name ?? 'otra persona'}`} · {ROLE_LABELS[i.my_role]}
                </span>
              </span>
              {i.id === selectedId && <Check className="h-5 w-5 text-emerald-600" aria-label="Seleccionado" />}
            </button>
          ))}
        </Card>
      </section>

      <CreateInventorySheet open={creating} onClose={() => setCreating(false)} />
      <TransferSheet open={transferring} onClose={() => setTransferring(false)} />
      <DeleteSheet open={deleting} onClose={() => setDeleting(false)} />
    </div>
  )
}

function EditCard() {
  const data = useInventoryData()
  const { refresh } = useInventories()
  const toast = useToast()
  const inv = data.inventory
  const [name, setName] = useState(inv.name)
  const [description, setDescription] = useState(inv.description ?? '')
  const [icon, setIcon] = useState(inv.icon)
  const [color, setColor] = useState(inv.color)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const dirty = name.trim() !== inv.name || description.trim() !== (inv.description ?? '') || icon !== inv.icon || color !== inv.color

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('El inventario necesita un nombre.')
    setSaving(true)
    try {
      await data.track(updateInventory(inv.id, { name: name.trim(), description: description.trim() || null, icon, color }))
      await refresh()
      toast.success('Inventario actualizado.')
      setError(null)
    } catch (err) {
      setError(toUserMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="flex items-center gap-3">
          <IconBadge icon={icon} color={color} size="lg" />
          <div className="min-w-0 flex-1">
            <Field label="Nombre" required error={error}>
              {(id) => <Input id={id} value={name} onChange={(e) => { setName(e.target.value); setError(null) }} maxLength={80} />}
            </Field>
          </div>
        </div>
        <Field label="Descripción">
          {(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} className="min-h-20" />}
        </Field>
        <div>
          <p className="mb-2 text-sm font-medium text-stone-700 dark:text-neutral-300">Ícono</p>
          <IconPicker value={icon} onChange={setIcon} keys={INVENTORY_ICON_KEYS} color={color} />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-stone-700 dark:text-neutral-300">Color</p>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <Button type="submit" loading={saving} disabled={!dirty}>Guardar cambios</Button>
      </form>
    </Card>
  )
}

function TransferSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Transferir propiedad" description="La otra persona pasa a ser propietaria y tú quedas como administrador.">
      {open && <TransferForm onClose={onClose} />}
    </Sheet>
  )
}

function TransferForm({ onClose }: { onClose: () => void }) {
  const data = useInventoryData()
  const { refresh } = useInventories()
  const toast = useToast()
  const confirm = useConfirm()
  const [target, setTarget] = useState(data.members[0]?.user_id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    const m = data.members.find((x) => x.user_id === target)
    const label = m?.user?.display_name || m?.user?.email || 'esta persona'
    const ok = await confirm({
      title: `Transferir a ${label}`,
      message: 'Esta persona podrá eliminar el inventario y administrar todos los accesos. Solo ella podría devolverte la propiedad.',
      confirmLabel: 'Transferir',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await transferOwnership(data.inventory.id, target)
      await refresh()
      await data.reload('members')
      toast.success('Propiedad transferida.')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Nueva persona propietaria" error={error}>
        {(id) => (
          <Select id={id} value={target} onChange={(e) => setTarget(e.target.value)}>
            {data.members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.user?.display_name || m.user?.email} ({ROLE_LABELS[m.role]})
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Button full variant="danger" loading={busy} disabled={!target} onClick={() => void run()}>
        Transferir propiedad
      </Button>
    </div>
  )
}

function DeleteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Eliminar inventario">
      {open && <DeleteForm onClose={onClose} />}
    </Sheet>
  )
}

function DeleteForm({ onClose }: { onClose: () => void }) {
  const data = useInventoryData()
  const { refresh } = useInventories()
  const toast = useToast()
  const navigate = useNavigate()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = data.inventory.name

  const run = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await deleteInventory(data.inventory.id)
      await refresh()
      toast.success(`"${name}" eliminado.`)
      onClose()
      navigate('/')
    } catch (err) {
      setError(toUserMessage(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={run} className="space-y-4">
      <p className="rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
        Se eliminan para siempre todos sus productos, ubicaciones, categorías, historial, lista de compras y accesos de colaboradores. No se puede deshacer.
      </p>
      <Field label={`Escribe "${name}" para confirmar`} error={error}>
        {(id) => <Input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />}
      </Field>
      <Button type="submit" full variant="danger" loading={busy} disabled={typed.trim() !== name}>
        Eliminar inventario definitivamente
      </Button>
    </form>
  )
}
