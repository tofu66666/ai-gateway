import { apiFetch } from './client'

export type Model = {
  id: string
  alias: string
  // USD per million tokens.
  price_per_1m_input: number
  price_per_1m_output: number
  // Where the provider processes the data; "Not specified" when unknown.
  data_processing_country: string
  // Whether chat requests to this model start with a master prompt
  // (H18IALMOND-56). Only admins also get the prompt itself.
  has_prompt?: boolean
  prompt?: string | null
}

export type Project = {
  id: string
  team_id: string
  name: string
  model_ids: string[]
  budget_per_month: number | null
  spend_this_month: number
  // The budget state GET /projects adds (H18IALMOND-19).
  warning_threshold?: number
  usage_ratio?: number | null
  warning?: boolean
  blocked?: boolean
}

export type CreateProjectRequest = {
  team_id: string
  name: string
  model_ids: string[]
  budget_per_month: number | null
}

export type NewModel = {
  alias: string
  provider: string
  model: string
  price_per_1m_input: number
  price_per_1m_output: number
  data_processing_country: string | null
  prompt?: string
}

export function getModels() {
  return apiFetch<Model[]>('/models')
}

// Admins only (H18IALMOND-53).
export function createModel(model: NewModel) {
  return apiFetch<Model>('/models', { method: 'POST', body: model })
}

// Admins only; null removes the prompt (H18IALMOND-57).
export function updateModelPrompt(modelId: string, prompt: string | null) {
  return apiFetch<Model>(`/models/${modelId}/prompt`, {
    method: 'PATCH',
    body: { prompt },
  })
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
