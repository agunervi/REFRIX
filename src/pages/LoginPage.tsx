import { useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { MailCheck, Package } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Field, Input } from '../components/ui/Field'
import { Segmented } from '../components/ui/Segmented'
import { FullScreenSpinner } from '../components/ui/Misc'
import { useAuth } from '../contexts/AuthContext'
import { NEXT_PATH_KEY } from '../lib/constants'
import { toUserMessage } from '../lib/errors'

type Mode = 'signin' | 'signup' | 'forgot'

/** Ruta a la que volver después de ingresar (solo rutas internas). No la borra: se lee una sola vez. */
function readNextPath(): string {
  try {
    const next = sessionStorage.getItem(NEXT_PATH_KEY)
    if (next && next.startsWith('/') && !next.startsWith('//')) return next
  } catch {
    /* almacenamiento no disponible */
  }
  return '/'
}

function clearNextPath(): void {
  try {
    sessionStorage.removeItem(NEXT_PATH_KEY)
  } catch {
    /* almacenamiento no disponible */
  }
}

export default function LoginPage() {
  const { session, loading, signIn, signUp, resetPassword } = useAuth()
  const navigate = useNavigate()
  // Se lee una vez: al iniciar sesión cambian la sesión y el formulario a la vez, y ambos necesitan la misma ruta
  const nextPath = useRef<string | null>(null)
  if (nextPath.current === null) nextPath.current = readNextPath()
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const changeMode = (next: Mode, keepNotice?: string) => {
    setMode(next)
    setError(null)
    setNotice(keepNotice ?? null)
  }

  if (loading) return <FullScreenSpinner />
  if (session) {
    clearNextPath()
    return <Navigate to={nextPath.current} replace />
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)

    if (!email.trim()) return setError('Ingresa tu correo.')
    if (mode !== 'forgot' && password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (mode === 'signup' && !name.trim()) return setError('Ingresa tu nombre.')

    setBusy(true)
    try {
      if (mode === 'signin') {
        await signIn(email, password)
        navigate(nextPath.current ?? '/', { replace: true })
      } else if (mode === 'signup') {
        const { needsConfirmation } = await signUp(name, email, password)
        if (needsConfirmation) {
          changeMode('signin', 'Te enviamos un correo para confirmar tu cuenta. Ábrelo y luego vuelve a ingresar.')
        } else {
          navigate(nextPath.current ?? '/', { replace: true })
        }
      } else {
        await resetPassword(email)
        setNotice('Si el correo existe, te enviamos un enlace para crear una nueva contraseña.')
      }
    } catch (err) {
      setError(toUserMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-emerald-50 to-stone-50 px-5 py-10 dark:from-neutral-950 dark:to-neutral-950">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/30">
            <Package className="h-8 w-8" aria-hidden />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-neutral-50">Inventario del hogar</h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-neutral-400">
            Qué tienes, cuánto queda y qué necesitas comprar. Con tu familia, en tiempo real.
          </p>
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          {mode !== 'forgot' && (
            <Segmented
              label="Modo"
              value={mode}
              onChange={(m) => changeMode(m)}
              options={[
                { value: 'signin', label: 'Ingresar' },
                { value: 'signup', label: 'Crear cuenta' },
              ]}
              className="mb-5"
            />
          )}
          {mode === 'forgot' && (
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-stone-900 dark:text-neutral-100">Recuperar contraseña</h2>
              <p className="text-sm text-stone-500 dark:text-neutral-400">Te enviaremos un enlace para elegir una nueva.</p>
            </div>
          )}

          {notice && (
            <div role="status" className="mb-4 flex gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
              <MailCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <span>{notice}</span>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4" noValidate>
            {mode === 'signup' && (
              <Field label="Tu nombre" required>
                {(id) => (
                  <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Agustín" maxLength={80} />
                )}
              </Field>
            )}
            <Field label="Correo electrónico" required>
              {(id) => (
                <Input id={id} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="tu@correo.cl" />
              )}
            </Field>
            {mode !== 'forgot' && (
              <Field label="Contraseña" required hint={mode === 'signup' ? 'Mínimo 8 caracteres.' : undefined}>
                {(id) => (
                  <Input
                    id={id}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  />
                )}
              </Field>
            )}

            {error && (
              <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" full loading={busy}>
              {mode === 'signin' ? 'Ingresar' : mode === 'signup' ? 'Crear cuenta' : 'Enviar enlace'}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm">
            {mode === 'signin' && (
              <button type="button" onClick={() => changeMode('forgot')} className="font-medium text-emerald-700 hover:underline dark:text-emerald-300">
                Olvidé mi contraseña
              </button>
            )}
            {mode === 'forgot' && (
              <button type="button" onClick={() => changeMode('signin')} className="font-medium text-emerald-700 hover:underline dark:text-emerald-300">
                Volver a ingresar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
