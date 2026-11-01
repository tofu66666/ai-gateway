import { apiFetch } from './client'

export type Stats = {
  input: number
  output: number
  total_cost: number
  count: number
  success_count: number
  failure_count: number
  avg_cost: number
  success_rate: number
  latency_max: number
  latency_p50: number
  latency_p95: number
  latency_p99: number
}

export function getStats(
  resourceId: string,
  start?: number,
  end?: number,
) {
  const params = new URLSearchParams()

  if (start !== undefined) {
    params.set('start', String(start))
  }

  if (end !== undefined) {
    params.set('end', String(end))
  }

  const query = params.toString()
  const path = `/stats/${resourceId}${query ? `?${query}` : ''}`

  return apiFetch<Stats>(path)
}