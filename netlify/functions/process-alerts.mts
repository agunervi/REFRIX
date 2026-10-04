import { createClient } from '@supabase/supabase-js'
import type { Config } from '@netlify/functions'
import { appBaseUrl, env, supabaseUrl } from '../lib/env.mts'
import { buildAlertEmail, sendEmail, type AlertItem } from '../lib/email.mts'

// Función programada (cada 5 minutos). No depende del navegador de nadie:
//  1. run_maintenance: detecta vencimientos y limpia datos viejos.
//  2. claim_alert_deliveries: reserva de forma atómica los avisos ya vencidos (re-verifica el stock actual).
//  3. Envía un correo por persona e inventario con Resend y registra el resultado.
//  4. finalize_alerts: cierra las alertas ya atendidas.
// Es idempotente: dos ejecuciones simultáneas no envían el mismo aviso dos veces.

interface Claimed {
  alert_id: string
  user_id: string
  user_email: string
  user_name: string
  inventory_id: string
  inventory_name: string
  product_id: string
  product_name: string
  kind: 'stock' | 'expiry'
  level: 'low' | 'out' | 'soon' | 'expired'
  quantity: number | string
  unit: string
  min_stock: number | string
  expiry_date: string | null
}

export default async (): Promise<Response> => {
  const url = supabaseUrl()
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) {
    console.error('process-alerts: faltan SUPABASE_URL (o VITE_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY')
    return new Response('Faltan variables de entorno', { status: 500 })
  }
  if (!env('RESEND_API_KEY')) {
    // No se reservan envíos si no hay forma de enviarlos: así no se gastan los reintentos.
    console.error('process-alerts: falta RESEND_API_KEY; los avisos por correo quedan pendientes')
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const maintenance = await supabase.rpc('run_maintenance')
  if (maintenance.error) console.error('process-alerts: run_maintenance', maintenance.error.message)

  let sent = 0
  let failed = 0

  if (env('RESEND_API_KEY')) {
    const claim = await supabase.rpc('claim_alert_deliveries')
    if (claim.error) {
      console.error('process-alerts: claim_alert_deliveries', claim.error.message)
      return new Response('Error al reservar avisos', { status: 500 })
    }
    const rows = (claim.data ?? []) as Claimed[]

    // Un correo por persona e inventario
    const groups = new Map<string, Claimed[]>()
    for (const r of rows) {
      const key = `${r.user_id}|${r.inventory_id}`
      groups.set(key, [...(groups.get(key) ?? []), r])
    }

    const baseUrl = appBaseUrl()
    for (const group of groups.values()) {
      const first = group[0]
      const items: AlertItem[] = group.map((r) => ({
        productId: r.product_id,
        productName: r.product_name,
        kind: r.kind,
        level: r.level,
        quantity: Number(r.quantity),
        unit: r.unit,
        minStock: Number(r.min_stock),
        expiryDate: r.expiry_date,
      }))
      const mail = buildAlertEmail({
        userName: first.user_name || first.user_email,
        inventoryName: first.inventory_name,
        inventoryId: first.inventory_id,
        items,
        baseUrl,
      })
      const alertIds = group.map((r) => r.alert_id)
      const result = await sendEmail({
        to: first.user_email,
        ...mail,
        idempotencyKey: `alert-${first.user_id}-${[...alertIds].sort().join('-')}`.slice(0, 250),
      })
      const done = await supabase.rpc('complete_alert_deliveries', {
        p_alert_ids: alertIds,
        p_user_id: first.user_id,
        p_ok: result.ok,
        p_error: result.error ?? null,
      })
      if (done.error) console.error('process-alerts: complete_alert_deliveries', done.error.message)
      if (result.ok) sent++
      else {
        failed++
        console.error(`process-alerts: no se pudo enviar a ${first.user_id}:`, result.error)
      }
    }
  }

  const fin = await supabase.rpc('finalize_alerts')
  if (fin.error) console.error('process-alerts: finalize_alerts', fin.error.message)

  console.log(`process-alerts: correos enviados=${sent} fallidos=${failed}`)
  return new Response(JSON.stringify({ sent, failed }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

export const config: Config = {
  schedule: '*/5 * * * *',
}
