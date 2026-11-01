import type { BreakdownRow } from '@/features/breakdown/aggregate'

// H18IALMOND-41: what the request log can be filtered by, besides the top
// bar's time period.
export const requestFilters = [
  'team',
  'project',
  'user',
  'key',
  'model',
  'status',
] as const

export type RequestFilter = (typeof requestFilters)[number]

// The value each filter compares. A request with no team or key (GET
// /requests does not list key_id) has '' and never matches a chosen one.
export const valueOf: Record<RequestFilter, (row: BreakdownRow) => string> = {
  team: (row) => row.team_id ?? '',
  project: (row) => row.project_id,
  user: (row) => row.user_id,
  key: (row) => row.key_id ?? '',
  model: (row) => row.model_id,
  status: (row) => String(row.status),
}
