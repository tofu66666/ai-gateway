import { useKeys, useModels } from '@/api/hooks'
import type { Model } from '@/api/projects'
import { useCurrentUser } from '@/auth/useAuth'
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
import { useBreakdownData } from '@/features/breakdown/useBreakdownData'
import { formatDateTime, formatMoney } from '@/lib/format'
import { useTimeWindow, windowStart } from '@/lib/time-window'

// Admins also get each model's provider.
type ProviderModel = Model & { provider?: string }

const scopes = {
  user: 'Your requests.',
  team_lead: 'Your requests and every request in the teams you lead.',
  admin: 'Every request on the platform.',
}

// H18IALMOND-13, -41: the requests the caller can see in the top bar's window,
// newest first: their own, those in the teams they lead, and every one for an
// admin, as on the Breakdown. Usage only: prompts and responses are never
// shown (client meeting, Mon 19 Oct 2026).
export function RequestsPage() {
  const user = useCurrentUser()
  const isAdmin = user.role === 'admin'
  const { rows, nameOf, isPending, error } = useBreakdownData()
  const keys = useKeys()
  const models = useModels()
  const { timeWindow } = useTimeWindow()
  const prefixOf = new Map(keys.data?.map((key) => [key.id, key.prefix]))
  const providerOf = new Map(
    models.data?.map((model: ProviderModel) => [model.id, model.provider]),
  )
  const since = windowStart(timeWindow).getTime()
  const shown = rows
    .filter((row) => new Date(row.created_at).getTime() >= since)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
  const keyOf = (keyId: string | null | undefined) =>
    keyId ? `${prefixOf.get(keyId) ?? keyId.slice(0, 8)}...` : '—'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Request History</h1>
        <p className="text-muted-foreground">{scopes[user.role]}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Requests</CardTitle>
          <CardDescription>
            One row per model request. Usage only: prompts and responses are not
            shown.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && <ErrorState title="Couldn't load requests" error={error} />}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Model</TableHead>
                {isAdmin && <TableHead>Provider</TableHead>}
                <TableHead className="text-right">Input tokens</TableHead>
                <TableHead className="text-right">Output tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Latency</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {shown.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDateTime(row.created_at)}</TableCell>
                  <TableCell>{nameOf('user', row.user_id)}</TableCell>
                  <TableCell>{nameOf('project', row.project_id)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {keyOf(row.key_id)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {nameOf('model', row.model_id)}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>{providerOf.get(row.model_id) ?? '—'}</TableCell>
                  )}
                  <TableCell className="text-right tabular-nums">
                    {row.input_tokens.toLocaleString('en-US')}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.output_tokens.toLocaleString('en-US')}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(row.cost)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
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
              {shown.length === 0 && !error && (
                <TableRow>
                  <TableCell
                    colSpan={isAdmin ? 11 : 10}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {isPending
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
