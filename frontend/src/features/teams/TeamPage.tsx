import { ArrowLeft, Users } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { useModels, useProjects, useTeams } from '@/api/hooks'
import { EmptyState } from '@/components/layout/EmptyState'
import { ErrorState } from '@/components/layout/ErrorState'
import { Badge } from '@/components/ui/badge'
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

// One team: its projects and, later, its members (H18IALMOND-51, -52).
export function TeamPage() {
  const { teamId = '' } = useParams()
  const teams = useTeams()
  const team = teams.data?.find((candidate) => candidate.id === teamId)

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="link" className="h-auto px-0">
          <Link to="/teams">
            <ArrowLeft />
            All teams
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">{team?.name ?? 'Team'}</h1>
        <p className="text-muted-foreground">
          The team's projects, with the models and budget each one allows.
        </p>
      </div>

      {teams.isError && (
        <ErrorState title="Couldn't load your teams" error={teams.error} />
      )}
      {teams.isSuccess && !team ? (
        <EmptyState icon={Users} title="Team not found">
          You are not a member of this team, or it no longer exists.
        </EmptyState>
      ) : (
        <ProjectsCard teamId={teamId} />
      )}
    </div>
  )
}

function ProjectsCard({ teamId }: { teamId: string }) {
  const projects = useProjects(teamId)
  const models = useModels()
  const aliases = new Map(models.data?.map((model) => [model.id, model.alias]))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
        <CardDescription>
          Keys are issued per project, and its requests count against its
          budget.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {projects.isPending && (
          <p className="text-sm text-muted-foreground">Loading projects...</p>
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
                <TableHead className="text-right">Monthly budget</TableHead>
                <TableHead className="text-right">Spent this month</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.data.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">{project.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {project.model_ids.map((id) => (
                        <Badge key={id} variant="secondary">
                          {aliases.get(id) ?? 'Unknown model'}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {project.budget_per_month === null
                      ? 'No limit'
                      : formatMoney(project.budget_per_month)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatMoney(project.spend_this_month)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
