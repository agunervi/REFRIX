// Convierte errores de Supabase / red en mensajes claros en español.

interface ErrorLike {
  message?: string
  code?: string
  status?: number
  details?: string
}

const AUTH_MESSAGES: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
  [/email not confirmed/i, 'Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada.'],
  [/user already registered/i, 'Ya existe una cuenta con ese correo.'],
  [/password should be at least/i, 'La contraseña debe tener al menos 8 caracteres.'],
  [/unable to validate email/i, 'El correo no es válido.'],
  [/rate limit|too many requests|over_email_send_rate_limit/i, 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'],
  [/same password/i, 'La nueva contraseña debe ser distinta a la actual.'],
  [/signup.*disabled/i, 'El registro de nuevas cuentas está deshabilitado.'],
]

export function isNetworkError(err: unknown): boolean {
  const e = err as ErrorLike | null
  const msg = (e?.message ?? String(err ?? '')).toLowerCase()
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('fetch failed')
  )
}

export function toUserMessage(err: unknown, fallback = 'Ocurrió un error inesperado. Inténtalo de nuevo.'): string {
  if (!err) return fallback
  if (isNetworkError(err)) return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.'

  const e = (typeof err === 'string' ? { message: err } : err) as ErrorLike
  const message = e.message ?? ''

  for (const [pattern, text] of AUTH_MESSAGES) {
    if (pattern.test(message)) return text
  }

  switch (e.code) {
    case '42501':
      // Los mensajes de nuestras RPC ya vienen en español; si no, uno genérico
      return /[áéíóúñ]|permiso|propietario/i.test(message) ? message : 'No tienes permiso para realizar esta acción.'
    case '23505':
      return /colabora|utilizada|usada/i.test(message)
        ? message
        : 'Ya existe un elemento con ese nombre.'
    case '23503':
      return 'La referencia indicada no existe o pertenece a otro inventario.'
    case '23514':
      return /subcategor/i.test(message) ? message : 'Alguno de los datos no es válido.'
    case '22023':
    case 'P0002':
    case '28000':
      return message || fallback
    case 'PGRST301':
    case 'PGRST303':
      return 'Tu sesión expiró. Vuelve a ingresar.'
    default:
      break
  }

  if (e.status === 401 || e.status === 403) return 'No tienes permiso para realizar esta acción.'

  // Mensajes propios (en español) de las funciones de la base de datos
  if (message && /[áéíóúñ¿¡]|inventario|invitaci|permiso|producto/i.test(message) && message.length < 160) {
    return message
  }
  return fallback
}
