import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Field, Input } from '../components/ui/Field'
import { FullScreenSpinner } from '../components/ui/Misc'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { toUserMessage } from '../lib/errors'

/** Destino del enlace de "olvidé mi contraseña": Supabase abre una sesión de recuperación. */
export default function ResetPasswordPage() {
  const { session, loading, updatePassword } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <FullScreenSpinner />

  if (!session) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="max-w-sm text-stone-700 dark:text-neutral-300">
          El enlace para restablecer la contraseña no es válido o ya venció. Pide uno nuevo desde la pantalla de ingreso.
        </p>
        <Link to="/ingresar">
          <Button>Ir a ingresar</Button>
        </Link>
      </div>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (password !== confirm) return setError('Las contraseñas no coinciden.')
    setBusy(true)
    try {
      await updatePassword(password)
      toast.success('Contraseña actualizada.')
      navigate('/', { replace: true })
    } catch (err) {
      setError(toUserMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-10">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            <KeyRound className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="text-lg font-semibold text-stone-900 dark:text-neutral-100">Nueva contraseña</h1>
        </div>
        <Field label="Nueva contraseña" required hint="Mínimo 8 caracteres.">
          {(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />}
        </Field>
        <Field label="Repite la contraseña" required>
          {(id) => <Input id={id} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />}
        </Field>
        {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
        <Button type="submit" size="lg" full loading={busy}>
          Guardar contraseña
        </Button>
      </form>
    </div>
  )
}
