import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../utils/cn'

const CONTROL =
  'w-full rounded-xl border border-stone-300 bg-white px-3.5 text-stone-900 placeholder:text-stone-400 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:disabled:bg-neutral-800'

interface FieldProps {
  label: string
  hint?: string
  error?: string | null
  required?: boolean
  children: (id: string) => ReactNode
  className?: string
}

export function Field({ label, hint, error, required, children, className }: FieldProps) {
  const id = useId()
  return (
    <div className={cn('block', className)}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-neutral-300">
        {label}
        {required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}
      </label>
      {children(id)}
      {hint && !error && <p className="mt-1 text-xs text-stone-500 dark:text-neutral-400">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, 'h-12', className)} {...rest} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, 'min-h-24 py-3', className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, 'h-12 appearance-none bg-[length:1.1rem] bg-[right_0.75rem_center] bg-no-repeat pr-10', className)} style={{ backgroundImage: SELECT_ARROW }} {...rest}>
      {children}
    </select>
  )
}

const SELECT_ARROW =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2378716c' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")"
