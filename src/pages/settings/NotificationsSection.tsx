import { useEffect, useRef, useState } from 'react'
import { Card, Spinner } from '../../components/ui/Misc'
import { Field, Select } from '../../components/ui/Field'
import { Switch } from '../../components/ui/Switch'
import { useAuth } from '../../contexts/AuthContext'
import { useInventoryData } from '../../contexts/InventoryDataContext'
import { useToast } from '../../contexts/ToastContext'
import { DEFAULT_PREFS, DELAY_OPTIONS } from '../../lib/constants'
import { toUserMessage } from '../../lib/errors'
import { fetchPrefs, savePrefs } from '../../services/notifications'
import type { NotificationPrefs } from '../../types/database'

export function NotificationsSection() {
  const { user } = useAuth()
  const data = useInventoryData()
  const toast = useToast()
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef<NotificationPrefs | null>(null)

  const inventoryId = data.inventory.id
  const userId = user?.id

  useEffect(() => {
    if (!userId) return
    let active = true
    fetchPrefs(inventoryId, userId)
      .then((p) => {
        if (!active) return
        latest.current = p
        setPrefs(p)
      })
      .catch((e) => active && setError(toUserMessage(e)))
    return () => {
      active = false
    }
  }, [inventoryId, userId])

  // Los guardados se encolan: si cambias dos opciones seguidas, siempre gana el último estado completo
  const queue = useRef<Promise<void>>(Promise.resolve())

  const update = (patch: Partial<NotificationPrefs>) => {
    if (!userId || !latest.current) return
    const previous = latest.current
    const next = { ...previous, ...patch }
    latest.current = next
    setPrefs(next)
    queue.current = queue.current.then(async () => {
      try {
        await savePrefs(inventoryId, userId, latest.current ?? next)
      } catch (e) {
        latest.current = previous
        setPrefs(previous)
        toast.error(toUserMessage(e))
      }
    })
  }

  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>
  if (!prefs) return <Spinner />

  const off = !prefs.notifications_enabled
  const hasCustomDelay = !DELAY_OPTIONS.some((o) => o.value === prefs.delay_minutes)

  return (
    <div className="space-y-5">
      <p className="text-sm text-stone-500 dark:text-neutral-400">
        Estas preferencias son tuyas y solo valen para <strong>{data.inventory.name}</strong>. Cada inventario tiene las suyas.
      </p>
      <Card className="divide-y divide-stone-100 px-4 dark:divide-neutral-800">
        <Switch
          label="Recibir notificaciones"
          description="Interruptor general para este inventario."
          checked={prefs.notifications_enabled}
          onChange={(v) => update({ notifications_enabled: v })}
        />
        <Switch label="Stock bajo" description="Cuando un producto llega a su mínimo." checked={prefs.low_stock} disabled={off} onChange={(v) => update({ low_stock: v })} />
        <Switch label="Producto agotado" description="Cuando la cantidad llega a cero." checked={prefs.out_of_stock} disabled={off} onChange={(v) => update({ out_of_stock: v })} />
        <Switch label="Vencimientos" description="Productos vencidos o que vencen en 7 días o menos." checked={prefs.expiry} disabled={off} onChange={(v) => update({ expiry: v })} />
      </Card>

      <Card className="divide-y divide-stone-100 px-4 dark:divide-neutral-800">
        <Switch label="Correo electrónico" description="Un correo por aviso, con enlace directo al inventario." checked={prefs.email_enabled} disabled={off} onChange={(v) => update({ email_enabled: v })} />
        <Switch label="Dentro de la app" description="Notificaciones en la pestaña Alertas." checked={prefs.in_app_enabled} disabled={off} onChange={(v) => update({ in_app_enabled: v })} />
      </Card>

      <Card className="p-4">
        <Field
          label="Tiempo de espera antes de avisar por correo"
          hint="Evita avisos por cambios pasajeros: si el stock se recupera durante la espera, el aviso se cancela."
        >
          {(id) => (
            <Select
              id={id}
              value={String(prefs.delay_minutes)}
              disabled={off || !prefs.email_enabled}
              onChange={(e) => update({ delay_minutes: Number(e.target.value) })}
            >
              {hasCustomDelay && <option value={prefs.delay_minutes}>{prefs.delay_minutes} minutos</option>}
              {DELAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                  {o.value === DEFAULT_PREFS.delay_minutes ? ' (recomendado)' : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <p className="mt-3 text-xs text-stone-500 dark:text-neutral-400">
          El servidor revisa los avisos pendientes cada 5 minutos, así que el correo puede llegar con ese margen de diferencia.
        </p>
      </Card>
    </div>
  )
}
