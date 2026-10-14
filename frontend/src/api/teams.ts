import { apiFetch } from './client'
import type { RequestRow } from './requests'

export type Team = {
  id: string
  name: string
}

export type CreateTeamRequest = {
  name: string
  budget_per_month: number | null
}

export type CreateTeamResponse = {
  status: string
  name: string
  owner_id: string
  creator_role: string
  budget_per_month: number | null
}

export async function getTeams(): Promise<Team[]> {
  // GET /team answers {"<team id>": "<team name>"}.
  const data = await apiFetch<Record<string, string>>('/team')

  return Object.entries(data).map(([id, name]) => ({
    id,
    name,
  }))
}

export function createTeam(team: CreateTeamRequest) {
  return apiFetch<CreateTeamResponse>('/team/create', {
    method: 'POST',
    body: team,
  })
}

export type TeamMember = {
  user_id: string
  email: string
  can_create_key: boolean
  is_owner: boolean
}

export type TeamMemberChange = {
  team_id: string
  user_id?: string
  email?: string
  can_create_key: boolean
}

// The endpoint is still to come (H18IALMOND-51).
export function getTeamMembers(teamId: string) {
  return apiFetch<TeamMember[]>(`/team/${encodeURIComponent(teamId)}/users`)
}

// Adds the person to the team, or sets their key permission if already in it.
export function saveTeamMember(change: TeamMemberChange) {
  return apiFetch<null>('/team/user', { method: 'PUT', body: change })
}

export function removeTeamMember(teamId: string, userId: string) {
  return apiFetch<null>('/team/user', {
    method: 'DELETE',
    body: { team_id: teamId, user_id: userId },
  })
}

// Every request in the team's projects, for its lead or an admin.
export function getTeamRequests(teamId: string) {
  return apiFetch<RequestRow[]>(`/team/${encodeURIComponent(teamId)}/requests`)
}

export type TeamUsage = {
  team: Team
  members: TeamMember[]
  requests: RequestRow[]
}

// The teams the user leads (every team for an admin), with their requests and
// the members who made them.
export async function getTeamUsage(
  teams: Team[],
  userId: string,
  isAdmin: boolean,
) {
  const usage = await Promise.all(
    teams.map(async (team): Promise<TeamUsage | null> => {
      const members = await getTeamMembers(team.id)
      const leads =
        isAdmin ||
        members.some((member) => member.is_owner && member.user_id === userId)
      if (!leads) return null
      return { team, members, requests: await getTeamRequests(team.id) }
    }),
  )
  return usage.filter((entry) => entry !== null)
}
