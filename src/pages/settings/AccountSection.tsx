import { useState, type FormEvent } from 'react'
import { LogOut } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Field'
import { Card } from '../../components/ui/Misc'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { toUserMessage } from '../../lib/errors'

export function AccountSection() {
  const { profile, user, updateDisplayName, updatePassword, signOut } = useAuth()
  const toast = useToast()

  const [name, setName] = useState(profile?.display_name ?? '')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [savingPass, setSavingPass] = useState(false)
  const [passError, setPassError] = useState<string | null>(null)

  const saveName = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setNameError('El nombre no puede quedar vacío.')
    setSavingName(true)
    try {
      await updateDisplayName(name)
      toast.success('Nombre actualizado.')
      setNameError(null)
    } catch (err) {
      setNameError(toUserMessage(err))
    } finally {
      setSavingName(false)
    }
  }

  const savePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return setPassError('La contraseña debe tener al menos 8 caracteres.')
    if (password !== confirm) return setPassError('Las contraseñas no coinciden.')
    setSavingPass(true)
    try {
      await updatePassword(password)
      toast.success('Contraseña actualizada.')
      setPassword('')
      setConfirm('')
      setPassError(null)
    } catch (err) {
      setPassError(toUserMessage(err))
    } finally {
      setSavingPass(false)
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <form onSubmit={saveName} className="space-y-4" noValidate>
          <Field label="Correo">{(id) => <Input id={id} value={user?.email ?? ''} disabled readOnly />}</Field>
          <Field label="Nombre" error={nameError}>
            {(id) => <Input id={id} value={name} onChange={(e) => { setName(e.target.value); setNameError(null) }} maxLength={80} autoComplete="name" />}
          </Field>
          <Button type="submit" loading={savingName} disabled={name.trim() === (profile?.display_name ?? '')}>
            Guardar nombre
          </Button>
        </form>
      </Card>

      <Card className="p-4">
        <form onSubmit={savePassword} className="space-y-4" noValidate>
          <h3 className="font-semibold text-stone-900 dark:text-neutral-100">Cambiar contraseña</h3>
          <Field label="Nueva contraseña" hint="Mínimo 8 caracteres.">
            {(id) => <Input id={id} type="password" value={password} onChange={(e) => { setPassword(e.target.value); setPassError(null) }} autoComplete="new-password" />}
          </Field>
          <Field label="Repite la contraseña" error={passError}>
            {(id) => <Input id={id} type="password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setPassError(null) }} autoComplete="new-password" />}
          </Field>
          <Button type="submit" loading={savingPass} disabled={!password}>
            Cambiar contraseña
          </Button>
        </form>
      </Card>

      <Button variant="secondary" full icon={<LogOut className="h-5 w-5" />} onClick={() => void signOut()}>
        Cerrar sesión
      </Button>
    </div>
  )
}
