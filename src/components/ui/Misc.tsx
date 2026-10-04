import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { COLOR_PALETTE } from '../../lib/constants'
import { getIcon } from '../../lib/icons'
import { cn } from '../../utils/cn'

export function Spinner({ label = 'Cargando', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 py-10 text-stone-500 dark:text-neutral-400', className)}>
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}...</span>
    </div>
  )
}

export function FullScreenSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner label={label} />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode
  title: string
  message?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-stone-300 px-6 py-12 text-center dark:border-neutral-700">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 text-stone-500 dark:bg-neutral-800 dark:text-neutral-400">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-stone-900 dark:text-neutral-100">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-stone-500 dark:text-neutral-400">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', className)}>
      {children}
    </span>
  )
}

/** Ícono Lucide dentro de un círculo con el color elegido por el usuario. */
export function IconBadge({
  icon,
  color,
  size = 'md',
}: {
  icon: string
  color: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const Icon = getIcon(icon)
  const box = size === 'lg' ? 'h-14 w-14 rounded-2xl' : size === 'sm' ? 'h-8 w-8 rounded-lg' : 'h-11 w-11 rounded-xl'
  const glyph = size === 'lg' ? 'h-7 w-7' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center', box)}
      style={{ backgroundColor: `${color}22`, color }}
      aria-hidden
    >
      <Icon className={glyph} />
    </span>
  )
}

export function IconPicker({
  value,
  onChange,
  keys,
  color,
}: {
  value: string
  onChange: (key: string) => void
  keys: string[]
  color: string
}) {
  return (
    <div className="grid grid-cols-6 gap-2 sm:grid-cols-8" role="radiogroup" aria-label="Ícono">
      {keys.map((key) => {
        const Icon = getIcon(key)
        const selected = key === value
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={key}
            onClick={() => onChange(key)}
            className={cn(
              'flex h-11 items-center justify-center rounded-xl border-2 transition',
              selected ? 'bg-white dark:bg-neutral-950' : 'border-transparent bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-neutral-800 dark:text-neutral-300',
            )}
            style={selected ? { borderColor: color, color } : undefined}
          >
            <Icon className="h-5 w-5" />
          </button>
        )
      })}
    </div>
  )
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Color">
      {COLOR_PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === value}
          aria-label={`Color ${c}`}
          onClick={() => onChange(c)}
          className={cn(
            'h-9 w-9 rounded-full ring-offset-2 transition dark:ring-offset-neutral-900',
            c === value ? 'ring-2 ring-stone-900 dark:ring-white' : 'hover:scale-110',
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-stone-200/80 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-neutral-400">{children}</h2>
      {action}
    </div>
  )
}
