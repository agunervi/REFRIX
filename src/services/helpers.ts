import type { PostgrestError } from '@supabase/supabase-js'

/** Devuelve los datos o lanza el error de Supabase. */
export function must(res: { data: unknown; error: PostgrestError | null }): unknown {
  if (res.error) throw res.error
  return res.data
}

export function mustOk(res: { error: PostgrestError | null }): void {
  if (res.error) throw res.error
}

/**
 * Con RLS, un UPDATE/DELETE sin permiso no falla: simplemente afecta 0 filas.
 * Esto lo convierte en un error explícito para mostrarlo al usuario.
 */
export function mustAffect(
  res: { data: unknown[] | null; error: PostgrestError | null },
  message = 'No tienes permiso para realizar esta acción.',
): void {
  if (res.error) throw res.error
  if (!res.data || res.data.length === 0) {
    throw { message, code: '42501' } satisfies Pick<PostgrestError, 'message' | 'code'>
  }
}
