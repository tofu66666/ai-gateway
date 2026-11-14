import { FilterBar } from '@/components/layout/FilterBar'
import type { GroupBy } from './aggregate'

const filterLabels: Record<GroupBy, [label: string, all: string]> = {
  team: ['Team', 'All teams'],
  project: ['Project', 'All projects'],
  model: ['Model', 'All models'],
  user: ['User', 'All users'],
}

// H18IALMOND-27: the Breakdown's filters (3.b Storyboard 3, frame 2). Each one
// is a value from the URL, or 'all'.
export function BreakdownFilters({
  filters,
  optionsFor,
  onChange,
  onReset,
}: {
  filters: Record<GroupBy, string>
  optionsFor: (by: GroupBy) => { value: string; label: string }[]
  onChange: (by: GroupBy, value: string) => void
  onReset: () => void
}) {
  return (
    <FilterBar
      filters={(['team', 'project', 'model', 'user'] as const).map((by) => ({
        label: filterLabels[by][0],
        all: filterLabels[by][1],
        value: filters[by],
        options: optionsFor(by),
        onChange: (value) => onChange(by, value),
      }))}
      onReset={onReset}
    />
  )
}
