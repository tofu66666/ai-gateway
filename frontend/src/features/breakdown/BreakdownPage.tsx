import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from 'lucide-react'
import { useEffect, useRef } from 'react'
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
import { timeWindows, useTimeWindow, windowStart } from '@/lib/time-window'
import { cn } from '@/lib/utils'
import {
  costsByBucket,
  groupKey,
  sortGroups,
  totalsByGroup,
  type GroupBy,
  type GroupTotal,
  type Granularity,
  type SortColumn,
} from './aggregate'
import { BreakdownFilters } from './BreakdownFilters'
import { SpendChart } from './SpendChart'
import { useBreakdownData } from './useBreakdownData'

const groupings: GroupBy[] = ['model', 'team', 'user', 'project']
const granularities: Granularity[] = ['day', 'week', 'month']
// --chart-1 to --chart-7 in index.css; other groups share --chart-other.
const seriesColours = 7
// Text buttons for the drill-down and the breadcrumb.
const textButton =
  'cursor-pointer rounded-sm text-left underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50'

const groupLabels: Record<GroupBy, string> = {
  model: 'Model',
  team: 'Team',
  user: 'User',
  project: 'Project',
}

// The table's columns after the group's name.
const numberColumns: { column: SortColumn; label: string }[] = [
  { column: 'requests', label: 'Requests' },
  { column: 'inputTokens', label: 'In tokens' },
  { column: 'outputTokens', label: 'Out tokens' },
  { column: 'cost', label: 'Cost' },
  { column: 'share', label: 'Share' },
]
const sortColumns: SortColumn[] = [
  'name',
  ...numberColumns.map((entry) => entry.column),
]

