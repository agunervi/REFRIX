/* Service worker del inventario.
 * Objetivo: que la app sea instalable y que su "cascarón" abra sin internet.
 * NO guarda datos de Supabase ni de las funciones: los datos siempre vienen de la red,
 * y si no hay conexión la app lo indica ("Sin conexión") en vez de mostrar datos viejos como si fueran actuales. */
const VERSION = 'v1'
const ASSETS = `assets-${VERSION}`
const SHELL = `shell-${VERSION}`
const SHELL_KEY = '/index.html'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== ASSETS && k !== SHELL).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Solo mismo origen: Supabase (otro dominio) y las funciones de Netlify pasan directo a la red
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/.netlify/')) return

  // Navegación: red primero; si falla, el cascarón guardado
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          if (res.ok && res.headers.get('content-type')?.includes('text/html')) {
            const cache = await caches.open(SHELL)
            cache.put(SHELL_KEY, res.clone())
          }
          return res
        } catch {
          const cached = await caches.match(SHELL_KEY)
          return (
            cached ??
            new Response('Sin conexión. Abre la app cuando vuelva internet.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          )
        }
      })(),
    )
    return
  }

  // Archivos con hash (inmutables): caché primero
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req)
        if (cached) return cached
        const res = await fetch(req)
        if (res.ok) (await caches.open(ASSETS)).put(req, res.clone())
        return res
      })(),
    )
    return
  }

  // Íconos y manifiesto: usar lo guardado y refrescar en segundo plano
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest' || url.pathname === '/favicon.svg') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSETS)
        const cached = await cache.match(req)
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone())
            return res
          })
          .catch(() => cached)
        return cached ?? network
      })(),
    )
  }
})

// Al tocar una notificación se abre (o se enfoca) la app en la pantalla indicada
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of windows) {
        if ('focus' in w) {
          await w.focus()
          if ('navigate' in w) await w.navigate(target).catch(() => undefined)
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
