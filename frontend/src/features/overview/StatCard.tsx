import { Info } from 'lucide-react'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// One figure on the Overview: a muted label (with an optional explanation),
// the value, and a one-line caption under it.
export function StatCard({
  label,
  hint,
  value,
  detail,
  pending,
}: {
  label: string
  hint?: string
  value: string
  pending: boolean
  detail: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-1">
          {label}
          {hint && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`What ${label} means`}
                  className="rounded-full outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{hint}</TooltipContent>
            </Tooltip>
          )}
        </CardDescription>
        {pending ? (
          <div className="space-y-2 pt-1">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
        ) : (
          <>
            <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
            <p className="text-sm text-muted-foreground">{detail}</p>
          </>
        )}
      </CardHeader>
    </Card>
  )
}
