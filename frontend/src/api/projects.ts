import { apiFetch } from './client'

export type Model = {
  id: string
  alias: string
  // USD per million tokens.
  price_per_1m_input: number
  price_per_1m_output: number
}

export type Project = {
  id: string
  team_id: string
  name: string
  model_ids: string[]
  budget_per_month: number | null
  spend_this_month: number
}

export type CreateProjectRequest = {
  team_id: string
  name: string
  model_ids: string[]
  budget_per_month: number | null
}

export function getModels() {
  return apiFetch<Model[]>('/models')
}

// Projects in the caller's teams (all of them for an admin). The endpoint is
// still to come; the shape follows the API draft.
export function getProjects(teamId?: string) {
  const query = teamId ? `?team_id=${encodeURIComponent(teamId)}` : ''
  return apiFetch<Project[]>(`/projects${query}`)
}

export function createProject(project: CreateProjectRequest) {
  return apiFetch<Project>('/projects', {
    method: 'POST',
    body: project,
  })
}
