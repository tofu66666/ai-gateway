import { apiFetch } from './client'

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

export function getModels() {
  return apiFetch<Model[]>('/models')
}

export async function createProject(project: CreateProjectRequest) {
  await apiFetch('/projects', {
    method: 'POST',
    body: project,
  })
}
