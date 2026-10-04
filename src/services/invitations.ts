import { supabase } from '../lib/supabase'
import type { InvitationPreview, MemberRole, MyInvitation } from '../types/database'
import { must, mustOk } from './helpers'

export function buildInviteUrl(token: string): string {
  return `${window.location.origin}/invitacion/${token}`
}

interface CreatedInvitation {
  id: string
  token: string
  expires_at: string
}

/** Crea un enlace de invitación seguro. El token solo se conoce en este momento. */
export async function createLinkInvitation(
  inventoryId: string,
  role: MemberRole,
  days: number,
): Promise<{ url: string; expiresAt: string }> {
  const rows = must(
    await supabase.rpc('create_invitation', {
      p_inventory: inventoryId,
      p_role: role,
      p_email: null,
      p_days: days,
    }),
  ) as CreatedInvitation[]
  const created = rows[0]
  return { url: buildInviteUrl(created.token), expiresAt: created.expires_at }
}

export interface EmailInvitationResult {
  url: string
  emailSent: boolean
  message?: string
}

/**
 * Invitación por correo: la crea y envía una Netlify Function (la clave de Resend
 * nunca llega al navegador). Devuelve también el enlace por si el correo falla.
 */
export async function sendEmailInvitation(
  inventoryId: string,
  email: string,
  role: MemberRole,
  days: number,
): Promise<EmailInvitationResult> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw { message: 'Tu sesión expiró. Vuelve a ingresar.', code: 'PGRST301' }

  const res = await fetch('/.netlify/functions/send-invitation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ inventoryId, email, role, days, origin: window.location.origin }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    error?: string
    token?: string
    emailSent?: boolean
    message?: string
  }
  if (!res.ok || !body.token) {
    throw { message: body.error ?? 'No se pudo crear la invitación.', code: String(res.status) }
  }
  return { url: buildInviteUrl(body.token), emailSent: Boolean(body.emailSent), message: body.message }
}

export async function getInvitationPreview(token: string): Promise<InvitationPreview | null> {
  const rows = must(await supabase.rpc('get_invitation_preview', { p_token: token })) as InvitationPreview[]
  return rows[0] ?? null
}

export async function acceptInvitation(token: string): Promise<string> {
  return must(await supabase.rpc('accept_invitation', { p_token: token })) as string
}

export async function declineInvitation(token: string): Promise<void> {
  mustOk(await supabase.rpc('decline_invitation', { p_token: token }))
}

export async function listMyInvitations(): Promise<MyInvitation[]> {
  return must(await supabase.rpc('list_my_invitations')) as MyInvitation[]
}

export async function acceptInvitationById(id: string): Promise<string> {
  return must(await supabase.rpc('accept_invitation_by_id', { p_id: id })) as string
}

export async function declineInvitationById(id: string): Promise<void> {
  mustOk(await supabase.rpc('decline_invitation_by_id', { p_id: id }))
}

export async function revokeInvitation(id: string): Promise<void> {
  mustOk(await supabase.rpc('revoke_invitation', { p_id: id }))
}
