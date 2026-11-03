import { downloadCsv, toCsv } from '@/lib/csv'
import type { GroupBy, GroupTotal } from './aggregate'

const headers = [
  'period',
  'group',
  'requests',
  'prompt tokens',
  'completion tokens',
  'cost in USD',
]

// H18IALMOND-31: the rows on screen as a spreadsheet. The shared helpers quote
// cells, keep names that look like formulas as text, add the byte order mark
// Excel needs, and end the file name with today's date.
export function exportBreakdownCsv({
  rows,
  groupBy,
  period,
  fileTag,
  nameOf,
}: {
  rows: GroupTotal[]
  groupBy: GroupBy
  period: string
  fileTag: string
  nameOf: (key: string) => string
}) {
  const csvRows = rows.map((row) => [
    period,
    nameOf(row.key),
    row.requests,
    row.inputTokens,
    row.outputTokens,
    row.cost,
  ])

  downloadCsv(`spend_by_${groupBy}_${fileTag}`, toCsv([headers, ...csvRows]))
}
