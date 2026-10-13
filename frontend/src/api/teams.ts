import { apiFetch } from './client'

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
