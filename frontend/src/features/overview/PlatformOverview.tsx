import { Info } from 'lucide-react'
import type { RequestRow } from '@/api/requests'
import { ErrorState } from '@/components/layout/ErrorState'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { costsByBucket } from '@/features/breakdown/aggregate'
import { SpendChart } from '@/features/breakdown/SpendChart'
import { useBreakdownData } from '@/features/breakdown/useBreakdownData'
import { formatMoney } from '@/lib/format'
import { useTimeWindow, windowStart } from '@/lib/time-window'
import { requestMetrics } from './metrics'
import { TeamBudgets } from './TeamBudgets'
import { TopConsumers } from './TopConsumers'

const perDay = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const percent = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
})

// "640 ms" under a second, "1.9 s" from there.
function formatLatency(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

function StatCard({
  label,
  hint,
  value,
  detail,
}: {
  label: string
  hint?: string
  value: string
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
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </CardHeader>
    </Card>
  )
}

// H18IALMOND-26: the admin's view of every team in the chosen window (3.b
// Storyboard 3, frame 1): spend, traffic, errors and latency, and spend per
// day. The figures come from the requests, worked out as GET /stats does.
export function PlatformOverview({
  matches,
}: {
  matches: (row: RequestRow, team: string | undefined) => boolean
}) {
  const { timeWindow } = useTimeWindow()
  const { rows, nameOf, isPending, error } = useBreakdownData()
  const shown = rows.filter((row) => matches(row, row.team_id ?? undefined))
  const metrics = requestMetrics(shown)
  const buckets = costsByBucket(shown, 'team', 'day', windowStart(timeWindow))
  const days = Math.max(1, buckets.length)
  const empty = metrics.requests === 0
  const ready = (value: string) => (isPending ? '—' : value)

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">All teams</h2>
        <p className="text-sm text-muted-foreground">
          Spending, traffic and errors across the platform, with the filters
          above.
        </p>
      </div>

      {error && (
        <ErrorState title="Couldn't load every team's usage" error={error} />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total spend"
          value={ready(formatMoney(metrics.spend))}
          detail={ready(`${formatMoney(metrics.spend / days)} per day`)}
        />
        <StatCard
          label="Requests"
          value={ready(metrics.requests.toLocaleString('en-US'))}
          detail={ready(`${perDay.format(metrics.requests / days)} per day`)}
        />
        <StatCard
          label="Error rate"
          hint="Requests that got no answer: refused by a budget or rate limit, or failed at the provider."
          value={ready(
            metrics.errorRate === null
              ? 'No data'
              : percent.format(metrics.errorRate),
          )}
          detail={ready(
            empty
              ? 'No requests'
              : `${metrics.failed.toLocaleString('en-US')} failed`,
          )}
        />
        <StatCard
          label="Latency p95"
          hint="95% of requests were answered faster than this. p50 is the typical time: half were faster."
          value={ready(
            metrics.p95 === null ? 'No data' : formatLatency(metrics.p95),
          )}
          detail={ready(
            metrics.p50 === null
              ? 'No latency recorded'
              : `p50 ${formatLatency(metrics.p50)}`,
          )}
        />
      </div>

      <Card>
        <CardContent>
          {isPending || empty ? (
            <p className="flex min-h-24 items-center justify-center text-center text-sm text-muted-foreground">
              {isPending
                ? 'Loading spend per day...'
                : 'No requests in this period, so nothing has been spent.'}
            </p>
          ) : (
            <SpendChart
              buckets={buckets}
              series={[]}
              other={{ key: 'spend', label: 'Spend', color: 'var(--chart-1)' }}
              granularity="day"
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <TopConsumers rows={shown} nameOf={nameOf} isPending={isPending} />
        <TeamBudgets />
      </div>
    </section>
  )
}
