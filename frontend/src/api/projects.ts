export type Model = {
  id: string
  alias: string
}

export type CreateProjectRequest = {
  team_id: string
  name: string
  model_ids: string[]
  budget_per_month: number | null
}

function getAccessToken() {
  const token = localStorage.getItem('access_token')
  if (!token) throw new Error('You must be logged in')
  return token
}

async function checkResponse(response: Response) {
  if (response.ok) return

  try {
    const data = await response.json()
    throw new Error(data.message || data.detail || 'Request failed')
  } catch (error) {
    if (error instanceof Error) throw error
    throw new Error(`Request failed (${response.status})`)
  }
}

export async function getModels(): Promise<Model[]> {
  const response = await fetch('/api/models', {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  })
  await checkResponse(response)
  return response.json()
}

export async function createProject(project: CreateProjectRequest) {
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify(project),
  })
  await checkResponse(response)
}