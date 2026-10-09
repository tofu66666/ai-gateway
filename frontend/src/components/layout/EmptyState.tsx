import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  children?: ReactNode
}

export function EmptyState({ icon: Icon, title, children }: EmptyStateProps) {
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
      </CardContent>
    </Card>
  )
}
