import type { GroupBy, GroupTotal } from './aggregate'

const headers = [
  'period',
  'group',
  'requests',
  'prompt tokens',
  'completion tokens',
  'cost in USD',
]

function escapeCsv(value: string | number) {
  const text = String(value)
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

export function exportBreakdownCsv({
  rows,
  groupBy,
  period,
  filePeriod,
  nameOf,
}: {
  rows: GroupTotal[]
  groupBy: GroupBy
  period: string
  filePeriod: string
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

  const csv = [headers, ...csvRows]
    .map((row) => row.map(escapeCsv).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `spend_by_${groupBy}_${filePeriod}.csv`
  link.click()

  URL.revokeObjectURL(url)
}