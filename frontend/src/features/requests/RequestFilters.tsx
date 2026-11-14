import { FilterBar } from '@/components/layout/FilterBar'
import { type RequestFilter, requestFilters } from './filters'

const labels: Record<RequestFilter, [label: string, all: string]> = {
  team: ['Team', 'All teams'],
  project: ['Project', 'All projects'],
  user: ['User', 'All users'],
  key: ['Key', 'All keys'],
  model: ['Model', 'All models'],
  status: ['Status', 'All statuses'],
}

// H18IALMOND-41: the request log's filters, laid out as the Breakdown's. Each
// one is a value from the URL, or 'all'.
export function RequestFilters({
  filters,
  optionsFor,
  onChange,
  onReset,
}: {
  filters: Record<RequestFilter, string>
  optionsFor: (by: RequestFilter) => { value: string; label: string }[]
  onChange: (by: RequestFilter, value: string) => void
  onReset: () => void
}) {
  return (
    <FilterBar
      filters={requestFilters.map((by) => ({
        label: labels[by][0],
        all: labels[by][1],
        value: filters[by],
        options: optionsFor(by),
        onChange: (value) => onChange(by, value),
      }))}
      onReset={onReset}
    />
  )
}
