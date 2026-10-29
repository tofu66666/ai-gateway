import { useSearchParams } from 'react-router'

import { useCurrentUser } from '@/auth/useAuth'
import { ErrorState } from '@/components/layout/ErrorState'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatMoney } from '@/lib/format'
import { useTimeWindow, windowStart } from '@/lib/time-window'
import {
  groupKey,
  totalsByGroup,
  type GroupBy,
  type GroupTotal,
} from './aggregate'
import { BreakdownFilters } from './BreakdownFilters'
import { useBreakdownData } from './useBreakdownData'

const groupings: GroupBy[] = ['model', 'team', 'user', 'project']

const groupLabels: Record<GroupBy, string> = {
  model: 'Model',
  team: 'Team',
  user: 'User',
  project: 'Project',
}

// H18IALMOND-27: spend in the top bar's time window, split by model, team,
// user or project (3.b Storyboard 3, frame 2). The grouping and the filters
// are kept in the page URL, so a view can be shared.
export function BreakdownPage() {
  const user = useCurrentUser()
  const { timeWindow } = useTimeWindow()
  const [params, setParams] = useSearchParams()
  const { rows, nameOf, isPending, error } = useBreakdownData()

  // Budget owners split by team first; a user's own spend splits by model.
  const fallback: GroupBy = user.role === 'user' ? 'model' : 'team'
  const groupParam = params.get('group')
  const groupBy = groupings.find((by) => by === groupParam) ?? fallback
  const filters = Object.fromEntries(
    groupings.map((by) => [by, params.get(by) ?? 'all']),
  ) as Record<GroupBy, string>
  const filtersOn = groupings.some((by) => filters[by] !== 'all')

  function updateParams(change: (next: URLSearchParams) => void) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        change(next)
        return next
      },
      { replace: true },
    )
  }

  function setFilter(by: GroupBy, value: string) {
    updateParams((next) => {
      if (value === 'all') next.delete(by)
      else next.set(by, value)
      // A project belongs to one team, so a new team clears it.
      if (by === 'team') next.delete('project')
    })
  }

  // Options come from every loaded request, so they stay when the window
  // changes; projects follow the chosen team.
  function optionsFor(by: GroupBy) {
    const keys = new Set(
      rows
        .filter(
          (row) =>
            by !== 'project' ||
            filters.team === 'all' ||
            row.team_id === filters.team,
        )
        .map((row) => groupKey(row, by)),
    )
    return [...keys]
      .filter((key) => key !== '')
      .map((key) => ({ value: key, label: nameOf(by, key) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }

  const since = windowStart(timeWindow).getTime()
  const shown = rows.filter(
    (row) =>
      new Date(row.created_at).getTime() >= since &&
      groupings.every(
        (by) => filters[by] === 'all' || groupKey(row, by) === filters[by],
      ),
  )
  const { groups, total } = totalsByGroup(shown, groupBy)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Breakdown</h1>
        <p className="text-muted-foreground">
          Split spending by model, team, user or project.
        </p>
      </div>

      <BreakdownFilters
        filters={filters}
        optionsFor={optionsFor}
        onChange={setFilter}
        onReset={() =>
          updateParams((next) => groupings.forEach((by) => next.delete(by)))
        }
      />

      {error && <ErrorState title="Couldn't load usage" error={error} />}

      <Card>
        <CardHeader>
          <CardTitle>
            Spending by {groupLabels[groupBy].toLowerCase()}
          </CardTitle>
          <CardDescription>
            Rows total the whole period. Every request counts for the user who
            made it and for the team that owns its project.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Tabs
            value={groupBy}
            onValueChange={(value) =>
              updateParams((next) => next.set('group', value))
            }
          >
            <TabsList aria-label="Group by">
              {groupings.map((by) => (
                <TabsTrigger key={by} value={by}>
                  {groupLabels[by]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{groupLabels[groupBy]}</TableHead>
                <TableHead className="text-right">Requests</TableHead>
                <TableHead className="text-right">In tokens</TableHead>
                <TableHead className="text-right">Out tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {(isPending || groups.length === 0) && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {isPending
                      ? 'Loading usage...'
                      : filtersOn
                        ? 'No requests match these filters in this period.'
                        : 'No requests in this period.'}
                  </TableCell>
                </TableRow>
              )}
              {!isPending &&
                groups.map((group) => (
                  <TableRow key={group.key}>
                    <TableCell className="font-medium wrap-break-word whitespace-normal">
                      {nameOf(groupBy, group.key)}
                    </TableCell>
                    <TotalCells total={group} spent={total.cost > 0} />
                  </TableRow>
                ))}
            </TableBody>

            {!isPending && groups.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TotalCells total={total} spent={total.cost > 0} />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// Share is "—" only when nothing was spent; a free model's share is 0%.
function TotalCells({ total, spent }: { total: GroupTotal; spent: boolean }) {
  return (
    <>
      <TableCell className="text-right tabular-nums">
        {total.requests.toLocaleString('en-US')}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {total.inputTokens.toLocaleString('en-US')}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {total.outputTokens.toLocaleString('en-US')}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatMoney(total.cost)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {spent ? `${Math.round(total.share * 100)}%` : '—'}
      </TableCell>
    </>
  )
}
