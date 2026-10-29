import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Bucket, Granularity } from './aggregate'

export type Series = { key: string; label: string; color: string }

const dayMonth = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
})
const monthYear = new Intl.DateTimeFormat('en-AU', {
  month: 'short',
  year: 'numeric',
})
// Axis ticks: $0.025, $2.5, $1.2K, so small steps are not rounded away.
const tickMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumSignificantDigits: 3,
})

// On the axis a bucket shows where it starts; the tooltip gives its range.
function axisLabel(bucket: Bucket, granularity: Granularity) {
  return granularity === 'month'
    ? monthYear.format(bucket.start)
    : dayMonth.format(bucket.start)
}

function rangeLabel(bucket: Bucket, granularity: Granularity) {
  if (granularity !== 'week') return axisLabel(bucket, granularity)
  return dayMonth.formatRange(bucket.start, new Date(bucket.end.getTime() - 1))
}

// The axis top: 1, 2, 2.5 or 5 times a power of ten, at or above the value.
function axisMax(value: number) {
  if (value <= 0) return 1
  const step = 10 ** Math.floor(Math.log10(value))
  return ([1, 2, 2.5, 5, 10].find((f) => f * step >= value) ?? 10) * step
}

// H18IALMOND-27: spend per day, week or month, stacked by group (3.b
// Storyboard 3, frame 2). `other` collects the groups without a colour of
// their own. Each column is a keyboard stop; its tooltip lists every group.
export function SpendChart({
  buckets,
  series,
  other,
  granularity,
}: {
  buckets: Bucket[]
  series: Series[]
  other: Series | null
  granularity: Granularity
}) {
  const max = axisMax(Math.max(...buckets.map((bucket) => bucket.total)))
  const every = Math.ceil(buckets.length / 7)
  const segmentsOf = (bucket: Bucket) => {
    const named = series.map((entry) => ({
      ...entry,
      cost: bucket.costs.get(entry.key) ?? 0,
    }))
    const rest = bucket.total - named.reduce((sum, s) => sum + s.cost, 0)
    const all = other ? [...named, { ...other, cost: rest }] : named
    return all.filter((segment) => segment.cost > 1e-12)
  }

  return (
    <figure className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <figcaption className="text-sm font-medium">
          Spend per {granularity} (USD)
        </figcaption>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {[...series, ...(other ? [other] : [])].map((entry) => (
            <li key={entry.key} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-[2px]"
                style={{ background: entry.color }}
              />
              {entry.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-2">
        <div className="relative h-40 w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
          {[0, max / 2, max].map((tick) => (
            <span
              key={tick}
              className="absolute right-0 translate-y-1/2"
              style={{ bottom: `${(tick / max) * 100}%` }}
            >
              {tickMoney.format(tick)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative flex h-40 items-end border-b border-muted-foreground/40">
            {[0.5, 1].map((at) => (
              <div
                key={at}
                aria-hidden
                className="absolute inset-x-0 border-t border-border"
                style={{ bottom: `${at * 100}%` }}
              />
            ))}
            {buckets.map((bucket) => (
              <Tooltip key={bucket.start.getTime()}>
                <TooltipTrigger asChild>
                  <div
                    role="img"
                    tabIndex={0}
                    aria-label={`${rangeLabel(bucket, granularity)}: ${formatMoney(bucket.total)}`}
                    className="group relative flex h-full flex-1 items-end justify-center rounded-sm outline-none focus-visible:bg-muted"
                  >
                    <div
                      className="flex w-3/5 max-w-6 flex-col-reverse gap-[2px] group-hover:opacity-80"
                      style={{ height: `${(bucket.total / max) * 100}%` }}
                    >
                      {segmentsOf(bucket).map((segment, index, all) => (
                        <div
                          key={segment.key}
                          className={cn(
                            'min-h-px',
                            index === all.length - 1 && 'rounded-t-[4px]',
                          )}
                          // Shares that add up to 1: below 1, flex-grow only
                          // hands out that fraction of the column.
                          style={{
                            flex: `${segment.cost / bucket.total} 1 0`,
                            background: segment.color,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="block space-y-1">
                  <p className="font-medium">
                    {rangeLabel(bucket, granularity)} ·{' '}
                    {formatMoney(bucket.total)}
                  </p>
                  {segmentsOf(bucket)
                    .reverse()
                    .map((segment) => (
                      <p key={segment.key} className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="h-0.5 w-3 rounded-full"
                          style={{ background: segment.color }}
                        />
                        <span className="font-medium tabular-nums">
                          {formatMoney(segment.cost)}
                        </span>
                        <span className="opacity-70">{segment.label}</span>
                      </p>
                    ))}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>

          <div className="flex pt-1 text-xs whitespace-nowrap text-muted-foreground">
            {/* Phones show every other label, so they don't run together. */}
            {buckets.map((bucket, index) => (
              <span
                key={bucket.start.getTime()}
                className={cn(
                  'flex-1 text-center',
                  (index / every) % 2 === 1 && 'max-sm:invisible',
                )}
              >
                {index % every === 0 ? axisLabel(bucket, granularity) : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  )
}
