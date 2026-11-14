import { Skeleton } from '@/components/ui/skeleton'
import { TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

// Grey bars in the shape of what is loading, in place of "Loading..." text.
export function SkeletonLines({
  rows = 3,
  className,
}: {
  rows?: number
  className?: string
}) {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={cn('h-5 w-full', className)} />
      ))}
    </div>
  )
}

// The same for a table: rows of grey cells under the real header.
export function SkeletonRows({
  columns,
  rows = 5,
}: {
  columns: number
  rows?: number
}) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <TableRow key={row} className="hover:bg-transparent">
          {Array.from({ length: columns }, (_, column) => (
            <TableCell key={column}>
              {row === 0 && column === 0 && (
                <span role="status" className="sr-only">
                  Loading
                </span>
              )}
              <Skeleton className="h-4 w-full min-w-8" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}
