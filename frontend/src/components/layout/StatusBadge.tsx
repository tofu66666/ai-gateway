import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import type { Tone } from '@/lib/status'
import { cn } from '@/lib/utils'

const tones: Record<Tone, string> = {
  success: 'bg-green-50 text-green-700 ring-1 ring-green-600/20 ring-inset',
  warning: 'bg-amber-50 text-amber-800 ring-1 ring-amber-600/25 ring-inset',
  error: 'bg-red-50 text-red-700 ring-1 ring-red-600/20 ring-inset',
  neutral: 'bg-muted text-muted-foreground',
}

// A state in words on a tinted pill: green fine, amber refused or limited,
// red failed. The words carry the state, never the colour alone.
export function StatusBadge({
  tone,
  children,
}: {
  tone: Tone
  children: ReactNode
}) {
  return (
    <Badge variant="secondary" className={cn('tabular-nums', tones[tone])}>
      {children}
    </Badge>
  )
}
