import { apiFetch } from './client'

// A row of the requests table, as the gateway logs it (H18IALMOND-10).
export type RequestRow = {
  id: string
  project_id: string
  model_id: string
  user_id: string
  input_tokens: number
  output_tokens: number
  cost: number | string
  // The HTTP status, such as "200" or "429".
  status: string
  latency: number | null
  created_at: string
  // The key used. GET /team/{id}/requests sends it; GET /requests does not
  // list it yet.
  key_id?: string | null
}

// The caller's requests. The endpoint is still to come.
export function getRequests() {
  return apiFetch<RequestRow[]>('/requests')
}
