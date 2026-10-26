import {
  useModels,
  useProjects,
  useRequests,
  useTeams,
  useTeamUsage,
} from '@/api/hooks'
import { useCurrentUser } from '@/auth/useAuth'
import type { BreakdownRow, GroupBy } from './aggregate'

const unknown: Record<GroupBy, string> = {
  model: 'Unknown model',
  team: 'Unknown team',
  user: 'Former member',
  project: 'Unknown project',
}

// H18IALMOND-27: the requests the caller can see, scoped as in -20: their own,
// and every request in the teams they lead (all teams for an admin). It reads
// GET /requests and GET /team/{id}/requests until GET /stats groups them.
export function useBreakdownData() {
  const user = useCurrentUser()
  const leadsTeams = user.role === 'team_lead' || user.role === 'admin'
  const requests = useRequests()
  const teams = useTeams()
  const projects = useProjects()
  const models = useModels()
  const teamUsage = useTeamUsage(
    leadsTeams ? teams.data : undefined,
    user.id,
    user.role === 'admin',
  )

  // A request in a led team comes back from both calls, so rows are kept by
  // id; the team call already knows the team.
  const teamOf = new Map(
    projects.data?.map((project) => [project.id, project.team_id]),
  )
  const rows = new Map<string, BreakdownRow>()
  for (const entry of teamUsage.data ?? []) {
    for (const row of entry.requests) {
      rows.set(row.id, { ...row, team_id: entry.team.id })
    }
  }
  for (const row of requests.data ?? []) {
    if (!rows.has(row.id)) {
      rows.set(row.id, { ...row, team_id: teamOf.get(row.project_id) ?? null })
    }
  }

  const names: Record<GroupBy, Map<string, string>> = {
    model: new Map(models.data?.map((model) => [model.id, model.alias])),
    team: new Map(teams.data?.map((team) => [team.id, team.name])),
    user: new Map([[user.id, user.email]]),
    project: new Map(
      projects.data?.map((project) => [project.id, project.name]),
    ),
  }
  for (const entry of teamUsage.data ?? []) {
    names.team.set(entry.team.id, entry.team.name)
    for (const member of entry.members) {
      names.user.set(member.user_id, member.email)
    }
  }

  // Plain users never load team usage, so it only counts for leads and admins.
  const queries = leadsTeams
    ? [requests, teams, projects, models, teamUsage]
    : [requests, teams, projects, models]
  return {
    rows: [...rows.values()],
    nameOf: (groupBy: GroupBy, key: string) =>
      names[groupBy].get(key) ?? unknown[groupBy],
    isPending: queries.some((query) => query.isPending),
    error: queries.find((query) => query.isError)?.error ?? null,
  }
}
