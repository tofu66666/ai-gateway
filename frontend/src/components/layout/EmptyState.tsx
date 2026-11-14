import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  children?: ReactNode
  // The next step, such as a button.
  action?: ReactNode
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: EmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <Icon className="size-8 text-muted-foreground" />
        <p className="font-medium">{title}</p>
        {children && (
          <div className="max-w-md text-sm text-muted-foreground">
            {children}
          </div>
        )}
        {action && (
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {action}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
