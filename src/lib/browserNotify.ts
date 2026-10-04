import { BROWSER_NOTIFY_KEY } from './constants'

// Notificaciones del navegador. Importante: son notificaciones LOCALES, se muestran
// mientras la app está abierta (o en segundo plano en el navegador/PWA). Un "push" real con
// la app cerrada requiere un servidor Web Push con claves VAPID; el aviso confiable con la app
// cerrada es el correo.

export function browserNotifySupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function browserNotifyPermission(): NotificationPermission | 'unsupported' {
  return browserNotifySupported() ? Notification.permission : 'unsupported'
}

export function browserNotifyEnabled(): boolean {
  if (!browserNotifySupported()) return false
  try {
    return Notification.permission === 'granted' && localStorage.getItem(BROWSER_NOTIFY_KEY) === '1'
  } catch {
    return false
  }
}

export async function enableBrowserNotify(): Promise<NotificationPermission | 'unsupported'> {
  if (!browserNotifySupported()) return 'unsupported'
  const permission = await Notification.requestPermission()
  try {
    if (permission === 'granted') localStorage.setItem(BROWSER_NOTIFY_KEY, '1')
  } catch {
    /* almacenamiento no disponible */
  }
  return permission
}

export function disableBrowserNotify(): void {
  try {
    localStorage.removeItem(BROWSER_NOTIFY_KEY)
  } catch {
    /* almacenamiento no disponible */
  }
}

export async function showBrowserNotification(opts: {
  title: string
  body: string
  url: string
  tag?: string
}): Promise<void> {
  if (!browserNotifyEnabled()) return
  const options: NotificationOptions = {
    body: opts.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: opts.tag,
    data: { url: opts.url },
  }
  try {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (registration) {
      await registration.showNotification(opts.title, options)
    } else {
      new Notification(opts.title, options)
    }
  } catch {
    /* algunos navegadores móviles no permiten new Notification(); se ignora */
  }
}
