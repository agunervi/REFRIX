import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

// Si faltan las variables se usa un destino ficticio; la app muestra una pantalla
// de configuración en lugar de intentar conectarse.
export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'sin-configurar', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: { params: { eventsPerSecond: 10 } },
})
