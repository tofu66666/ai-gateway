import { apiFetch } from './client'

export type CreatedKey = {
  id: string
  // The raw key. It is in this response only; the platform keeps its hash.
  key: string
  prefix: string
  project_id: string
  expires_at: string
  created_at: string
}

// The key expires after the database default (30 days).
export function createKey(projectId: string) {
  return apiFetch<CreatedKey>('/create_api_key', {
    method: 'POST',
    body: { project_id: projectId },
  })
}
