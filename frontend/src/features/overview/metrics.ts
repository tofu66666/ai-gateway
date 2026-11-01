import type { Project } from '@/api/projects'
import type { RequestRow } from '@/api/requests'
import type { TeamBudget } from '@/api/teams'

// H18IALMOND-26: the admin Overview's figures. They are worked out the way
// GET /stats works them out (backend/app/routers/stats.py), so the cards and
// /stats agree on the same requests.

export type RequestMetrics = {
  requests: number
  spend: number
  failed: number
  // From 0 to 1; null without requests.
  errorRate: number | null
  // In milliseconds; null when no request recorded its latency.
  p50: number | null
  p95: number | null
}

// The value `fraction` of the way through the sorted values, at the index
// /stats takes, without interpolating.
export function percentile(values: number[], fraction: number) {
  const ordered = [...values].sort((a, b) => a - b)
  const index = Math.floor(ordered.length * fraction)
  return ordered[Math.max(0, Math.min(ordered.length - 1, index))]
}

export function requestMetrics(rows: RequestRow[]): RequestMetrics {
  // As in /stats, a request failed unless its status starts with 2.
  const failed = rows.filter(
    (row) => !String(row.status).startsWith('2'),
  ).length
  const latencies = rows.flatMap((row) =>
    typeof row.latency === 'number' ? [Math.trunc(row.latency)] : [],
  )
  return {
    requests: rows.length,
    spend: rows.reduce((sum, row) => sum + Number(row.cost), 0),
    failed,
    errorRate: rows.length > 0 ? failed / rows.length : null,
    p50: latencies.length > 0 ? percentile(latencies, 0.5) : null,
    p95: latencies.length > 0 ? percentile(latencies, 0.95) : null,
  }
}

// "alert" is past the team's warning threshold (80% unless changed).
export type BudgetState = 'blocked' | 'alert' | 'ok' | 'none'

export type TeamBudgetRow = {
  id: string
  name: string
  state: BudgetState
  // This month's spend over the budget; null without a budget.
  usage: number | null
  // Projects whose requests are refused: all of a blocked team's, otherwise
  // the ones past their own budget.
  cutOff: number
}

const urgency: BudgetState[] = ['blocked', 'alert', 'ok', 'none']

// One row per team for the budget panel, the most urgent first.
export function teamBudgetRows(teams: TeamBudget[], projects: Project[]) {
  return teams
    .map((team): TeamBudgetRow => {
      const own = projects.filter((project) => project.team_id === team.id)
      const usage =
        typeof team.usage_ratio === 'number' ? team.usage_ratio : null
      return {
        id: team.id,
        name: team.name,
        state: team.blocked
          ? 'blocked'
          : team.warning
            ? 'alert'
            : usage === null
              ? 'none'
              : 'ok',
        usage,
        cutOff: team.blocked
          ? own.length
          : own.filter((project) => project.blocked).length,
      }
    })
    .sort(
      (a, b) =>
        urgency.indexOf(a.state) - urgency.indexOf(b.state) ||
        (b.usage ?? -1) - (a.usage ?? -1) ||
        a.name.localeCompare(b.name),
    )
}
