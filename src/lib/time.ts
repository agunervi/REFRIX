import { APP_TIME_ZONE } from './constants'

// Desfase entre el reloj del servidor (base de datos) y el reloj local.
// Así "ACTUALIZADO HACE 2 MIN" no depende de que el reloj del teléfono esté bien.
let serverOffsetMs = 0

export function setServerOffset(serverIso: string, sentAt: number, receivedAt: number): void {
  const serverMs = new Date(serverIso).getTime()
  if (Number.isNaN(serverMs)) return
  serverOffsetMs = serverMs - (sentAt + receivedAt) / 2
}

export function serverNow(): number {
  return Date.now() + serverOffsetMs
}

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria de la app, igual que la base de datos. */
export function todayInAppZone(nowMs: number = serverNow()): string {
  return dayFormatter.format(new Date(nowMs))
}

function dayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/** Días desde hoy hasta la fecha (negativo si ya pasó). */
export function daysUntil(dateStr: string, nowMs: number = serverNow()): number {
  return Math.round(dayNumber(dateStr) - dayNumber(todayInAppZone(nowMs)))
}

const pad = (n: number) => String(n).padStart(2, '0')

export function formatClock(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`
}

export function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

function sameLocalDay(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

/** Texto del indicador "ACTUALIZADO ..." a partir de la hora (de la BD) del último cambio. */
export function updatedLabel(iso: string, nowMs: number = serverNow()): string {
  const t = new Date(iso).getTime()
  const diff = Math.max(0, nowMs - t)
  if (diff < 60_000) return 'ACTUALIZADO AHORA'
  if (diff < 3_600_000) return `ACTUALIZADO HACE ${Math.floor(diff / 60_000)} MIN`
  if (sameLocalDay(t, nowMs)) return `ACTUALIZADO HASTA ${formatClock(t)}`
  if (sameLocalDay(t, nowMs - 86_400_000)) return `ACTUALIZADO AYER ${formatClock(t)}`
  const d = new Date(t)
  return `ACTUALIZADO EL ${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${formatClock(t)}`
}

/** "hace 5 min", "hace 2 h", "ayer 15:42", "03/10 15:42". */
export function timeAgo(iso: string, nowMs: number = serverNow()): string {
  const t = new Date(iso).getTime()
  const diff = Math.max(0, nowMs - t)
  if (diff < 60_000) return 'ahora'
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)} min`
  if (sameLocalDay(t, nowMs)) return `hace ${Math.floor(diff / 3_600_000)} h`
  if (sameLocalDay(t, nowMs - 86_400_000)) return `ayer ${formatClock(t)}`
  const d = new Date(t)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${formatClock(t)}`
}

/** Tiempo transcurrido corto para "Sin conexión, última actualización hace 8 min". */
export function sinceLabel(fromMs: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, nowMs - fromMs)
  if (diff < 60_000) return 'hace instantes'
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)} min`
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)} h`
  return `hace ${Math.floor(diff / 86_400_000)} d`
}

export function formatScheduled(iso: string): string {
  const t = new Date(iso).getTime()
  const now = serverNow()
  if (sameLocalDay(t, now)) return `hoy ${formatClock(t)}`
  if (sameLocalDay(t, now + 86_400_000)) return `mañana ${formatClock(t)}`
  const d = new Date(t)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${formatClock(t)}`
}
