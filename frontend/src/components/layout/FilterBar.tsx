import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type Filter = {
  label: string
  // What the list calls "no filter", such as "All teams".
  all: string
  // An option's value, or 'all'.
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  disabled?: boolean
}

// The filters above a page's data, in one row (two columns on a phone). The
// time period is in the top bar; Reset shows once a filter is set.
export function FilterBar({
  filters,
  onReset,
}: {
  filters: Filter[]
  onReset: () => void
}) {
  const filtering = filters.some((filter) => filter.value !== 'all')

  return (
    <div
      role="group"
      aria-label="Filters"
      className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center"
    >
      {filters.map((filter) => (
        <Select
          key={filter.label}
          value={filter.value}
          onValueChange={filter.onChange}
          disabled={filter.disabled}
        >
          <SelectTrigger
            aria-label={filter.label}
            className="w-full justify-start sm:w-auto sm:max-w-64"
          >
            <span className="text-muted-foreground">{filter.label}:</span>
            <SelectValue>
              {filter.value === 'all' ? 'All' : undefined}
            </SelectValue>
            <span className="flex-1" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{filter.all}</SelectItem>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {filtering && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          Reset filters
        </Button>
      )}
    </div>
  )
}
