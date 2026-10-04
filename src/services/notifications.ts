import { DEFAULT_PREFS } from '../lib/constants'
import { supabase } from '../lib/supabase'
import type { AppNotification, NotificationPrefs, PendingAlert } from '../types/database'
import { must, mustOk } from './helpers'

export async function fetchNotifications(inventoryId: string, userId: string): Promise<AppNotification[]> {
  const rows = must(
    await supabase
      .from('notifications')
      .select('*')
      .eq('inventory_id', inventoryId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200),
  )
  return rows as AppNotification[]
}

export async function markNotificationRead(id: string): Promise<void> {
  mustOk(await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id))
}

export async function markAllNotificationsRead(inventoryId: string): Promise<void> {
  mustOk(await supabase.rpc('mark_all_notifications_read', { p_inventory: inventoryId }))
}

export async function deleteNotification(id: string): Promise<void> {
  mustOk(await supabase.from('notifications').delete().eq('id', id))
}

export async function fetchPendingAlerts(inventoryId: string): Promise<PendingAlert[]> {
  const rows = must(
    await supabase
      .from('stock_alerts')
      .select('id, inventory_id, product_id, kind, level, scheduled_at, created_at, product:products(name, unit, quantity, min_stock)')
      .eq('inventory_id', inventoryId)
      .eq('status', 'pending')
      .order('created_at'),
  )
  return rows as unknown as PendingAlert[]
}

export async function fetchPrefs(inventoryId: string, userId: string): Promise<NotificationPrefs> {
  const row = must(
    await supabase
      .from('notification_preferences')
      .select('notifications_enabled, low_stock, out_of_stock, expiry, email_enabled, in_app_enabled, delay_minutes')
      .eq('inventory_id', inventoryId)
      .eq('user_id', userId)
      .maybeSingle(),
  )
  return (row as NotificationPrefs | null) ?? { ...DEFAULT_PREFS }
}

export async function savePrefs(inventoryId: string, userId: string, prefs: NotificationPrefs): Promise<void> {
  mustOk(
    await supabase
      .from('notification_preferences')
      .upsert({ user_id: userId, inventory_id: inventoryId, ...prefs }, { onConflict: 'user_id,inventory_id' }),
  )
}
