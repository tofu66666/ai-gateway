import { useState } from 'react'

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
import { ErrorState } from '@/components/layout/ErrorState'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

// H18IALMOND-12, -14, -54: usage and spending are shown on the dashboard.
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

  const personalSpending = hasResourceFilter
    ? spending
    : stats.data?.total_cost

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

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            The time period is in the top bar.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All models</SelectItem>
                  {models.data?.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.alias}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Team</Label>
              <Select
                value={team}
                onValueChange={(value) => {
                  setTeam(value)
                  setProject('all')
                }}
                disabled={!projects.data}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All teams</SelectItem>
                  {teams.data?.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Project</Label>
              <Select
                value={project}
                onValueChange={setProject}
                disabled={!projects.data}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All projects</SelectItem>
                  {projects.data
                    ?.filter(
                      (option) =>
                        team === 'all' || option.team_id === team,
                    )
                    .map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={resetFilters}>
              Reset filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold">
          Your Usage & Spending
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
        <Card>
          <CardHeader>
            <CardDescription>Total Requests</CardDescription>
            <CardTitle className="text-2xl">
              {shown(personalRequests?.toLocaleString('en-US'))}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Token Usage</CardDescription>
            <CardTitle className="text-2xl">
              {shown(personalTokens?.toLocaleString('en-US'))}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Total Spending</CardDescription>
            <CardTitle className="text-2xl">
              {personalSpending === undefined
                ? '—'
                : formatMoney(personalSpending)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Spending by Model</CardTitle>
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
                  <TableHead>Requests</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Spending</TableHead>
                  <TableHead>Share</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {byModel.map((entry) => (
                  <TableRow key={entry.alias}>
                    <TableCell className="font-medium">
                      {entry.alias}
                    </TableCell>
                    <TableCell>{entry.requests}</TableCell>
                    <TableCell>
                      {entry.tokens.toLocaleString('en-US')}
                    </TableCell>
                    <TableCell>{formatMoney(entry.cost)}</TableCell>
                    <TableCell>
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

      {canViewTeamUsage && (
        <>
          <div>
            <h2 className="text-lg font-semibold">
              Team Usage & Spending
            </h2>
            <p className="text-sm text-muted-foreground">
              {user.role === 'admin'
                ? 'Usage and spending in every team.'
                : 'Usage and spending in the teams you lead.'}
            </p>
          </div>

          {teamUsage.isError && (
            <ErrorState
              title="Couldn't load team usage"
              error={teamUsage.error}
            />
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardDescription>Total Requests</CardDescription>
                <CardTitle className="text-2xl">
                  {teamShown(teamRows.length.toLocaleString('en-US'))}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Token Usage</CardDescription>
                <CardTitle className="text-2xl">
                  {teamShown(tokensOf(teamRows).toLocaleString('en-US'))}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Total Spending</CardDescription>
                <CardTitle className="text-2xl">
                  {teamShown(formatMoney(teamSpending))}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Member Usage</CardTitle>
              <CardDescription>
                Usage and spending share for each team member.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Requests</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead>Spending</TableHead>
                    <TableHead>Share</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {(teamUsage.isPending || byMember.length === 0) && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="h-24 text-center text-muted-foreground"
                      >
                        {teamUsage.isPending
                          ? 'Loading team usage...'
                          : 'No member usage data available'}
                      </TableCell>
                    </TableRow>
                  )}

                  {byMember.map((member) => (
                    <TableRow key={member.userId}>
                      <TableCell className="font-medium break-all whitespace-normal">
                        {member.email}
                      </TableCell>
                      <TableCell>{member.requests}</TableCell>
                      <TableCell>
                        {member.tokens.toLocaleString('en-US')}
                      </TableCell>
                      <TableCell>
                        {formatMoney(member.cost)}
                      </TableCell>
                      <TableCell>
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