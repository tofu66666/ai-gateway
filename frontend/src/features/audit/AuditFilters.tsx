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
}

export function AuditFilters({
  filters,
  actions,
  onChange,
  onReset,
}: {
  filters: AuditFilterValues
  actions: AuditAction[]
  onChange: (filters: AuditFilterValues) => void
  onReset: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Filters</CardTitle>
        <CardDescription>
          Filter audit activity by action, user and date.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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