import { Rocket } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import {
  useModels,
  useProjects,
  useRequests,
  useStats,
  useTeams,
  useTeamUsage,
} from '@/api/hooks'
import type { RequestRow } from '@/api/requests'
import { useCurrentUser } from '@/auth/useAuth'
import { EmptyState } from '@/components/layout/EmptyState'
import { ErrorState } from '@/components/layout/ErrorState'
import { SkeletonRows } from '@/components/layout/Placeholders'
import { FilterBar } from '@/components/layout/FilterBar'
import { Button } from '@/components/ui/button'
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatMoney } from '@/lib/format'
import { useTimeWindow, windowStart } from '@/lib/time-window'
import { PlatformOverview } from './PlatformOverview'
import { StatCard } from './StatCard'

const perDayFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
})

// H18IALMOND-12, -14, -54: your usage and, for team leads, the usage of the
// teams they lead, filtered; admins see every team instead (H18IALMOND-26).
// GET /stats provides the personal summary while request rows provide
// filtered breakdowns by model, team, project, and member.
export function OverviewPage() {
  const user = useCurrentUser()
  const { timeWindow, setTimeWindow } = useTimeWindow()
  const [model, setModel] = useState('all')
  const [team, setTeam] = useState('all')
  const [project, setProject] = useState('all')
  const requests = useRequests()
  const models = useModels()
  const teams = useTeams()
  const projects = useProjects()

  // Keep the end of the stats window stable for this page load.
  // This prevents rolling time windows from changing on every render
  // and creating a new React Query key every second.
  const [statsEnd] = useState(() => Date.now())
  const sinceDate = windowStart(timeWindow, new Date(statsEnd))
  const since = sinceDate.getTime()
  const statsStart = Math.floor(since / 1000)
  const stats = useStats(
    user.id,
    statsStart,
    Math.floor(statsEnd / 1000),
  )

  const canViewTeamUsage = user.role === 'team_lead' || user.role === 'admin'
  const teamUsage = useTeamUsage(
    canViewTeamUsage ? teams.data : undefined,
    user.id,
    user.role === 'admin',
  )

  const teamOf = new Map(projects.data?.map((p) => [p.id, p.team_id]))

  // The same filters apply to your usage and to team usage.
  const matches = (row: RequestRow, rowTeam: string | undefined) =>
    new Date(row.created_at).getTime() >= since &&
    (model === 'all' || row.model_id === model) &&
    (team === 'all' || rowTeam === team) &&
    (project === 'all' || row.project_id === project)

  const rows = (requests.data ?? []).filter((row) =>
    matches(row, teamOf.get(row.project_id)),
  )

  const tokensOf = (list: typeof rows) =>
    list.reduce((sum, row) => sum + row.input_tokens + row.output_tokens, 0)

  const costOf = (list: typeof rows) =>
    list.reduce((sum, row) => sum + Number(row.cost), 0)

  const spending = costOf(rows)

  const byModel = (models.data ?? [])
    .map((option) => {
      const own = rows.filter((row) => row.model_id === option.id)
      return {
        alias: option.alias,
        requests: own.length,
        tokens: tokensOf(own),
        cost: costOf(own),
      }
    })
    .filter((entry) => entry.requests > 0)
    .sort((a, b) => b.cost - a.cost)

  const hasResourceFilter =
    model !== 'all' || team !== 'all' || project !== 'all'

  const personalRequests = hasResourceFilter
    ? rows.length
    : stats.data?.count

  const personalTokens = hasResourceFilter
    ? tokensOf(rows)
    : stats.data
      ? stats.data.input + stats.data.output
      : undefined

  // GET /stats rounds the cost to four decimals; the request rows hold it in
  // full, so once they have loaded the figure matches the team section and
  // the model table.
  const personalSpending = hasResourceFilter || requests.data
    ? spending
    : stats.data?.total_cost

  // Admins rarely send requests themselves, so their empty personal figures
  // are left out.
  const showPersonal = user.role !== 'admin' || (personalRequests ?? 0) > 0
  // Anyone else who has sent nothing in the period is told how to start.
  const showStart =
    user.role !== 'admin' && !hasResourceFilter && stats.data?.count === 0

  const personalInput = hasResourceFilter
    ? rows.reduce((sum, row) => sum + row.input_tokens, 0)
    : stats.data?.input
  const personalOutput = hasResourceFilter
    ? rows.reduce((sum, row) => sum + row.output_tokens, 0)
    : stats.data?.output
  const personalPending = hasResourceFilter
    ? requests.isPending
    : stats.isPending

  // Days so far in the window, for the "per day" captions.
  const days = Math.max(1, Math.ceil((statsEnd - since) / 86_400_000))
  const perDay = (value: number) => perDayFormat.format(value / days)

  const personalError = hasResourceFilter ? requests.error : stats.error
  const personalIsError = hasResourceFilter
    ? requests.isError
    : stats.isError

  const shown = (value: string | undefined) => value ?? '—'

  const teamRows = (teamUsage.data ?? []).flatMap((entry) =>
    entry.requests.filter((row) => matches(row, entry.team.id)),
  )

  const teamSpending = costOf(teamRows)

  const emailOf = new Map(
    teamUsage.data?.flatMap((entry) =>
      entry.members.map((member) => [member.user_id, member.email] as const),
    ),
  )

  const byMember = [...new Set(teamRows.map((row) => row.user_id))]
    .map((userId) => {
      const own = teamRows.filter((row) => row.user_id === userId)
      return {
        userId,
        email: emailOf.get(userId) ?? 'Former member',
        requests: own.length,
        tokens: tokensOf(own),
        cost: costOf(own),
      }
    })
    .sort((a, b) => b.cost - a.cost)

  const teamShown = (value: string) => (teamUsage.data ? value : '—')

  function resetFilters() {
    setTimeWindow('this_month')
    setModel('all')
    setTeam('all')
    setProject('all')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-muted-foreground">
          Monitor usage and spending across your projects.
        </p>
      </div>

      <FilterBar
        filters={[
          {
            label: 'Model',
            all: 'All models',
            value: model,
            options: (models.data ?? []).map((option) => ({
              value: option.id,
              label: option.alias,
            })),
            onChange: setModel,
          },
          {
            label: 'Team',
            all: 'All teams',
            value: team,
            options: (teams.data ?? []).map((option) => ({
              value: option.id,
              label: option.name,
            })),
            onChange: (value) => {
              setTeam(value)
              setProject('all')
            },
            disabled: !projects.data,
          },
          {
            label: 'Project',
            all: 'All projects',
            value: project,
            options: (projects.data ?? [])
              .filter((option) => team === 'all' || option.team_id === team)
              .map((option) => ({ value: option.id, label: option.name })),
            onChange: setProject,
            disabled: !projects.data,
          },
        ]}
        onReset={resetFilters}
      />

      {showStart && (
        <EmptyState
          icon={Rocket}
          title="Nothing sent in this period"
          action={
            <>
              <Button asChild size="sm">
                <Link to="/keys">Create a key</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/playground">Open the Playground</Link>
              </Button>
            </>
          }
        >
          Create a key for one of your projects, then try a model in the
          Playground. Not in a team yet? Ask a team lead to add you.
        </EmptyState>
      )}

      {user.role === 'admin' && <PlatformOverview matches={matches} />}

      {showPersonal && (
        <>
          <div>
            <h2 className="text-lg font-semibold">
              Your usage & spending
            </h2>
            <p className="text-sm text-muted-foreground">
              Your personal usage across all teams and projects.
            </p>
          </div>

          {personalIsError && personalError && (
            <ErrorState
              title="Couldn't load your usage"
              error={personalError}
            />
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              pending={personalPending}
              label="Total requests"
              value={shown(personalRequests?.toLocaleString('en-US'))}
              detail={shown(
                personalRequests === undefined
                  ? undefined
                  : `${perDay(personalRequests)} per day`,
              )}
            />
            <StatCard
              pending={personalPending}
              label="Token usage"
              value={shown(personalTokens?.toLocaleString('en-US'))}
              detail={shown(
                personalInput === undefined || personalOutput === undefined
                  ? undefined
                  : `${personalInput.toLocaleString('en-US')} in · ${personalOutput.toLocaleString('en-US')} out`,
              )}
            />
            <StatCard
              pending={personalPending}
              label="Total spending"
              value={shown(
                personalSpending === undefined
                  ? undefined
                  : formatMoney(personalSpending),
              )}
              detail={shown(
                personalSpending === undefined
                  ? undefined
                  : `${formatMoney(personalSpending / days)} per day`,
              )}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Spending by model</CardTitle>
              <CardDescription>
                Your personal spending grouped by model.
              </CardDescription>
            </CardHeader>

            <CardContent>
              {byModel.length === 0 ? (
                <div className="flex min-h-24 items-center justify-center text-sm text-muted-foreground">
                  No personal usage data available
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Requests</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Spending</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {byModel.map((entry) => (
                      <TableRow key={entry.alias}>
                        <TableCell className="font-medium">
                          {entry.alias}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {entry.requests}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {entry.tokens.toLocaleString('en-US')}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(entry.cost)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {spending > 0
                            ? `${Math.round((entry.cost / spending) * 100)}%`
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {user.role === 'team_lead' && (
        <>
          <div>
            <h2 className="text-lg font-semibold">
              Team usage & spending
            </h2>
            <p className="text-sm text-muted-foreground">
              Usage and spending in the teams you lead.
            </p>
          </div>

          {teamUsage.isError && (
            <ErrorState
              title="Couldn't load team usage"
              error={teamUsage.error}
            />
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              pending={teamUsage.isPending}
              label="Total requests"
              value={teamShown(teamRows.length.toLocaleString('en-US'))}
              detail={teamShown(`${perDay(teamRows.length)} per day`)}
            />
            <StatCard
              pending={teamUsage.isPending}
              label="Token usage"
              value={teamShown(tokensOf(teamRows).toLocaleString('en-US'))}
              detail={teamShown(
                `${teamRows
                  .reduce((sum, row) => sum + row.input_tokens, 0)
                  .toLocaleString('en-US')} in · ${teamRows
                  .reduce((sum, row) => sum + row.output_tokens, 0)
                  .toLocaleString('en-US')} out`,
              )}
            />
            <StatCard
              pending={teamUsage.isPending}
              label="Total spending"
              value={teamShown(formatMoney(teamSpending))}
              detail={teamShown(`${formatMoney(teamSpending / days)} per day`)}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Member usage</CardTitle>
              <CardDescription>
                Usage and spending share for each team member.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Spending</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {teamUsage.isPending && <SkeletonRows columns={5} rows={3} />}

                  {!teamUsage.isPending && byMember.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No member usage data available
                      </TableCell>
                    </TableRow>
                  )}

                  {byMember.map((member) => (
                    <TableRow key={member.userId}>
                      <TableCell className="font-medium break-all whitespace-normal">
                        {member.email}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {member.requests}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {member.tokens.toLocaleString('en-US')}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(member.cost)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {teamSpending > 0
                          ? `${Math.round(
                              (member.cost / teamSpending) * 100,
                            )}%`
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}