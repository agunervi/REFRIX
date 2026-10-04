import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, LogOut, Mail, Package, Sparkles } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Field, Input, Textarea } from '../components/ui/Field'
import { Card, ColorPicker, IconBadge, IconPicker } from '../components/ui/Misc'
import { Switch } from '../components/ui/Switch'
import { useAuth } from '../contexts/AuthContext'
import { useInventories } from '../contexts/InventoryContext'
import { useToast } from '../contexts/ToastContext'
import { COLOR_PALETTE, ROLE_LABELS } from '../lib/constants'
import { toUserMessage } from '../lib/errors'
import { INVENTORY_ICON_KEYS } from '../lib/icons'
import { createInventory, seedExampleData } from '../services/inventories'
import { acceptInvitationById, declineInvitationById, listMyInvitations } from '../services/invitations'
import type { MyInvitation } from '../types/database'

/** Primera vez: no hay ningún inventario. Se crea el primero (vacío o con estructura de ejemplo). */
export default function OnboardingPage() {
  const { user, profile, signOut } = useAuth()
  const { refresh, select } = useInventories()
  const toast = useToast()

  const [name, setName] = useState('Casa')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('home')
  const [color, setColor] = useState<string>(COLOR_PALETTE[0])
  const [withExample, setWithExample] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invitations, setInvitations] = useState<MyInvitation[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const loadInvitations = useCallback(async () => {
    try {
      setInvitations(await listMyInvitations())
    } catch {
      /* sin conexión */
    }
  }, [])

  useEffect(() => {
    void loadInvitations()
  }, [loadInvitations])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (!name.trim()) return setError('Ponle un nombre a tu inventario.')
    setSaving(true)
    setError(null)
    try {
      const id = await createInventory({ name: name.trim(), description: description.trim() || null, icon, color }, user.id)
      if (withExample) await seedExampleData(id)
      await refresh()
      select(id)
    } catch (err) {
      setError(toUserMessage(err))
      setSaving(false)
    }
  }

  const respond = async (inv: MyInvitation, accept: boolean) => {
    setBusy(inv.id)
    try {
      if (accept) {
        const id = await acceptInvitationById(inv.id)
        await refresh()
        select(id)
        toast.success(`Ahora tienes acceso a "${inv.inventory_name}".`)
      } else {
        await declineInvitationById(inv.id)
        await loadInvitations()
      }
    } catch (err) {
      toast.error(toUserMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const first = (profile?.display_name ?? '').split(' ')[0]

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-10 pt-[calc(2rem+env(safe-area-inset-top))]">
      <div className="mb-6 flex items-center justify-between">
        <span className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Package className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-lg font-bold text-stone-900 dark:text-neutral-50">Inventario</span>
        </span>
        <Button variant="ghost" size="sm" icon={<LogOut className="h-4 w-4" />} onClick={() => void signOut()}>
          Salir
        </Button>
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-neutral-50">
        {first ? `Bienvenido, ${first}` : 'Bienvenido'}
      </h1>
      <p className="mt-1 text-stone-600 dark:text-neutral-300">
        Creemos tu primer inventario. Después defines tus ubicaciones, categorías y productos a tu manera.
      </p>

      {invitations.length > 0 && (
        <section className="mt-6 space-y-3" aria-label="Invitaciones pendientes">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-neutral-400">Te invitaron a un inventario</h2>
          {invitations.map((i) => (
            <Card key={i.id} className="p-4">
              <div className="flex items-start gap-3">
                <IconBadge icon={i.inventory_icon} color={i.inventory_color} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-stone-900 dark:text-neutral-100">{i.inventory_name}</p>
                  <p className="text-sm text-stone-500 dark:text-neutral-400">
                    <Mail className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
                    {i.owner_name} te invita como {ROLE_LABELS[i.role].toLowerCase()}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" full disabled={busy === i.id} onClick={() => void respond(i, false)}>Rechazar</Button>
                <Button size="sm" full loading={busy === i.id} icon={<Check className="h-4 w-4" />} onClick={() => void respond(i, true)}>Aceptar</Button>
              </div>
            </Card>
          ))}
          <p className="text-center text-sm text-stone-500 dark:text-neutral-400">o crea uno propio:</p>
        </section>
      )}

      <form onSubmit={create} className="mt-6 space-y-5" noValidate>
        <Card className="space-y-5 p-4">
          <div className="flex items-center gap-3">
            <IconBadge icon={icon} color={color} size="lg" />
            <div className="min-w-0 flex-1">
              <Field label="Nombre del inventario" required error={error}>
                {(id) => <Input id={id} value={name} onChange={(e) => { setName(e.target.value); setError(null) }} maxLength={80} autoComplete="off" />}
              </Field>
            </div>
          </div>
          <Field label="Descripción (opcional)">
            {(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} className="min-h-20" placeholder="Inventario general de mi casa." />}
          </Field>
          <div>
            <p className="mb-2 text-sm font-medium text-stone-700 dark:text-neutral-300">Ícono</p>
            <IconPicker value={icon} onChange={setIcon} keys={INVENTORY_ICON_KEYS} color={color} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-stone-700 dark:text-neutral-300">Color</p>
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </Card>

        <Card className="px-4">
          <Switch
            checked={withExample}
            onChange={setWithExample}
            label="Usar estructura de ejemplo"
            description="Ubicaciones, categorías y algunos productos de muestra para ver cómo funciona. Los puedes quitar con un toque en Configuración, Preferencias."
          />
        </Card>

        <Button type="submit" size="lg" full loading={saving} icon={withExample ? <Sparkles className="h-5 w-5" /> : undefined}>
          {withExample ? 'Crear con ejemplo' : 'Empezar desde cero'}
        </Button>
      </form>
    </div>
  )
}
