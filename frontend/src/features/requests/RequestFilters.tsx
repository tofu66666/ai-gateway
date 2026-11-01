import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
    <Card>
      <CardHeader>
        <CardTitle>Filters</CardTitle>
        <CardDescription>The time period is in the top bar.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {requestFilters.map((by) => (
            <div key={by} className="space-y-2">
              <Label htmlFor={`requests-${by}`}>{labels[by][0]}</Label>
              <Select
                value={filters[by]}
                onValueChange={(value) => onChange(by, value)}
              >
                <SelectTrigger id={`requests-${by}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{labels[by][1]}</SelectItem>
                  {optionsFor(by).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onReset}>
            Reset filters
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
