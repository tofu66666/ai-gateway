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
