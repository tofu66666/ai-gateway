import { useModels, useProjects, useRequests } from '@/api/hooks'
import { ErrorState } from '@/components/layout/ErrorState'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDateTime, formatMoney } from '@/lib/format'
import { useTimeWindow, windowStart } from '@/lib/time-window'

// H18IALMOND-13: your requests in the top bar's time window, newest first.
export function RequestsPage() {
  const requests = useRequests()
  const models = useModels()
  const projects = useProjects()
  const { timeWindow } = useTimeWindow()
  const aliases = new Map(models.data?.map((model) => [model.id, model.alias]))
  const projectNames = new Map(
    projects.data?.map((project) => [project.id, project.name]),
  )
  const since = windowStart(timeWindow).getTime()
  const rows = (requests.data ?? [])
    .filter((row) => new Date(row.created_at).getTime() >= since)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Request History</h1>
        <p className="text-muted-foreground">
          View your previous AI requests and usage details.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Requests</CardTitle>
          <CardDescription>
            Each row represents a single model request.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {requests.isError && (
            <ErrorState
              title="Couldn't load your requests"
              error={requests.error}
            />
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Latency</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={row.id}>
                  <TableCell className="text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    {aliases.get(row.model_id) ?? 'Unknown model'}
                  </TableCell>
                  <TableCell>
                    {projectNames.get(row.project_id) ??
                      row.project_id.slice(0, 8)}
                  </TableCell>
                  <TableCell>{formatDateTime(row.created_at)}</TableCell>
                  <TableCell>
                    {row.input_tokens} in / {row.output_tokens} out
                  </TableCell>
                  <TableCell>{formatMoney(row.cost)}</TableCell>
                  <TableCell>
                    {row.latency === null ? '—' : `${row.latency} ms`}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        Number(row.status) < 400 ? 'secondary' : 'destructive'
                      }
                    >
                      {row.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && !requests.isError && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {requests.isPending
                      ? 'Loading requests...'
                      : 'No requests in this period.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}