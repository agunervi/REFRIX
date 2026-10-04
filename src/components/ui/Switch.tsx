import { cn } from '../../utils/cn'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}

export function Switch({ checked, onChange, label, description, disabled }: SwitchProps) {
  return (
    <label className={cn('flex items-center justify-between gap-4 py-3', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <span className="min-w-0">
        <span className="block text-base font-medium text-stone-900 dark:text-neutral-100">{label}</span>
        {description && <span className="block text-sm text-stone-500 dark:text-neutral-400">{description}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-600',
          checked ? 'bg-emerald-600' : 'bg-stone-300 dark:bg-neutral-700',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all',
            checked ? 'left-[1.4rem]' : 'left-0.5',
          )}
        />
      </span>
    </label>
  )
}
