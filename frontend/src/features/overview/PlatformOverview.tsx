import type { RequestRow } from '@/api/requests'
import { ErrorState } from '@/components/layout/ErrorState'
import { SkeletonLines } from '@/components/layout/Placeholders'
import { Card, CardContent } from '@/components/ui/card'
import { costsByBucket } from '@/features/breakdown/aggregate'
import { SpendChart } from '@/features/breakdown/SpendChart'
import { useBreakdownData } from '@/features/breakdown/useBreakdownData'
import { formatMoney } from '@/lib/format'
import { useTimeWindow, windowStart } from '@/lib/time-window'
import { requestMetrics } from './metrics'
import { StatCard } from './StatCard'
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          pending={isPending}
          label="Total spend"
          value={formatMoney(metrics.spend)}
          detail={`${formatMoney(metrics.spend / days)} per day`}
        />
        <StatCard
          pending={isPending}
          label="Requests"
          value={metrics.requests.toLocaleString('en-US')}
          detail={`${perDay.format(metrics.requests / days)} per day`}
        />
        <StatCard
          pending={isPending}
          label="Error rate"
          hint="Requests that got no answer: refused by a budget or rate limit, or failed at the provider."
          value={
            metrics.errorRate === null
              ? 'No data'
              : percent.format(metrics.errorRate)
          }
          detail={
            empty
              ? 'No requests'
              : `${metrics.failed.toLocaleString('en-US')} failed`
          }
        />
        <StatCard
          pending={isPending}
          label="Latency p95"
          hint="95% of requests were answered faster than this. p50 is the typical time: half were faster."
          value={metrics.p95 === null ? 'No data' : formatLatency(metrics.p95)}
          detail={
            metrics.p50 === null
              ? 'No latency recorded'
              : `p50 ${formatLatency(metrics.p50)}`
          }
        />
      </div>

      <Card>
        <CardContent>
          {isPending ? (
            <SkeletonLines rows={1} className="h-48" />
          ) : empty ? (
            <p className="flex min-h-24 items-center justify-center text-center text-sm text-muted-foreground">
              No requests in this period, so nothing has been spent.
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
