import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../utils/cn'

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
}

/** Hoja inferior en el celular, diálogo centrado en pantallas grandes. */
export function Sheet({ open, onClose, title, description, children, footer, size = 'md' }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', onKey)

    // Foco inicial en el primer campo; si no hay, en el panel
    const raf = requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
      )
      ;(first ?? panelRef.current)?.focus({ preventScroll: true })
    })

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.({ preventScroll: true })
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      <div className="animate-fade-in absolute inset-0 bg-black/45" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'animate-sheet-up relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl outline-none dark:bg-neutral-900 sm:rounded-3xl',
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-stone-900 dark:text-neutral-100">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-stone-500 dark:text-neutral-400">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-2 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-2">{children}</div>
        {footer && (
          <div className="border-t border-stone-100 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 dark:border-neutral-800">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
