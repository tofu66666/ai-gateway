import { useKeys } from '@/api/hooks'
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
import { formatDate } from '@/lib/format'

function statusVariant(status: string) {
  return status === 'active'
    ? 'secondary'
    : status === 'revoked'
      ? 'destructive'
      : 'outline'
}

export function KeysPage() {
  const keys = useKeys()
  const rows = keys.data ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Key Management</h1>
        <p className="text-muted-foreground">
          View and manage virtual API keys for your projects.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Virtual API Keys</CardTitle>
          <CardDescription>
            Keys provide access to AI models through the gateway.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {keys.isError && (
            <ErrorState
              title="Couldn't load API keys"
              error={keys.error}
            />
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Allowed Models</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-mono text-xs">
                    {key.prefix}...
                  </TableCell>

                  <TableCell>
                    {key.name ?? '—'}
                  </TableCell>

                  <TableCell>
                    {key.project_name ?? key.project_id.slice(0, 8)}
                  </TableCell>

                  <TableCell>
                    {key.user_email ?? key.user_id.slice(0, 8)}
                  </TableCell>

                  <TableCell>
                    {key.allowed_models.length > 0
                      ? key.allowed_models.join(', ')
                      : 'All project models'}
                  </TableCell>

                  <TableCell>{formatDate(key.created_at)}</TableCell>

                  <TableCell>{formatDate(key.expires_at)}</TableCell>

                  <TableCell>
                    <Badge variant={statusVariant(key.status)}>
                      {key.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}

              {rows.length === 0 && !keys.isError && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {keys.isPending
                      ? 'Loading API keys...'
                      : 'No API keys found.'}
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