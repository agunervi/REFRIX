// Plantillas de correo y envío con Resend. La clave RESEND_API_KEY solo existe en el servidor.

import { env } from './env.mts'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const fmt = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 })

export function formatQty(n: number): string {
  return fmt.format(n)
}

interface Layout {
  preheader: string
  heading: string
  bodyHtml: string
  buttonLabel: string
  buttonUrl: string
  footer: string
}

function layout(l: Layout): string {
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1917;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(l.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:28px;">
<tr><td>
<p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#059669;">Inventario</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${escapeHtml(l.heading)}</h1>
${l.bodyHtml}
<p style="margin:24px 0 8px;"><a href="${escapeHtml(l.buttonUrl)}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:12px;">${escapeHtml(l.buttonLabel)}</a></p>
<p style="margin:0;font-size:12px;color:#78716c;word-break:break-all;">Si el botón no funciona, copia este enlace en tu navegador:<br>${escapeHtml(l.buttonUrl)}</p>
<hr style="border:none;border-top:1px solid #e7e5e4;margin:24px 0 12px;">
<p style="margin:0;font-size:12px;color:#78716c;">${escapeHtml(l.footer)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

// ---------------------------------------------------------------- invitaciones
export interface InvitationEmail {
  inventoryName: string
  inviterName: string
  roleLabel: string
  expiresAtText: string
  url: string
}

export function buildInvitationEmail(i: InvitationEmail): { subject: string; html: string; text: string } {
  const subject = `${i.inviterName} te invitó al inventario "${i.inventoryName}"`
  const html = layout({
    preheader: `Acepta la invitación como ${i.roleLabel.toLowerCase()}.`,
    heading: 'Te invitaron a un inventario',
    bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;"><strong>${escapeHtml(i.inviterName)}</strong> quiere compartir contigo el inventario <strong>${escapeHtml(i.inventoryName)}</strong>.</p>
<p style="margin:0;font-size:15px;line-height:1.5;">Tu rol sería: <strong>${escapeHtml(i.roleLabel)}</strong>. Podrás aceptar o rechazar la invitación después de ingresar con tu cuenta.</p>`,
    buttonLabel: 'Ver invitación',
    buttonUrl: i.url,
    footer: `La invitación vence el ${i.expiresAtText}. Si no esperabas este correo, puedes ignorarlo: sin tu aceptación no se comparte nada.`,
  })
  const text = `${i.inviterName} te invitó al inventario "${i.inventoryName}" como ${i.roleLabel.toLowerCase()}.\n\nAbre este enlace para aceptar o rechazar: ${i.url}\n\nLa invitación vence el ${i.expiresAtText}. Si no la esperabas, ignora este correo.`
  return { subject, html, text }
}

// --------------------------------------------------------------------- alertas
export interface AlertItem {
  productId: string
  productName: string
  kind: 'stock' | 'expiry'
  level: 'low' | 'out' | 'soon' | 'expired'
  quantity: number
  unit: string
  minStock: number
  expiryDate: string | null
}

const LEVEL_LABEL: Record<AlertItem['level'], string> = {
  out: 'Agotado',
  low: 'Stock bajo',
  soon: 'Por vencer',
  expired: 'Vencido',
}
const LEVEL_COLOR: Record<AlertItem['level'], string> = {
  out: '#dc2626',
  low: '#d97706',
  soon: '#d97706',
  expired: '#dc2626',
}

function itemDetail(a: AlertItem): string {
  if (a.kind === 'expiry' && a.expiryDate) {
    const [y, m, d] = a.expiryDate.split('-')
    return `Vencimiento: ${d}/${m}/${y}`
  }
  if (a.level === 'out') return 'No queda stock.'
  return `Quedan ${formatQty(a.quantity)} ${a.unit} (mínimo ${formatQty(a.minStock)}).`
}

export interface AlertEmailInput {
  userName: string
  inventoryName: string
  inventoryId: string
  items: AlertItem[]
  baseUrl: string
}

const SEVERITY: Record<AlertItem['level'], number> = { out: 0, expired: 1, low: 2, soon: 3 }

interface ProductGroup {
  productId: string
  productName: string
  alerts: AlertItem[]
}

/** Un mismo producto puede tener dos avisos (stock y vencimiento): se agrupan por producto. */
function groupByProduct(items: AlertItem[]): ProductGroup[] {
  const map = new Map<string, ProductGroup>()
  for (const a of items) {
    const g = map.get(a.productId) ?? { productId: a.productId, productName: a.productName, alerts: [] }
    g.alerts.push(a)
    map.set(a.productId, g)
  }
  const groups = [...map.values()]
  for (const g of groups) g.alerts.sort((x, y) => SEVERITY[x.level] - SEVERITY[y.level])
  return groups.sort((x, y) => SEVERITY[x.alerts[0].level] - SEVERITY[y.alerts[0].level] || x.productName.localeCompare(y.productName, 'es'))
}

export function buildAlertEmail(i: AlertEmailInput): { subject: string; html: string; text: string } {
  const groups = groupByProduct(i.items)
  const single = groups.length === 1 ? groups[0] : null
  const main = single ? single.alerts[0] : null
  const subject = single && main
    ? `${LEVEL_LABEL[main.level]}: ${single.productName} (${i.inventoryName})`
    : `${groups.length} productos necesitan atención en ${i.inventoryName}`

  const url = single
    ? `${i.baseUrl}/i/${i.inventoryId}/inventario?p=${single.productId}`
    : `${i.baseUrl}/i/${i.inventoryId}/alertas`

  const rows = groups
    .map(
      (g) => `<tr><td style="padding:10px 0;border-bottom:1px solid #f5f5f4;">
<span style="font-size:15px;font-weight:600;">${escapeHtml(g.productName)}</span><br>
${g.alerts
  .map(
    (a) => `<span style="font-size:13px;color:#57534e;"><span style="font-weight:600;color:${LEVEL_COLOR[a.level]};">${LEVEL_LABEL[a.level]}.</span> ${escapeHtml(itemDetail(a))}</span><br>`,
  )
  .join('')}
</td></tr>`,
    )
    .join('')

  const html = layout({
    preheader: single && main ? `${LEVEL_LABEL[main.level]}: ${single.productName}` : `${groups.length} avisos en ${i.inventoryName}`,
    heading: single && main ? `${LEVEL_LABEL[main.level]}: ${single.productName}` : `Avisos de ${i.inventoryName}`,
    bodyHtml: `<p style="margin:0 0 8px;font-size:15px;line-height:1.5;">Hola ${escapeHtml(i.userName)}, esto requiere tu atención en <strong>${escapeHtml(i.inventoryName)}</strong>:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`,
    buttonLabel: single ? 'Abrir producto' : 'Ver alertas',
    buttonUrl: url,
    footer: 'Recibes este aviso por tus preferencias de notificación de este inventario. Puedes cambiarlas en Configuración, Notificaciones.',
  })

  const text =
    `Hola ${i.userName}, esto requiere tu atención en "${i.inventoryName}":\n\n` +
    groups.map((g) => `- ${g.productName}\n` + g.alerts.map((a) => `    ${LEVEL_LABEL[a.level]}. ${itemDetail(a)}`).join('\n')).join('\n') +
    `\n\nAbrir: ${url}\n\nPuedes cambiar estos avisos en Configuración, Notificaciones.`
  return { subject, html, text }
}

// ---------------------------------------------------------------------- envío
export interface SendResult {
  ok: boolean
  error?: string
}

/** Envía un correo con la API de Resend. `idempotencyKey` evita duplicados si se reintenta. */
export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  text: string
  idempotencyKey?: string
}): Promise<SendResult> {
  const apiKey = env('RESEND_API_KEY')
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY no está configurada.' }
  const from = env('EMAIL_FROM') ?? 'Inventario <onboarding@resend.dev>'

  try {
    const res = await fetch(env('RESEND_API_URL') ?? 'https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text }),
    })
    if (res.ok) return { ok: true }
    const body = await res.text().catch(() => '')
    return { ok: false, error: `Resend respondió ${res.status}: ${body.slice(0, 300)}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
