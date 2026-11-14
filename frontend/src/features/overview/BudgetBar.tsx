import { cn } from '@/lib/utils'
import type { BudgetState } from './metrics'

const fills: Record<BudgetState, string> = {
  blocked: 'bg-destructive',
  alert: 'bg-warning',
  ok: 'bg-success',
  none: 'bg-muted-foreground/40',
}

// This month's spend against a budget: the fill is the share used (full at
// the limit), the mark the alert threshold. The figures beside it carry the
// values, so the bar is hidden from screen readers.
export function BudgetBar({
  usage,
  threshold,
  state,
  className,
}: {
  usage: number
  threshold: number
  state: BudgetState
  className?: string
}) {
  return (
    <div
      aria-hidden
      title={`Alert at ${Math.round(threshold * 100)}%`}
      className={cn('relative h-1.5 rounded-full bg-muted', className)}
    >
      <div
        className={cn('h-full rounded-full', fills[state])}
        style={{ width: `${Math.min(usage, 1) * 100}%` }}
      />
      <div
        className="absolute -inset-y-0.5 w-0.5 rounded-full bg-foreground/60"
        style={{ left: `${threshold * 100}%` }}
      />
    </div>
  )
}
