// Lectura de variables de entorno de las funciones. Nada de esto llega al navegador.

export function env(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim() !== '' ? value.trim() : undefined
}

export function supabaseUrl(): string | undefined {
  return env('SUPABASE_URL') ?? env('VITE_SUPABASE_URL')
}

export function supabaseAnonKey(): string | undefined {
  return env('SUPABASE_ANON_KEY') ?? env('VITE_SUPABASE_ANON_KEY')
}

/** URL pública de la app para armar los enlaces de los correos. Nunca se toma del cliente. */
export function appBaseUrl(fallbackOrigin?: string): string {
  const raw = env('APP_URL') ?? env('URL') ?? fallbackOrigin ?? 'http://localhost:8888'
  return raw.replace(/\/+$/, '')
}
