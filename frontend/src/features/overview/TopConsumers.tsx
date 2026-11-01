import { useState } from 'react'
import { Link } from 'react-router'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  type BreakdownRow,
  totalsByGroup,
} from '@/features/breakdown/aggregate'
import { formatMoney } from '@/lib/format'
import { useTimeWindow } from '@/lib/time-window'

type RankBy = 'team' | 'user'

// H18IALMOND-26: the five teams or people who spent most in the window (3.b
// Storyboard 3, frame 1), with the Breakdown one click away for the rest.
export function TopConsumers({
  rows,
  nameOf,
  isPending,
}: {
  rows: BreakdownRow[]
  nameOf: (by: RankBy, key: string) => string
  isPending: boolean
}) {
  const { timeWindow } = useTimeWindow()
  const [by, setBy] = useState<RankBy>('team')
  const top = totalsByGroup(rows, by)
    .groups.filter((group) => group.key !== '')
    .slice(0, 5)
  const most = top[0]?.cost ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top consumers</CardTitle>
        <CardDescription>Most spent in the chosen period.</CardDescription>
        <CardAction>
          <Tabs value={by} onValueChange={(value) => setBy(value as RankBy)}>
            <TabsList aria-label="Rank by">
              <TabsTrigger value="team">Team</TabsTrigger>
              <TabsTrigger value="user">User</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        {isPending || top.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {isPending ? 'Loading...' : 'Nothing was spent in this period.'}
          </p>
        ) : (
          <ol className="space-y-3 text-sm">
            {top.map((group) => (
              <li
                key={group.key}
                className="grid grid-cols-[minmax(0,9rem)_minmax(3rem,1fr)_auto] items-center gap-3"
              >
                <span className="truncate font-medium">
                  {nameOf(by, group.key)}
                </span>
                <span
                  aria-hidden
                  className="h-2 rounded-r-[4px] bg-chart-1"
                  // Nothing spent, no bar; the smallest spend still shows.
                  style={{
                    width:
                      group.cost > 0
                        ? `max(2px, ${(group.cost / most) * 100}%)`
                        : 0,
                  }}
                />
                <span className="text-right tabular-nums">
                  {formatMoney(group.cost)}
                </span>
              </li>
            ))}
          </ol>
        )}
        <Link
          to={`/breakdown?group=${by}&window=${timeWindow}`}
          className="inline-block text-sm font-medium text-primary hover:underline"
        >
          Every {by} in the Breakdown ›
        </Link>
      </CardContent>
    </Card>
  )
}
