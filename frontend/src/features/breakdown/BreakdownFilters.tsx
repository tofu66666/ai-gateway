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
    <Card>
      <CardHeader>
        <CardTitle>Filters</CardTitle>
        <CardDescription>The time period is in the top bar.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {(['team', 'project', 'model', 'user'] as const).map((by) => (
            <div key={by} className="space-y-2">
              <Label htmlFor={`breakdown-${by}`}>{filterLabels[by][0]}</Label>
              <Select
                value={filters[by]}
                onValueChange={(value) => onChange(by, value)}
              >
                <SelectTrigger id={`breakdown-${by}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{filterLabels[by][1]}</SelectItem>
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
