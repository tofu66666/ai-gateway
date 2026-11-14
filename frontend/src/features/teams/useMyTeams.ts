import { useQueries } from '@tanstack/react-query'
import { queryKeys, useProjects, useTeams } from '@/api/hooks'
import type { Project } from '@/api/projects'
import { getTeamMembers, type Team, type TeamMember } from '@/api/teams'

export type MyTeam = {
  team: Team
  projects: Project[]
  // Your membership, with your key permission, and the team's lead: both
  // unknown until the team's members have loaded.
  me?: TeamMember
  lead?: TeamMember
}

// What stands between someone and their first key: a team, a project in it,
// and their team lead's permission to create keys there.
export type Standing = 'no-team' | 'no-project' | 'no-permission' | 'ready'

export function standingOf(myTeams: MyTeam[]): Standing {
  const withProjects = myTeams.filter((entry) => entry.projects.length > 0)
  if (myTeams.length === 0) return 'no-team'
  if (withProjects.length === 0) return 'no-project'
  // Permission still loading counts as allowed, so nobody is turned away by
  // mistake; the backend checks it anyway.
  const allowed = withProjects.some(
    (entry) => !entry.me || entry.me.can_create_key || entry.me.is_owner,
  )
  return allowed ? 'ready' : 'no-permission'
}

// The teams you are in, each with its projects, its lead and your key
// permission: what a plain user has in place of the Teams & projects page.
export function useMyTeams(userId: string) {
  const teams = useTeams()
  const projects = useProjects()
  const members = useQueries({
    queries: (teams.data ?? []).map((team) => ({
      queryKey: queryKeys.members(team.id),
      queryFn: () => getTeamMembers(team.id),
    })),
  })

  const membersOf = new Map(
    (teams.data ?? []).map((team, index) => [team.id, members[index]?.data]),
  )
  const teamRows = teams.data
  const projectRows = projects.data

  const data: MyTeam[] | undefined =
    teamRows && projectRows
      ? teamRows
          .map((team) => {
            const rows = membersOf.get(team.id)
            return {
              team,
              projects: projectRows.filter(
                (project) => project.team_id === team.id,
              ),
              me: rows?.find((row) => row.user_id === userId),
              lead: rows?.find((row) => row.is_owner),
            }
          })
          .sort((a, b) => a.team.name.localeCompare(b.team.name))
      : undefined

  return { data, error: teams.error ?? projects.error }
}
