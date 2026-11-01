import type { RequestRow } from '@/api/requests'

// H18IALMOND-27: the Breakdown page splits spend by model, team, user or
// project. It adds up the requests the caller can see until GET /stats groups
// them (H18IALMOND-20).

export type GroupBy = 'model' | 'team' | 'user' | 'project'
export type Granularity = 'day' | 'week' | 'month'

// A request and the team that owns its project. Every request counts for the
// user who made it and for that team, so the teams add up to the total.
export type BreakdownRow = RequestRow & { team_id: string | null }

export type GroupTotal = {
  key: string
  requests: number
  inputTokens: number
  outputTokens: number
  cost: number
  // Share of the period's cost, from 0 to 1; 0 when nothing was spent.
  share: number
}

// What a row is grouped under. A request whose project is not in the caller's
// project list has no team, so it is grouped under ''.
export function groupKey(row: BreakdownRow, groupBy: GroupBy) {
  if (groupBy === 'model') return row.model_id
  if (groupBy === 'team') return row.team_id ?? ''
  if (groupBy === 'user') return row.user_id
  return row.project_id
}

function emptyTotal(key: string): GroupTotal {
  return {
    key,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    share: 0,
  }
}

function add(total: GroupTotal, row: RequestRow) {
  total.requests += 1
  total.inputTokens += row.input_tokens
  total.outputTokens += row.output_tokens
  // The API may send Postgres numerics as strings.
  total.cost += Number(row.cost)
}

// One total per group for the whole period, most expensive first, and the
// period's total. Day, week and month only change the chart.
export function totalsByGroup(rows: BreakdownRow[], groupBy: GroupBy) {
  const groups = new Map<string, GroupTotal>()
  const total = emptyTotal('total')
  for (const row of rows) {
    const key = groupKey(row, groupBy)
    const group = groups.get(key) ?? emptyTotal(key)
    groups.set(key, group)
    add(group, row)
    add(total, row)
  }
  for (const group of groups.values()) {
    group.share = total.cost > 0 ? group.cost / total.cost : 0
  }
  total.share = total.cost > 0 ? 1 : 0
  return {
    groups: [...groups.values()].sort((a, b) => b.cost - a.cost),
    total,
  }
}

export type SortColumn =
  'name' | 'requests' | 'inputTokens' | 'outputTokens' | 'cost' | 'share'

// Any table column can sort the rows; names compare as the viewer reads them.
export function sortGroups(
  groups: GroupTotal[],
  column: SortColumn,
  descending: boolean,
  nameOf: (key: string) => string,
) {
  const sorted = [...groups].sort((a, b) =>
    column === 'name'
      ? nameOf(a.key).localeCompare(nameOf(b.key))
      : a[column] - b[column],
  )
  return descending ? sorted.reverse() : sorted
}

// The start of the day, the week (from Monday) or the month that holds
// `date`, in the viewer's time zone, like the time window.
export function bucketStart(date: Date, granularity: Granularity) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  if (granularity === 'week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  }
  if (granularity === 'month') {
    start.setDate(1)
  }
  return start
}

function nextBucket(start: Date, granularity: Granularity) {
  const next = new Date(start)
  if (granularity === 'day') next.setDate(next.getDate() + 1)
  if (granularity === 'week') next.setDate(next.getDate() + 7)
  if (granularity === 'month') next.setMonth(next.getMonth() + 1)
  return next
}

export type Bucket = {
  start: Date
  // Exclusive: the next bucket's start.
  end: Date
  costs: Map<string, number>
  total: number
}

// The period in day, week or month buckets, empty ones included, with the
// cost of each group in each. The first bucket starts with the period, so a
// month that begins on a Tuesday opens with "1–6 Sep". The period ends now
// unless `to` says otherwise, as windowStart does for its start.
export function costsByBucket(
  rows: BreakdownRow[],
  groupBy: GroupBy,
  granularity: Granularity,
  from: Date,
  to = new Date(),
) {
  const buckets: Bucket[] = []
  for (
    let start = bucketStart(from, granularity);
    start <= to;
    start = nextBucket(start, granularity)
  ) {
    buckets.push({
      start: start < from ? from : start,
      end: nextBucket(start, granularity),
      costs: new Map(),
      total: 0,
    })
  }
  for (const row of rows) {
    const time = new Date(row.created_at)
    const bucket = buckets.find(
      (candidate) => time >= candidate.start && time < candidate.end,
    )
    if (!bucket) continue
    const key = groupKey(row, groupBy)
    bucket.costs.set(key, (bucket.costs.get(key) ?? 0) + Number(row.cost))
    bucket.total += Number(row.cost)
  }
  return buckets
}
