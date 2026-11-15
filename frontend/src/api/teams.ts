
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

export function getTeamMembers(teamId: string) {
  return apiFetch<TeamMember[]>(
    `/team/${encodeURIComponent(teamId)}/users`,
  )
}

export function saveTeamMember(change: TeamMemberChange) {
  return apiFetch<null>('/team/user', {
    method: 'PUT',
    body: change,
  })
}

export function removeTeamMember(teamId: string, userId: string) {
  return apiFetch<null>('/team/user', {
    method: 'DELETE',
    body: {
      team_id: teamId,
      user_id: userId,
    },
  })
}

// Transfer team ownership.
// Backend: PUT /team/change_owner
export type ChangeTeamOwnerRequest = {
  team_id: string
  new_owner_id: string
}

export type OwnerChange = {
  status: string
  team_id: string
  new_owner_id: string
}

// The backend validates whether the new owner is eligible.
export function changeTeamOwner(change: ChangeTeamOwnerRequest) {
  return apiFetch<OwnerChange>('/team/change_owner', {
    method: 'PUT',
    body: change,
  })
}

// Every request in the team's projects, for its lead or an admin.
export function getTeamRequests(teamId: string) {
  return apiFetch<RequestRow[]>(
    `/team/${encodeURIComponent(teamId)}/requests`,
  )
}

export type TeamBudget = Team & {
  owner_id: string
  budget_per_month: number | null
  warning_threshold: number
  spend_this_month: number
  usage_ratio: number | null
  warning: boolean
  blocked: boolean
}

export function getTeamBudget(teamId: string) {
  return apiFetch<TeamBudget>(
    `/team/${encodeURIComponent(teamId)}`,
  )
}

export type TeamUsage = {
  team: Team
  members: TeamMember[]
  requests: RequestRow[]
}

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
        members.some(
          (member) =>
            member.is_owner && member.user_id === userId,
        )

      if (!leads) return null

      return {
        team,
        members,
        requests: await getTeamRequests(team.id),
      }
    }),
  )

  return usage.filter((entry) => entry !== null)
}
