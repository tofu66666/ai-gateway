import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { queryKeys, useKeys } from '@/api/hooks'
import { revokeKey } from '@/api/keys'
import { useCurrentUser } from '@/auth/useAuth'
import { ErrorState } from '@/components/layout/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { RotateKeyDialog } from '@/features/keys/RotateKeyDialog'
import { CreateKeyDialog } from '@/features/playground/CreateKeyDialog'
import { formatDate } from '@/lib/format'

function statusVariant(status: string) {
  return status === 'active'
    ? 'secondary'
    : status === 'revoked'
      ? 'destructive'
      : 'outline'
}

export function KeysPage() {
  const user = useCurrentUser()
  const keys = useKeys()
  const queryClient = useQueryClient()
  const rows = keys.data ?? []

  const revoke = useMutation({
    mutationFn: revokeKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.keys })
      toast.success('Key revoked')
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  function handleRevoke(keyId: string) {
    if (!window.confirm('Revoke this key? It will stop working immediately.')) {
      return
    }

    revoke.mutate(keyId)
  }

  function refreshKeys() {
    queryClient.invalidateQueries({ queryKey: queryKeys.keys })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Key Management</h1>
          <p className="text-muted-foreground">
            View and manage virtual API keys for your projects.
          </p>
        </div>

        <CreateKeyDialog onCreated={refreshKeys} />
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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-mono text-xs">
                    {key.prefix}...
                  </TableCell>

                  <TableCell>{key.name ?? '—'}</TableCell>

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

                  <TableCell>
                    {key.status === 'active' ? (
                      <div className="flex justify-end gap-2">
                        {key.user_id === user.id && (
                          <RotateKeyDialog keyId={key.id} />
                        )}

                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            revoke.isPending &&
                            revoke.variables === key.id
                          }
                          onClick={() => handleRevoke(key.id)}
                        >
                          <Trash2 />
                          {revoke.isPending &&
                          revoke.variables === key.id
                            ? 'Revoking...'
                            : 'Revoke'}
                        </Button>
                      </div>
                    ) : (
                      <div className="text-right text-muted-foreground">—</div>
                    )}
                  </TableCell>
                </TableRow>
              ))}

              {rows.length === 0 && !keys.isError && (
                <TableRow>
                  <TableCell
                    colSpan={9}
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