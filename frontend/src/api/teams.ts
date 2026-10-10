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

function getAccessToken(): string {
  const token = localStorage.getItem('access_token')

  if (!token) {
    throw new Error('You must be logged in to perform this action')
  }

  return token
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json()

    return (
      data.message ||
      data.detail ||
      `Request failed (${response.status})`
    )
  } catch {
    return `Request failed (${response.status})`
  }
}

export async function getTeams(): Promise<Team[]> {
  const response = await fetch('/api/team', {
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
    },
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }

  const data: Record<string, string> = await response.json()

  return Object.entries(data).map(([id, name]) => ({
    id,
    name,
  }))
}

export async function createTeam(
  team: CreateTeamRequest,
): Promise<CreateTeamResponse> {
  const response = await fetch('/api/team/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify(team),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }

  return response.json()
}