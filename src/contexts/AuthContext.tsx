import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { UserProfile } from '../types/database'
import { must } from '../services/helpers'

interface AuthValue {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  loading: boolean
  recoveryMode: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (name: string, email: string, password: string) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  updateDisplayName: (name: string) => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [recoveryMode, setRecoveryMode] = useState(false)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // No se hacen llamadas a Supabase dentro de este callback (puede bloquear el cliente)
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      if (event === 'SIGNED_OUT') {
        setProfile(null)
        setRecoveryMode(false)
      }
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let active = true
    // El perfil lo crea un trigger al registrarse; se reintenta unos instantes por si tarda
    const load = async (attempt: number) => {
      const { data } = await supabase.from('users').select('id, email, display_name').eq('id', userId).maybeSingle()
      if (!active) return
      if (data) setProfile(data as UserProfile)
      else if (attempt < 4) window.setTimeout(() => void load(attempt + 1), 600)
    }
    void load(0)
    return () => {
      active = false
    }
  }, [userId])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw error
  }, [])

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim() }, emailRedirectTo: window.location.origin },
    })
    if (error) throw error
    // Con confirmación de correo activa, un correo ya registrado devuelve identities vacío
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      throw { message: 'User already registered' }
    }
    return { needsConfirmation: !data.session }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/restablecer`,
    })
    if (error) throw error
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
    setRecoveryMode(false)
  }, [])

  const updateDisplayName = useCallback(
    async (name: string) => {
      if (!userId) return
      const row = must(
        await supabase.from('users').update({ display_name: name.trim() }).eq('id', userId).select('id, email, display_name').single(),
      )
      setProfile(row as UserProfile)
    },
    [userId],
  )

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      recoveryMode,
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
      updateDisplayName,
    }),
    [session, profile, loading, recoveryMode, signIn, signUp, signOut, resetPassword, updatePassword, updateDisplayName],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
