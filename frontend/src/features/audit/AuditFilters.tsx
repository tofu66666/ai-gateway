
import type { AuditAction } from '@/api/audit'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function formatAction(action: string) {
  return action
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export type AuditFilterValues = {
  action: AuditAction | 'all'
  userEmail: string
  startDate: string
  endDate: string
  teamId: string
  modelId: string
}

type FilterOption = {
  id: string
  name: string
}

export function AuditFilters({
  filters,
  actions,
  teams,
  models,
  onChange,
  onReset,
}: {
  filters: AuditFilterValues
  actions: AuditAction[]
  teams: FilterOption[]
  models: FilterOption[]
  onChange: (filters: AuditFilterValues) => void
  onReset: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Filters</CardTitle>
        <CardDescription>
          Filter audit activity by team, model, action, user and date.
          Team and Model filters cannot be used together.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="audit-team">Team</Label>
            <Select
              value={filters.teamId || 'all'}
              onValueChange={(value) =>
                onChange({
                  ...filters,
                  teamId: value === 'all' ? '' : value,
                  modelId: value === 'all' ? filters.modelId : '',
                })
              }
            >
              <SelectTrigger id="audit-team" className="w-full">
                <SelectValue placeholder="All teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teams</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="audit-model">Model</Label>
            <Select
              value={filters.modelId || 'all'}
              onValueChange={(value) =>
                onChange({
                  ...filters,
                  modelId: value === 'all' ? '' : value,
                  teamId: value === 'all' ? filters.teamId : '',
                })
              }
            >
              <SelectTrigger id="audit-model" className="w-full">
                <SelectValue placeholder="All models" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All models</SelectItem>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="audit-action">Action</Label>
            <Select
              value={filters.action}
              onValueChange={(value) =>
                onChange({
                  ...filters,
                  action: value as AuditAction | 'all',
                })
              }
            >
              <SelectTrigger id="audit-action" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {actions.map((action) => (
                  <SelectItem key={action} value={action}>
                    {formatAction(action)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="audit-user">User email</Label>
            <Input
              id="audit-user"
              type="email"
              placeholder="user@example.com"
              value={filters.userEmail}
              onChange={(event) =>
                onChange({
                  ...filters,
                  userEmail: event.target.value,
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="audit-start">Start date</Label>
            <Input
              id="audit-start"
              type="date"
              value={filters.startDate}
              onChange={(event) =>
                onChange({
                  ...filters,
                  startDate: event.target.value,
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="audit-end">End date</Label>
            <Input
              id="audit-end"
              type="date"
              value={filters.endDate}
              onChange={(event) =>
                onChange({
                  ...filters,
                  endDate: event.target.value,
                })
              }
            />
          </div>
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
