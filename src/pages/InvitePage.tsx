import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Clock, ShieldAlert, UserPlus } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { FullScreenSpinner, IconBadge } from '../components/ui/Misc'
import { useInventories } from '../contexts/InventoryContext'
import { useToast } from '../contexts/ToastContext'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '../lib/constants'
import { toUserMessage } from '../lib/errors'
import { acceptInvitation, declineInvitation, getInvitationPreview } from '../services/invitations'
import type { InvitationPreview, InvitationStatus } from '../types/database'

const BLOCKED: Partial<Record<InvitationStatus, { title: string; message: string }>> = {
  accepted: { title: 'Invitación ya utilizada', message: 'Este enlace ya fue usado por otra persona. Pide uno nuevo a quien te invitó.' },
  revoked: { title: 'Invitación cancelada', message: 'Quien te invitó revocó este enlace. Pide uno nuevo.' },
  declined: { title: 'Invitación rechazada', message: 'Esta invitación ya fue rechazada.' },
  expired: { title: 'Invitación vencida', message: 'El enlace expiró. Pide a quien te invitó que cree uno nuevo.' },
  wrong_account: {
    title: 'Esta invitación es para otra cuenta',
    message: 'Fue enviada a un correo distinto al de la cuenta con la que ingresaste. Cierra sesión e ingresa con el correo invitado.',
  },
}

export default function InvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { refresh, select } = useInventories()
  const [preview, setPreview] = useState<InvitationPreview | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)

  useEffect(() => {
    let active = true
    getInvitationPreview(token)
      .then((p) => active && setPreview(p))
      .catch((e) => active && setLoadError(toUserMessage(e)))
    return () => {
      active = false
    }
  }, [token])

  const accept = async () => {
    setBusy('accept')
    try {
      const inventoryId = await acceptInvitation(token)
      await refresh()
      select(inventoryId)
      toast.success('Invitación aceptada. El inventario ya está en tu inicio.')
      navigate('/', { replace: true })
    } catch (e) {
      toast.error(toUserMessage(e))
      setBusy(null)
    }
  }

  const decline = async () => {
    setBusy('decline')
    try {
      await declineInvitation(token)
      toast.info('Invitación rechazada.')
      navigate('/', { replace: true })
    } catch (e) {
      toast.error(toUserMessage(e))
      setBusy(null)
    }
  }

  if (preview === undefined && !loadError) return <FullScreenSpinner label="Revisando la invitación" />

  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-7 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        {children}
      </div>
    </div>
  )

  if (loadError) {
    return shell(
      <>
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-red-500" aria-hidden />
        <p className="text-stone-700 dark:text-neutral-300">{loadError}</p>
        <Link to="/" className="mt-5 block"><Button variant="secondary" full>Ir al inicio</Button></Link>
      </>,
    )
  }

  if (!preview) {
    return shell(
      <>
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-amber-500" aria-hidden />
        <h1 className="text-lg font-semibold text-stone-900 dark:text-neutral-100">Invitación no válida</h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-neutral-400">El enlace está incompleto o no existe. Revisa que lo hayas copiado completo.</p>
        <Link to="/" className="mt-5 block"><Button variant="secondary" full>Ir al inicio</Button></Link>
      </>,
    )
  }

  if (preview.status === 'accepted_by_me') {
    return shell(
      <>
        <h1 className="text-lg font-semibold text-stone-900 dark:text-neutral-100">Ya eres parte de este inventario</h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-neutral-400">Aceptaste esta invitación antes.</p>
        <Button className="mt-5" full onClick={() => { if (preview.inventory_id) select(preview.inventory_id); navigate('/') }}>
          Abrir inventario
        </Button>
      </>,
    )
  }

  const blocked = BLOCKED[preview.status]
  if (blocked) {
    return shell(
      <>
        <Clock className="mx-auto mb-3 h-10 w-10 text-amber-500" aria-hidden />
        <h1 className="text-lg font-semibold text-stone-900 dark:text-neutral-100">{blocked.title}</h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-neutral-400">{blocked.message}</p>
        <Link to="/" className="mt-5 block"><Button variant="secondary" full>Ir al inicio</Button></Link>
      </>,
    )
  }

  const role = preview.role ?? 'viewer'
  return shell(
    <>
      <div className="mb-4 flex justify-center">
        <IconBadge icon={preview.inventory_icon ?? 'home'} color={preview.inventory_color ?? '#10b981'} size="lg" />
      </div>
      <p className="mb-1 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
        <UserPlus className="h-3.5 w-3.5" aria-hidden /> Invitación
      </p>
      <h1 className="text-xl font-bold text-stone-900 dark:text-neutral-50">
        {preview.owner_name} te ha invitado a colaborar en el inventario &quot;{preview.inventory_name}&quot;.
      </h1>
      {preview.inventory_description && (
        <p className="mt-2 text-sm text-stone-600 dark:text-neutral-400">{preview.inventory_description}</p>
      )}
      <dl className="mt-5 space-y-3 rounded-2xl bg-stone-50 p-4 text-left text-sm dark:bg-neutral-950">
        <div className="flex justify-between gap-3">
          <dt className="text-stone-500 dark:text-neutral-400">Propietario</dt>
          <dd className="font-medium text-stone-900 dark:text-neutral-100">{preview.owner_name}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-stone-500 dark:text-neutral-400">Tu rol</dt>
          <dd className="font-medium text-stone-900 dark:text-neutral-100">{ROLE_LABELS[role]}</dd>
        </div>
        <p className="border-t border-stone-200 pt-3 text-xs text-stone-500 dark:border-neutral-800 dark:text-neutral-400">
          {role === 'viewer' || role === 'editor' || role === 'admin' ? ROLE_DESCRIPTIONS[role] : ''}
        </p>
      </dl>
      <div className="mt-6 flex flex-col gap-3">
        <Button size="lg" full loading={busy === 'accept'} disabled={busy !== null} onClick={() => void accept()}>
          Aceptar invitación
        </Button>
        <Button variant="secondary" full loading={busy === 'decline'} disabled={busy !== null} onClick={() => void decline()}>
          Rechazar
        </Button>
      </div>
    </>,
  )
}