// H18IALMOND-27: spend in the top bar's time window, split by model, team,
// user or project (3.b Storyboard 3, frame 2). The grouping and the filters
// are kept in the page URL, so a view can be shared.
export function BreakdownPage() {
  const user = useCurrentUser()
  const { timeWindow, setTimeWindow } = useTimeWindow()
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
  // Most expensive first until a header is clicked; the order is in the URL.
  const sortParam = params.get('sort')
  const sortColumn =
    sortColumns.find((column) => column === sortParam) ?? 'cost'
  const descending = params.get('dir') !== 'asc'

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

  // The top bar's window is in the URL too: a shared link opens with its
  // window, and after that the top bar writes its window into the link.
  const opened = useRef(false)
  useEffect(() => {
    const linked = timeWindows.find(
      (option) => option.value === params.get('window'),
    )?.value
    if (!opened.current) {
      opened.current = true
      if (linked && linked !== timeWindow) {
        setTimeWindow(linked)
        return
      }
    }
    if (params.get('window') !== timeWindow) {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.set('window', timeWindow)
          return next
        },
        { replace: true },
      )
    }
  }, [params, setParams, setTimeWindow, timeWindow])

  function setFilter(by: GroupBy, value: string) {
    updateParams((next) => {
      if (value === 'all') next.delete(by)
      else next.set(by, value)
      // A project belongs to one team, so a new team clears it.
      if (by === 'team') next.delete('project')
    })
  }

  // The same header flips the order; another starts with names A to Z and
  // numbers largest first.
  function sortBy(column: SortColumn) {
    updateParams((next) => {
      const nextDescending =
        column === sortColumn ? !descending : column !== 'name'
      next.set('sort', column)
      next.set('dir', nextDescending ? 'desc' : 'asc')
    })
  }

  // A team row opens that team by member (3.b Storyboard 3, frame 3); the
  // breadcrumb goes back to every team.
  function openTeam(teamId: string) {
    updateParams((next) => {
      next.set('team', teamId)
      next.delete('project')
      next.set('group', 'user')
    })
  }

  function backToTeams() {
    updateParams((next) => {
      next.delete('team')
      next.delete('project')
      next.set('group', 'team')
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
  const sorted = sortGroups(groups, sortColumn, descending, (key) =>
    nameOf(groupBy, key),
  )

  // Day, week and month change only the chart; a week of data reads best by
  // day. The colour of a group stays the same through filters and windows:
  // the most expensive groups over everything loaded take the series colours.
  const periodParam = params.get('period')
  const granularity =
    granularities.find((period) => period === periodParam) ??
    (timeWindow === 'last_7_days' ? 'day' : 'week')
  const colourOrder = totalsByGroup(rows, groupBy).groups.map((g) => g.key)
  const hasColour = (key: string) =>
    colourOrder.indexOf(key) >= 0 && colourOrder.indexOf(key) < seriesColours
  const colourOf = (key: string) =>
    hasColour(key)
      ? `var(--chart-${colourOrder.indexOf(key) + 1})`
      : 'var(--chart-other)'
  const series = groups
    .filter((group) => hasColour(group.key))
    .sort((a, b) => colourOrder.indexOf(a.key) - colourOrder.indexOf(b.key))
    .map((group) => ({
      key: group.key,
      label: nameOf(groupBy, group.key),
      color: colourOf(group.key),
    }))
  const other = groups.some((group) => !hasColour(group.key))
    ? { key: 'other', label: 'Other', color: 'var(--chart-other)' }
    : null
  const buckets = costsByBucket(
    shown,
    groupBy,
    granularity,
    windowStart(timeWindow),
  )

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
            Day, week and month change only the chart; rows total the whole
            period. Every request counts for the user who made it and for the
            team that owns its project.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {filters.team !== 'all' && (
            <nav aria-label="Breadcrumb">
              <ol className="flex items-center gap-1 text-sm text-muted-foreground">
                <li>
                  <button
                    type="button"
                    onClick={backToTeams}
                    className={cn(textButton, 'hover:text-foreground')}
                  >
                    All teams
                  </button>
                </li>
                <li aria-hidden>
                  <ChevronRight className="size-3.5" />
                </li>
                <li aria-current="page" className="font-medium text-foreground">
                  {nameOf('team', filters.team)}
                </li>
              </ol>
            </nav>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
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
            <Tabs
              value={granularity}
              onValueChange={(value) =>
                updateParams((next) => next.set('period', value))
              }
            >
              <TabsList aria-label="Chart period">
                {granularities.map((period) => (
                  <TabsTrigger key={period} value={period}>
                    {period[0].toUpperCase() + period.slice(1)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {!isPending && groups.length > 0 && (
            <SpendChart
              buckets={buckets}
              series={series}
              other={other}
              granularity={granularity}
            />
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <SortHead
                  label={groupLabels[groupBy]}
                  column="name"
                  sortColumn={sortColumn}
                  descending={descending}
                  onSort={sortBy}
                />
                {numberColumns.map(({ column, label }) => (
                  <SortHead
                    key={column}
                    label={label}
                    column={column}
                    sortColumn={sortColumn}
                    descending={descending}
                    onSort={sortBy}
                    numeric
                  />
                ))}
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
                sorted.map((group) => (
                  <TableRow key={group.key}>
                    <TableCell className="font-medium wrap-break-word whitespace-normal">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="size-2.5 shrink-0 rounded-[2px]"
                          style={{ background: colourOf(group.key) }}
                        />
                        {groupBy === 'team' && group.key !== '' ? (
                          <button
                            type="button"
                            onClick={() => openTeam(group.key)}
                            aria-label={`${nameOf('team', group.key)}: show by member`}
                            className={cn(textButton, 'inline-flex gap-1')}
                          >
                            {nameOf('team', group.key)}
                            <ChevronRight
                              aria-hidden
                              className="size-3.5 self-center text-muted-foreground"
                            />
                          </button>
                        ) : (
                          nameOf(groupBy, group.key)
                        )}
                      </span>
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

// A header that sorts by its column; screen readers hear the order.
function SortHead({
  label,
  column,
  sortColumn,
  descending,
  onSort,
  numeric = false,
}: {
  label: string
  column: SortColumn
  sortColumn: SortColumn
  descending: boolean
  onSort: (column: SortColumn) => void
  numeric?: boolean
}) {
  const active = column === sortColumn
  const Icon = active ? (descending ? ArrowDown : ArrowUp) : ArrowUpDown
  return (
    <TableHead
      className={cn(numeric && 'text-right')}
      aria-sort={active ? (descending ? 'descending' : 'ascending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          'inline-flex cursor-pointer items-center gap-1 rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          numeric && 'flex-row-reverse',
        )}
      >
        {label}
        <Icon
          aria-hidden
          className={cn('size-3.5', !active && 'text-muted-foreground/50')}
        />
      </button>
    </TableHead>
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
