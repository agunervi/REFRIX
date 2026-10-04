import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { Sheet } from './Sheet'

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = (value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOptions(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Sheet
        open={options !== null}
        onClose={() => close(false)}
        title={options?.title ?? ''}
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" full onClick={() => close(false)}>
              {options?.cancelLabel ?? 'Cancelar'}
            </Button>
            <Button variant={options?.danger ? 'danger' : 'primary'} full onClick={() => close(true)}>
              {options?.confirmLabel ?? 'Confirmar'}
            </Button>
          </div>
        }
      >
        {options?.message && <p className="text-sm text-stone-600 dark:text-neutral-300">{options.message}</p>}
      </Sheet>
    </ConfirmContext.Provider>
  )
}

/** Confirmación antes de acciones destructivas: `if (await confirm({...})) ...` */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm debe usarse dentro de ConfirmProvider')
  return ctx
}
