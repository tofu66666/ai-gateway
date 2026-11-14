
import { ArrowLeft, Users } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'

import { getTeamBudget } from '@/api/teams'
import { queryKeys, useModels, useProjects, useTeams } from '@/api/hooks'
import { useCurrentUser } from '@/auth/useAuth'
import { EmptyState } from '@/components/layout/EmptyState'
import { ErrorState } from '@/components/layout/ErrorState'
import { SkeletonLines } from '@/components/layout/Placeholders'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
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
import { BudgetBar } from '@/features/overview/BudgetBar'
import { formatMoney } from '@/lib/format'

import { ChangeTeamLeadDialog } from './ChangeTeamLeadDialog'
import { CreateProjectDialog } from './CreateProjectDialog'
import { MembersCard } from './MembersCard'
import { ProjectBudgetDialog } from './ProjectBudgetDialog'
import { useCanManageTeam } from './useCanManageTeam'

export function TeamPage() {
  const { teamId = '' } = useParams()
  const user = useCurrentUser()
  const teams = useTeams()
  const team = teams.data?.find(
    (candidate) => candidate.id === teamId,
  )

  const isAdmin = user.role === 'admin'

  return (
    <div className="space-y-6">
      <div>
        <Button
          asChild
          variant="link"
          className="h-auto px-0"
        >
          <Link to="/teams">
            <ArrowLeft />
            All teams
          </Link>
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              {team?.name ?? 'Team'}
            </h1>

            <p className="text-muted-foreground">
              The team's projects and the people who use them.
            </p>
          </div>

          {isAdmin && team && (
            <ChangeTeamLeadDialog teamId={teamId} />
          )}
        </div>
      </div>

      {teams.isError && (
        <ErrorState
          title="Couldn't load your teams"
          error={teams.error}
        />
      )}

      {teams.isSuccess && !team ? (
        <EmptyState icon={Users} title="Team not found">
          You are not a member of this team, or it no longer exists.
        </EmptyState>
      ) : (
        <>
          <ProjectsCard teamId={teamId} />
          <MembersCard teamId={teamId} />
        </>
      )}
    </div>
  )
}

function ProjectsCard({ teamId }: { teamId: string }) {
  const projects = useProjects(teamId)

  const teamBudget = useQuery({
    queryKey: [
      ...queryKeys.teamBudgets([teamId]),
      'detail',
    ],
    queryFn: () => getTeamBudget(teamId),
    enabled: Boolean(teamId),
  })

  const models = useModels()
  const canManage = useCanManageTeam(teamId)

  const aliases = new Map(
    models.data?.map((model) => [
      model.id,
      model.alias,
    ]),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>

        <CardDescription>
          Keys are issued per project, and its requests
          count against its budget.
        </CardDescription>

        {canManage && (
          <CardAction>
            <CreateProjectDialog teamId={teamId} />
          </CardAction>
        )}
      </CardHeader>

      <CardContent>
        {teamBudget.isPending && (
          <p className="mb-4 text-sm text-muted-foreground">
            Loading team totals...
          </p>
        )}

        {teamBudget.isError && (
          <ErrorState
            title="Couldn't load the team budget"
            error={teamBudget.error}
          />
        )}

        {teamBudget.data && (
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">
                Team monthly budget
              </p>

              <p className="mt-1 text-xl font-semibold">
                {teamBudget.data.budget_per_month === null
                  ? 'No limit'
                  : formatMoney(
                      teamBudget.data.budget_per_month,
                    )}
              </p>
            </div>

            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">
                Team spent this month
              </p>

              <p className="mt-1 text-xl font-semibold">
                {formatMoney(
                  teamBudget.data.spend_this_month,
                )}
              </p>
            </div>
          </div>
        )}

        {projects.isPending && (
          <SkeletonLines rows={2} />
        )}

        {projects.isError && (
          <ErrorState
            title="Couldn't load the projects"
            error={projects.error}
          />
        )}

        {projects.data?.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No projects in this team yet.
          </p>
        )}

        {projects.data && projects.data.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Allowed models</TableHead>
                <TableHead className="text-right">
                  Monthly budget
                </TableHead>
                <TableHead className="text-right">
                  Spent this month
                </TableHead>

                {canManage && (
                  <TableHead className="text-right">
                    Actions
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>

            <TableBody>
              {projects.data.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">
                    {project.name}
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {project.model_ids.map((id) => (
                        <Badge
                          key={id}
                          variant="secondary"
                        >
                          {aliases.get(id) ?? 'Unknown model'}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    {project.budget_per_month === null
                      ? 'No limit'
                      : formatMoney(
                          project.budget_per_month,
                        )}
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    {formatMoney(project.spend_this_month)}

                    {typeof project.usage_ratio === 'number' && (
                      <div className="mt-1 ml-auto flex w-32 items-center gap-2">
                        <BudgetBar
                          usage={project.usage_ratio}
                          threshold={
                            project.warning_threshold ?? 0.8
                          }
                          state={
                            project.blocked
                              ? 'blocked'
                              : project.warning
                                ? 'alert'
                                : 'ok'
                          }
                          className="flex-1"
                        />

                        <span className="text-xs text-muted-foreground">
                          {Math.round(
                            project.usage_ratio * 100,
                          )}%
                        </span>
                      </div>
                    )}
                  </TableCell>

                  {canManage && (
                    <TableCell className="text-right">
                      <ProjectBudgetDialog
                        project={project}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
