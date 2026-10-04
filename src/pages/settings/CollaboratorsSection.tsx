import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, Copy, Link2, Mail, Send, Share2, Trash2, UserPlus } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { Field, Input, Select } from '../../components/ui/Field'
import { Badge, Card, SectionTitle } from '../../components/ui/Misc'
import { Segmented } from '../../components/ui/Segmented'
import { Sheet } from '../../components/ui/Sheet'
import { useInventoryData } from '../../contexts/InventoryDataContext'
import { useToast } from '../../contexts/ToastContext'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '../../lib/constants'
import { toUserMessage } from '../../lib/errors'
import { formatDateTime } from '../../lib/time'
import { createLinkInvitation, revokeInvitation, sendEmailInvitation } from '../../services/invitations'
import { fetchPendingInvitations, removeMember, updateMemberRole } from '../../services/members'
import type { InvitationRow, Member, MemberRole } from '../../types/database'
import { IconButton } from './NamedSections'
import { AdminOnlyNotice } from './shared'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DAY_OPTIONS = [
  { value: 1, label: '1 día' },
  { value: 3, label: '3 días' },
  { value: 7, label: '7 días' },
  { value: 14, label: '14 días' },
  { value: 30, label: '30 días' },
]

export function CollaboratorsSection() {
  const data = useInventoryData()
  const toast = useToast()
  const confirm = useConfirm()
  const [invites, setInvites] = useState<InvitationRow[]>([])
  const [inviting, setInviting] = useState(false)

  const loadInvites = useCallback(async () => {
    if (!data.canAdmin) return
    try {
      setInvites(await fetchPendingInvitations(data.inventory.id))
    } catch {
      /* se reintenta al volver a abrir la sección */
    }
  }, [data.canAdmin, data.inventory.id])

  useEffect(() => {
    void loadInvites()
  }, [loadInvites])

  // Un colaborador nuevo puede haber aceptado: se actualiza la lista de pendientes
  useEffect(() => {
    void loadInvites()
  }, [data.members.length, loadInvites])

  const canEditMember = (m: Member): boolean => data.isOwner || (data.role === 'admin' && m.role !== 'admin')

  const changeRole = async (m: Member, role: MemberRole) => {
    try {
      await data.track(updateMemberRole(m.id, role))
      await data.reload('members')
      toast.success('Rol actualizado.')
    } catch (e) {
      toast.error(toUserMessage(e))
      void data.reload('members')
    }
  }

  const remove = async (m: Member) => {
    const name = m.user?.display_name || m.user?.email || 'esta persona'
    const ok = await confirm({
      title: `Quitar a ${name}`,
      message: 'Perderá el acceso a este inventario de inmediato. Sus cambios anteriores siguen en el historial.',
      confirmLabel: 'Quitar acceso',
      danger: true,
    })
    if (!ok) return
    try {
      await data.track(removeMember(m.id))
      await data.reload('members')
      toast.success('Acceso revocado.')
    } catch (e) {
      toast.error(toUserMessage(e))
    }
  }

  const revoke = async (inv: InvitationRow) => {
    const ok = await confirm({
      title: 'Revocar invitación',
      message: 'El enlace dejará de funcionar y nadie podrá usarlo.',
      confirmLabel: 'Revocar',
      danger: true,
    })
    if (!ok) return
    try {
      await revokeInvitation(inv.id)
      await loadInvites()
      toast.success('Invitación revocada.')
    } catch (e) {
      toast.error(toUserMessage(e))
    }
  }

  return (
    <div className="space-y-6">
      {!data.canAdmin && <AdminOnlyNotice />}
      {data.canAdmin && (
        <Button icon={<UserPlus className="h-5 w-5" />} onClick={() => setInviting(true)}>
          Invitar a alguien
        </Button>
      )}

      <section aria-label="Personas con acceso">
        <SectionTitle>Personas con acceso ({data.members.length + 1})</SectionTitle>
        <Card className="divide-y divide-stone-100 dark:divide-neutral-800">
          <PersonRow name={data.inventory.owner_name ?? 'Propietario'} email={null} badge={<Badge className="bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">{ROLE_LABELS.owner}</Badge>} />
          {data.members.map((m) => (
            <PersonRow
              key={m.id}
              name={m.user?.display_name || m.user?.email || 'Usuario'}
              email={m.user?.display_name ? (m.user?.email ?? null) : null}
              badge={
                canEditMember(m) ? (
                  <div className="flex items-center gap-1">
                    <Select
                      aria-label={`Rol de ${m.user?.display_name || m.user?.email}`}
                      value={m.role}
                      onChange={(e) => void changeRole(m, e.target.value as MemberRole)}
                      className="h-10 w-36 text-sm"
                    >
                      {(data.isOwner ? (['admin', 'editor', 'viewer'] as const) : (['editor', 'viewer'] as const)).map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </Select>
                    <IconButton label={`Quitar acceso a ${m.user?.display_name || m.user?.email}`} danger onClick={() => void remove(m)}>
                      <Trash2 className="h-4.5 w-4.5" />
                    </IconButton>
                  </div>
                ) : (
                  <Badge className="bg-stone-100 text-stone-700 dark:bg-neutral-800 dark:text-neutral-300">{ROLE_LABELS[m.role]}</Badge>
                )
              }
            />
          ))}
        </Card>
      </section>

      {data.canAdmin && invites.length > 0 && (
        <section aria-label="Invitaciones pendientes">
          <SectionTitle>Invitaciones pendientes</SectionTitle>
          <Card className="divide-y divide-stone-100 dark:divide-neutral-800">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 px-3.5 py-3">
                {inv.invited_email ? <Mail className="h-5 w-5 shrink-0 text-stone-400" aria-hidden /> : <Link2 className="h-5 w-5 shrink-0 text-stone-400" aria-hidden />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-stone-900 dark:text-neutral-100">{inv.invited_email ?? 'Enlace de invitación'}</p>
                  <p className="text-xs text-stone-500 dark:text-neutral-400">
                    {ROLE_LABELS[inv.role]} · vence {formatDateTime(inv.expires_at).slice(0, 16)}
                  </p>
                </div>
                <IconButton label="Revocar invitación" danger onClick={() => void revoke(inv)}>
                  <Trash2 className="h-4.5 w-4.5" />
                </IconButton>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section aria-label="Qué puede hacer cada rol" className="space-y-2">
        <SectionTitle>Qué puede hacer cada rol</SectionTitle>
        <Card className="divide-y divide-stone-100 text-sm dark:divide-neutral-800">
          <p className="px-4 py-3"><strong>Propietario.</strong> Todo lo anterior, además de invitar, cambiar roles, renombrar, transferir y eliminar el inventario.</p>
          {(['admin', 'editor', 'viewer'] as const).map((r) => (
            <p key={r} className="px-4 py-3"><strong>{ROLE_LABELS[r]}.</strong> {ROLE_DESCRIPTIONS[r]}</p>
          ))}
        </Card>
      </section>

      <InviteSheet
        open={inviting}
        onClose={() => setInviting(false)}
        onCreated={() => void loadInvites()}
      />
    </div>
  )
}

function PersonRow({ name, email, badge }: { name: string; email: string | null; badge: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-200 text-sm font-semibold text-stone-700 dark:bg-neutral-800 dark:text-neutral-200">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-stone-900 dark:text-neutral-100">{name}</p>
        {email && <p className="truncate text-xs text-stone-500 dark:text-neutral-400">{email}</p>}
      </div>
      {badge}
    </div>
  )
}

type Mode = 'email' | 'link'

function InviteSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Invitar a alguien" description="La persona verá el nombre del inventario, quién lo comparte y el rol, y podrá aceptar o rechazar.">
      {open && <InviteForm onClose={onClose} onCreated={onCreated} />}
    </Sheet>
  )
}

function InviteForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const data = useInventoryData()
  const toast = useToast()
  const [mode, setMode] = useState<Mode>('email')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('editor')
  const [days, setDays] = useState(7)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ url: string; note: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const roles: MemberRole[] = data.isOwner ? ['admin', 'editor', 'viewer'] : ['editor', 'viewer']

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (mode === 'email' && !EMAIL_RE.test(email.trim())) return setError('Escribe un correo válido.')
    setBusy(true)
    setError(null)
    try {
      if (mode === 'email') {
        const r = await sendEmailInvitation(data.inventory.id, email.trim(), role, days)
        setResult({
          url: r.url,
          note: r.emailSent
            ? `Enviamos el correo a ${email.trim()}. También puedes compartir este enlace.`
            : (r.message ?? 'No se pudo enviar el correo. Comparte este enlace directamente con la persona.'),
        })
      } else {
        const r = await createLinkInvitation(data.inventory.id, role, days)
        setResult({ url: r.url, note: 'Cualquier persona con una cuenta que abra este enlace podrá aceptar. Solo se muestra ahora: cópialo antes de cerrar.' })
      }
      onCreated()
    } catch (err) {
      setError(toUserMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('No se pudo copiar. Mantén presionado el enlace para copiarlo.')
    }
  }

  const share = async () => {
    if (!result || !navigator.share) return
    try {
      await navigator.share({ title: `Invitación a ${data.inventory.name}`, url: result.url })
    } catch {
      /* el usuario canceló */
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-stone-600 dark:text-neutral-300">{result.note}</p>
        <input
          readOnly
          value={result.url}
          aria-label="Enlace de invitación"
          onFocus={(e) => e.target.select()}
          className="h-12 w-full rounded-xl border border-stone-300 bg-stone-50 px-3.5 text-sm text-stone-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        />
        <div className="flex gap-2">
          <Button full variant="secondary" icon={copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />} onClick={() => void copy()}>
            {copied ? 'Copiado' : 'Copiar enlace'}
          </Button>
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <Button full variant="secondary" icon={<Share2 className="h-5 w-5" />} onClick={() => void share()}>
              Compartir
            </Button>
          )}
        </div>
        <Button full onClick={onClose}>Listo</Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Segmented<Mode>
        label="Cómo invitar"
        value={mode}
        onChange={(m) => { setMode(m); setError(null) }}
        options={[
          { value: 'email', label: <><Mail className="h-4 w-4" aria-hidden /> Por correo</> },
          { value: 'link', label: <><Link2 className="h-4 w-4" aria-hidden /> Con enlace</> },
        ]}
      />
      {mode === 'email' && (
        <Field label="Correo de la persona" required error={error && mode === 'email' ? error : null}>
          {(id) => <Input id={id} type="email" inputMode="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null) }} placeholder="nombre@correo.com" autoComplete="off" />}
        </Field>
      )}
      <Field label="Rol" hint={ROLE_DESCRIPTIONS[role]}>
        {(id) => (
          <Select id={id} value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
            {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </Select>
        )}
      </Field>
      <Field label="La invitación vence en">
        {(id) => (
          <Select id={id} value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
            {DAY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        )}
      </Field>
      {error && mode === 'link' && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <Button type="submit" size="lg" full loading={busy} icon={mode === 'email' ? <Send className="h-5 w-5" /> : <Link2 className="h-5 w-5" />}>
        {mode === 'email' ? 'Enviar invitación' : 'Crear enlace'}
      </Button>
    </form>
  )
}
