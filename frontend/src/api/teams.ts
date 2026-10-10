export type Team = {
  id: string
  name: string
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