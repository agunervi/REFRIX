import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: ReactNode }>
  label: string
  className?: string
}

export function Segmented<T extends string>({ value, onChange, options, label, className }: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('flex rounded-2xl bg-stone-200/70 p-1 dark:bg-neutral-800', className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium transition',
            value === o.value
              ? 'bg-white text-stone-900 shadow-sm dark:bg-neutral-950 dark:text-neutral-50'
              : 'text-stone-600 hover:text-stone-900 dark:text-neutral-400 dark:hover:text-neutral-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
