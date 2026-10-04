import { createClient } from '@supabase/supabase-js'
import { appBaseUrl, env, supabaseAnonKey, supabaseUrl } from '../lib/env.mts'
import { buildInvitationEmail, sendEmail } from '../lib/email.mts'

// POST /.netlify/functions/send-invitation
// Cuerpo: { inventoryId, email, role, days }
// Autenticación: Authorization: Bearer <access_token de Supabase del usuario que invita>
// La invitación se crea con ese mismo usuario, así que las reglas (solo propietario/admin) las aplica la base de datos.

const ROLE_LABELS: Record<string, string> = { admin: 'Administrador', editor: 'Editor', viewer: 'Solo lectura' }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function statusFor(code: string | undefined): number {
  if (code === '28000') return 401
  if (code === '42501') return 403
  return 400
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido.' })

  const url = supabaseUrl()
  const anon = supabaseAnonKey()
  if (!url || !anon) return json(500, { error: 'El servidor no tiene configurado Supabase.' })

  const auth = req.headers.get('authorization') ?? ''
  const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!jwt) return json(401, { error: 'Tu sesión expiró. Vuelve a ingresar.' })

  let body: { inventoryId?: unknown; email?: unknown; role?: unknown; days?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return json(400, { error: 'Solicitud inválida.' })
  }

  const inventoryId = typeof body.inventoryId === 'string' ? body.inventoryId : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = typeof body.role === 'string' ? body.role : ''
  const days = typeof body.days === 'number' ? Math.trunc(body.days) : 7

  if (!UUID_RE.test(inventoryId)) return json(400, { error: 'Inventario inválido.' })
  if (!EMAIL_RE.test(email) || email.length > 254) return json(400, { error: 'Escribe un correo válido.' })
  if (!['admin', 'editor', 'viewer'].includes(role)) return json(400, { error: 'Rol inválido.' })

  // Cliente que actúa COMO el usuario (respeta RLS y auth.uid())
  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser(jwt)
  if (userError || !userData.user) return json(401, { error: 'Tu sesión expiró. Vuelve a ingresar.' })

  const { data: created, error: rpcError } = await supabase.rpc('create_invitation', {
    p_inventory: inventoryId,
    p_role: role,
    p_email: email,
    p_days: days,
  })
  if (rpcError) return json(statusFor(rpcError.code), { error: rpcError.message })
  const row = (created as Array<{ token: string; expires_at: string }> | null)?.[0]
  if (!row) return json(500, { error: 'No se pudo crear la invitación.' })

  // Datos para el correo
  const [{ data: inv }, { data: me }] = await Promise.all([
    supabase.from('inventory_overview').select('name').eq('id', inventoryId).maybeSingle(),
    supabase.from('users').select('display_name').eq('id', userData.user.id).maybeSingle(),
  ])
  const inventoryName = (inv as { name?: string } | null)?.name ?? 'un inventario'
  const inviterName = (me as { display_name?: string } | null)?.display_name || userData.user.email || 'Alguien'

  const base = appBaseUrl(new URL(req.url).origin)
  const inviteUrl = `${base}/invitacion/${row.token}`

  if (!env('RESEND_API_KEY')) {
    return json(200, {
      token: row.token,
      emailSent: false,
      message: 'El envío de correos no está configurado en el servidor. Comparte el enlace de invitación directamente.',
    })
  }

  const expires = new Intl.DateTimeFormat('es-CL', { dateStyle: 'long', timeZone: 'America/Santiago' }).format(new Date(row.expires_at))
  const mail = buildInvitationEmail({
    inventoryName,
    inviterName,
    roleLabel: ROLE_LABELS[role] ?? role,
    expiresAtText: expires,
    url: inviteUrl,
  })
  const sent = await sendEmail({ to: email, ...mail })
  if (!sent.ok) console.error('send-invitation: fallo el envío', sent.error)

  return json(200, {
    token: row.token,
    emailSent: sent.ok,
    message: sent.ok ? undefined : 'No se pudo enviar el correo. Comparte el enlace de invitación directamente.',
  })
}
