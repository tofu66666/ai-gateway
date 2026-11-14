import { X } from 'lucide-react'
import { type MouseEvent, type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatMoney, formatShare } from '@/lib/format'
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

// The axis top: 1, 2, 4, 6 or 8 times a power of ten, at or above the value,
// so the middle tick is round too ($0.02, not $0.0125).
function axisMax(value: number) {
  if (value <= 0) return 1
  const step = 10 ** Math.floor(Math.log10(value))
  return ([1, 2, 4, 6, 8, 10].find((f) => f * step >= value) ?? 10) * step
}

// Few columns get wider bars, so they don't look thin and far apart.
function barWidth(columns: number) {
  return columns <= 4 ? 'max-w-14' : columns <= 10 ? 'max-w-9' : 'max-w-6'
}

// The plot's height in pixels (h-40), and the thinnest segment drawn on its
// own: thinner ones would show as a stack of hairlines.
const plotHeight = 160
const thinnest = 3

type Segment = Series & { cost: number }

// H18IALMOND-27: spend per day, week or month, stacked by group (3.b
// Storyboard 3, frame 2). `other` collects the groups without a colour of
// their own. Each column is a keyboard stop; its tooltip lists every group.
// With `nameOf`, a column can be picked to list every group of that period
// under the chart.
export function SpendChart({
  buckets,
  series,
  other,
  granularity,
  nameOf,
  groupLabel,
}: {
  buckets: Bucket[]
  series: Series[]
  other: Series | null
  granularity: Granularity
  nameOf?: (key: string) => string
  // What the groups are, such as "model", for the list's title.
  groupLabel?: string
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const max = axisMax(Math.max(...buckets.map((bucket) => bucket.total)))
  const every = Math.ceil(buckets.length / 7)
  const segmentsOf = (bucket: Bucket): Segment[] => {
    const named = series.map((entry) => ({
      ...entry,
      cost: bucket.costs.get(entry.key) ?? 0,
    }))
    const rest = bucket.total - named.reduce((sum, s) => sum + s.cost, 0)
    const all = other ? [...named, { ...other, cost: rest }] : named
    return all.filter((segment) => segment.cost > 1e-12)
  }
  // What a column draws: the largest group always in its colour; groups too
  // thin to see on their own share one grey cap. The tooltip and the list
  // still name every group.
  const drawnOf = (bucket: Bucket): Segment[] => {
    const all = segmentsOf(bucket)
    const height = (bucket.total / max) * plotHeight
    const largest = Math.max(...all.map((segment) => segment.cost))
    const kept = all.filter(
      (segment) =>
        segment.cost === largest ||
        (segment.cost / bucket.total) * height >= thinnest,
    )
    const thin = all.filter((segment) => !kept.includes(segment))
    if (thin.length === 0) return kept
    return [
      ...kept,
      {
        key: 'thin',
        label: 'Smaller groups',
        color: 'var(--chart-other)',
        cost: thin.reduce((sum, segment) => sum + segment.cost, 0),
      },
    ]
  }
  const pickedBucket = buckets.find(
    (bucket) => bucket.start.getTime() === picked,
  )
  // One series, as on the Overview (H18IALMOND-26), needs no legend: the
  // caption names it.
  const legend = [...series, ...(other ? [other] : [])]

  return (
    <figure className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <figcaption className="text-sm font-medium">
          Spend per {granularity} (USD)
        </figcaption>
        <ul
          className={cn(
            'flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground',
            legend.length < 2 && 'hidden',
          )}
        >
          {legend.map((entry) => (
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
                  <Column
                    label={`${rangeLabel(bucket, granularity)}: ${formatMoney(bucket.total)}`}
                    pressed={
                      nameOf ? bucket.start.getTime() === picked : undefined
                    }
                    onPick={
                      nameOf && bucket.total > 0
                        ? () =>
                            setPicked((current) =>
                              current === bucket.start.getTime()
                                ? null
                                : bucket.start.getTime(),
                            )
                        : undefined
                    }
                  >
                    <div
                      className={cn(
                        'flex w-3/5 flex-col-reverse gap-[2px] group-hover:opacity-80',
                        barWidth(buckets.length),
                      )}
                      style={{ height: `${(bucket.total / max) * 100}%` }}
                    >
                      {drawnOf(bucket).map((segment, index, all) => (
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
                  </Column>
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

      {nameOf && !pickedBucket && (
        <p className="text-xs text-muted-foreground">
          Select a column to list every {groupLabel ?? 'group'} in it.
        </p>
      )}
      {nameOf && pickedBucket && (
        <PeriodGroups
          title={`${rangeLabel(pickedBucket, granularity)} by ${groupLabel ?? 'group'}`}
          total={pickedBucket.total}
          groups={[...pickedBucket.costs]
            .filter(([, cost]) => cost > 1e-12)
            .map(([key, cost]) => ({
              key,
              label: nameOf(key),
              cost,
              color:
                series.find((entry) => entry.key === key)?.color ??
                'var(--chart-other)',
            }))
            .sort((a, b) => b.cost - a.cost)}
          onClose={() => setPicked(null)}
        />
      )}
    </figure>
  )
}

// A column: a button when it can be picked, otherwise a labelled image. Both
// are keyboard stops for the tooltip, whose trigger props arrive in `rest`;
// its click handler runs as well as the pick.
function Column({
  label,
  pressed,
  onPick,
  onClick,
  children,
  ...rest
}: {
  label: string
  pressed?: boolean
  onPick?: () => void
  onClick?: (event: MouseEvent<HTMLElement>) => void
  children: ReactNode
}) {
  const className =
    'group relative flex h-full flex-1 items-end justify-center rounded-sm outline-none focus-visible:bg-muted aria-pressed:bg-muted'
  return onPick ? (
    <button
      type="button"
      {...rest}
      aria-label={label}
      aria-pressed={pressed}
      onClick={(event) => {
        onClick?.(event)
        onPick()
      }}
      className={cn(className, 'cursor-pointer')}
    >
      {children}
    </button>
  ) : (
    <div
      role="img"
      tabIndex={0}
      {...rest}
      aria-label={label}
      onClick={onClick}
      className={className}
    >
      {children}
    </div>
  )
}

// Every group of one period, largest first, as ranked bars: the bar is the
// group's share of the period's largest group.
function PeriodGroups({
  title,
  total,
  groups,
  onClose,
}: {
  title: string
  total: number
  groups: Segment[]
  onClose: () => void
}) {
  const largest = groups[0]?.cost ?? 0
  return (
    <section aria-label={title} className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {title} · {formatMoney(total)}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close the list"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <ol className="max-h-72 space-y-2 overflow-y-auto pr-1 text-sm">
        {groups.map((group) => (
          <li
            key={group.key}
            className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto_3rem] items-center gap-3"
          >
            <span title={group.label} className="truncate">
              {group.label}
            </span>
            <span className="h-2 rounded-full bg-muted">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${largest > 0 ? (group.cost / largest) * 100 : 0}%`,
                  background: group.color,
                }}
              />
            </span>
            <span className="text-right tabular-nums">
              {formatMoney(group.cost)}
            </span>
            <span className="text-right text-muted-foreground tabular-nums">
              {formatShare(group.cost / total)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
