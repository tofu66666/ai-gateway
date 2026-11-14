import { scaleBand, scaleLinear } from 'd3-scale'
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import type { RequestRow } from '@/api/requests'
import { SkeletonLines } from '@/components/layout/Placeholders'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatMoney } from '@/lib/format'
import { type DayTotals, dailyTotals } from './metrics'

type Measure = 'spend' | 'requests' | 'tokens'

const whole = new Intl.NumberFormat('en-US')
const compact = new Intl.NumberFormat('en-US', { notation: 'compact' })
const tickMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumSignificantDigits: 3,
})
const dayMonth = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
})
const fullDay = new Intl.DateTimeFormat('en-AU', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

const measures: Record<
  Measure,
  { label: string; title: string; format: (value: number) => string }
> = {
  spend: { label: 'Spend', title: 'Spend per day', format: formatMoney },
  requests: {
    label: 'Requests',
    title: 'Requests per day',
    format: (value) =>
      `${whole.format(value)} ${value === 1 ? 'request' : 'requests'}`,
  },
  tokens: {
    label: 'Tokens',
    title: 'Tokens per day',
    format: (value) =>
      `${whole.format(value)} ${value === 1 ? 'token' : 'tokens'}`,
  },
}
const order: Measure[] = ['spend', 'requests', 'tokens']

const height = 208
const margin = { top: 12, right: 16, bottom: 28, left: 56 }
// A column is at most 24 px wide, keeps a 2 px gap to the next one, and a
// day with anything in it stands at least 2 px tall.
const widest = 24
const gap = 2
const lowest = 2

// The client asked for better charts and suggested D3.js (client meeting, Tue
// 10 Nov 2026): spend, requests or tokens day by day, one column per day,
// with the Overview's filters and time period. D3 works out the scales; React
// draws the SVG.
export function TrendChart({
  description,
  rows,
  start,
  end,
  pending,
}: {
  description: string
  rows: RequestRow[]
  start: Date
  end: Date
  pending: boolean
}) {
  const [measure, setMeasure] = useState<Measure>('spend')

  return (
    <Card>
      <CardHeader>
        <CardTitle>{measures[measure].title}</CardTitle>
        <CardDescription className="max-sm:col-span-2">
          {description}
        </CardDescription>
        {/* Under the description on a phone, where it would squeeze the
            title. */}
        <CardAction className="max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-3 max-sm:justify-self-start max-sm:pt-2">
          <Tabs
            value={measure}
            onValueChange={(value) => setMeasure(value as Measure)}
          >
            <TabsList aria-label="Show">
              {order.map((value) => (
                <TabsTrigger key={value} value={value}>
                  {measures[value].label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardAction>
      </CardHeader>

      <CardContent>
        {pending ? (
          <SkeletonLines rows={1} className="h-52" />
        ) : (
          <Plot days={dailyTotals(rows, start, end)} measure={measure} />
        )}
      </CardContent>
    </Card>
  )
}

// A column with rounded top corners, square on the baseline.
function columnPath(left: number, top: number, width: number, bottom: number) {
  const r = Math.min(4, width / 2, bottom - top)
  return [
    `M${left},${bottom}`,
    `V${top + r}`,
    `A${r},${r} 0 0 1 ${left + r},${top}`,
    `H${left + width - r}`,
    `A${r},${r} 0 0 1 ${left + width},${top + r}`,
    `V${bottom}`,
    'Z',
  ].join('')
}

// One column per day, quiet days left empty. The day under the pointer or
// the arrow keys is shaded, with its figures beside it; a table carries every
// day for screen readers.
function Plot({ days, measure }: { days: DayTotals[]; measure: Measure }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const element = box.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const plotWidth = Math.max(0, width - margin.left - margin.right)
  const plotHeight = height - margin.top - margin.bottom
  const x = scaleBand<number>()
    .domain(days.map((day) => day.day.getTime()))
    .range([0, plotWidth])
  const band = x.bandwidth()
  const columnWidth = Math.max(1, Math.min(widest, band - gap))
  const y = scaleLinear()
    .domain([0, Math.max(...days.map((day) => day[measure])) || 1])
    .nice(3)
    .range([plotHeight, 0])
  // Counts in full below 10,000, compact on an axis that reaches it.
  const compactAxis = y.domain()[1] >= 10000
  const ticks = y
    .ticks(3)
    .filter((tick) => measure === 'spend' || Number.isInteger(tick))
  const tickLabel = (value: number) =>
    measure === 'spend'
      ? tickMoney.format(value)
      : compactAxis
        ? compact.format(value)
        : whole.format(value)
  const leftOf = (day: DayTotals) => x(day.day.getTime()) ?? 0
  const centreOf = (day: DayTotals) => leftOf(day) + band / 2
  const topOf = (day: DayTotals) =>
    Math.min(y(day[measure]), plotHeight - lowest)
  // About one date every 72 px.
  const every = Math.ceil(days.length / Math.max(2, Math.floor(plotWidth / 72)))

  function pointAt(event: PointerEvent<SVGRectElement>) {
    const at = event.clientX - event.currentTarget.getBoundingClientRect().left
    setActive(Math.max(0, Math.min(days.length - 1, Math.floor(at / band))))
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    const lastIndex = days.length - 1
    const moves: Record<string, number> = {
      ArrowLeft: (active ?? lastIndex + 1) - 1,
      ArrowRight: (active ?? -1) + 1,
      Home: 0,
      End: lastIndex,
    }
    if (!(event.key in moves)) return
    event.preventDefault()
    setActive(Math.max(0, Math.min(lastIndex, moves[event.key])))
  }

  const point = active === null ? null : days[active]
  const pointX = point ? margin.left + centreOf(point) : 0
  // The readout sits beside the shaded day, on the side with room.
  const readoutLeft = pointX < width - 180

  return (
    <div
      ref={box}
      tabIndex={0}
      role="group"
      aria-label={`${measures[measure].title}. Left and right arrow keys read each day.`}
      onKeyDown={handleKey}
      onBlur={() => setActive(null)}
      className="relative rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      style={{ height }}
    >
      {width > 0 && (
        <svg width={width} height={height} aria-hidden className="text-xs">
          <g transform={`translate(${margin.left},${margin.top})`}>
            {ticks.map((tick) => (
              <g key={tick} transform={`translate(0,${y(tick)})`}>
                <line
                  x2={plotWidth}
                  stroke={
                    tick === 0 ? 'var(--muted-foreground)' : 'var(--border)'
                  }
                  strokeOpacity={tick === 0 ? 0.4 : 1}
                />
                <text
                  x={-8}
                  dy="0.32em"
                  textAnchor="end"
                  fill="var(--muted-foreground)"
                  className="tabular-nums"
                >
                  {tickLabel(tick)}
                </text>
              </g>
            ))}

            {point && (
              <rect
                x={leftOf(point)}
                width={band}
                height={plotHeight}
                rx={4}
                fill="var(--muted-foreground)"
                fillOpacity={0.08}
              />
            )}

            {days.map((day) =>
              day[measure] > 0 ? (
                <path
                  key={day.day.getTime()}
                  d={columnPath(
                    centreOf(day) - columnWidth / 2,
                    topOf(day),
                    columnWidth,
                    plotHeight,
                  )}
                  fill="var(--chart-1)"
                />
              ) : null,
            )}

            {days.map((day, index) =>
              index % every === 0 ? (
                <text
                  key={day.day.getTime()}
                  x={centreOf(day)}
                  y={plotHeight + 18}
                  textAnchor="middle"
                  fill="var(--muted-foreground)"
                >
                  {dayMonth.format(day.day)}
                </text>
              ) : null,
            )}

            {/* The whole plot is the hit area: each day owns its band. */}
            <rect
              width={plotWidth}
              height={plotHeight}
              fill="transparent"
              onPointerMove={pointAt}
              onPointerDown={pointAt}
              // A tapped day stays until the next tap; a mouse leaving clears it.
              onPointerLeave={(event) => {
                if (event.pointerType === 'mouse') setActive(null)
              }}
              // Sideways drags read the days; up and down still scroll.
              style={{ touchAction: 'pan-y' }}
            />
          </g>
        </svg>
      )}

      {point && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-max max-w-56 space-y-0.5 rounded-md bg-foreground px-3 py-2 text-xs text-background shadow-md"
          style={{
            left: pointX,
            transform: readoutLeft
              ? `translateX(${band / 2 + 8}px)`
              : `translateX(calc(-100% - ${band / 2 + 8}px))`,
          }}
        >
          <p className="flex items-center gap-2 font-medium tabular-nums">
            <span aria-hidden className="size-2 rounded-xs bg-(--chart-1)" />
            {measures[measure].format(point[measure])}
          </p>
          <p className="tabular-nums opacity-70">
            {order
              .filter((other) => other !== measure)
              .map((other) => measures[other].format(point[other]))
              .join(' · ')}
          </p>
          <p className="opacity-70">{fullDay.format(point.day)}</p>
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {point &&
          `${fullDay.format(point.day)}: ${order
            .map((value) => measures[value].format(point[value]))
            .join(', ')}`}
      </p>

      {/* A table hides inside a clipped box: alone, it keeps its height and
          the card would scroll. */}
      <div className="sr-only">
        <table>
          <caption>{measures[measure].title}</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              {order.map((value) => (
                <th key={value} scope="col">
                  {measures[value].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.day.getTime()}>
                <th scope="row">{fullDay.format(day.day)}</th>
                <td>{formatMoney(day.spend)}</td>
                <td>{whole.format(day.requests)}</td>
                <td>{whole.format(day.tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
