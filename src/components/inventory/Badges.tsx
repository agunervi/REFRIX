import { Clock } from 'lucide-react'
import { EXPIRY_META, STATUS_META, expiryOf, expiryText } from '../../lib/stock'
import type { StockStatus } from '../../types/database'
import { cn } from '../../utils/cn'
import { Badge } from '../ui/Misc'

export function StatusBadge({ status, className }: { status: StockStatus; className?: string }) {
  const meta = STATUS_META[status]
  return (
    <Badge className={cn(meta.badge, className)}>
      <span className={cn('h-2 w-2 rounded-full', meta.dot)} aria-hidden />
      {meta.label}
    </Badge>
  )
}

export function ExpiryBadge({ date, className }: { date: string | null; className?: string }) {
  const { status, days } = expiryOf(date)
  if (status === 'none' || days === null || status === 'ok') return null
  return (
    <Badge className={cn(EXPIRY_META[status].badge, className)}>
      <Clock className="h-3 w-3" aria-hidden />
      {expiryText(days)}
    </Badge>
  )
}
