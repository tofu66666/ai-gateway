import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { queryKeys, useKeys } from '@/api/hooks'
import { revokeKey } from '@/api/keys'
import { useCurrentUser } from '@/auth/useAuth'
import { ErrorState } from '@/components/layout/ErrorState'
import { SkeletonRows } from '@/components/layout/Placeholders'
import { StatusBadge } from '@/components/layout/StatusBadge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { KeySnippet } from '@/features/keys/KeySnippet'
import { RotateKeyDialog } from '@/features/keys/RotateKeyDialog'
import { CreateKeyDialog } from '@/features/playground/CreateKeyDialog'
import { formatDate } from '@/lib/format'
import type { Tone } from '@/lib/status'
import { cn } from '@/lib/utils'

const statusTones: Record<string, Tone> = {
  active: 'success',
  revoked: 'error',
  expired: 'neutral',
}

export function KeysPage() {
  const user = useCurrentUser()
  const keys = useKeys()
  const queryClient = useQueryClient()
  const rows = keys.data ?? []
  // A user lists only their own keys, so the column would repeat them.
  const showUser = user.role !== 'user'

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

  function refreshKeys() {
    queryClient.invalidateQueries({ queryKey: queryKeys.keys })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Keys</h1>
        <p className="text-muted-foreground">
          View and manage virtual API keys for your projects.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Virtual API keys</CardTitle>
          <CardDescription>
            Keys provide access to AI models through the gateway.
          </CardDescription>
          <CardAction>
            <CreateKeyDialog onCreated={refreshKeys} />
          </CardAction>
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
                <TableHead>Project</TableHead>
                {showUser && <TableHead>User</TableHead>}
                <TableHead>Allowed models</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((key) => (
                <TableRow key={key.id}>
                  {/* The name, when it has one, over the prefix. */}
                  <TableCell>
                    {key.name && (
                      <div
                        title={key.name}
                        className="max-w-48 truncate font-medium"
                      >
                        {key.name}
                      </div>
                    )}
                    <div
                      className={cn(
                        'font-mono text-xs',
                        key.name && 'text-muted-foreground',
                      )}
                    >
                      {key.prefix}...
                    </div>
                  </TableCell>

                  <TableCell>
                    <div
                      title={key.project_name ?? undefined}
                      className="max-w-36 truncate"
                    >
                      {key.project_name ?? key.project_id.slice(0, 8)}
                    </div>
                  </TableCell>

                  {showUser && (
                    <TableCell>
                      <div
                        title={key.user_email ?? undefined}
                        className="max-w-44 truncate"
                      >
                        {key.user_email ?? key.user_id.slice(0, 8)}
                      </div>
                    </TableCell>
                  )}

                  <TableCell>
                    <div className="max-w-48 whitespace-normal">
                      {key.allowed_models.length > 0
                        ? key.allowed_models.join(', ')
                        : 'All project models'}
                    </div>
                  </TableCell>

                  <TableCell>{formatDate(key.created_at)}</TableCell>

                  <TableCell>{formatDate(key.expires_at)}</TableCell>

                  <TableCell>
                    <StatusBadge tone={statusTones[key.status] ?? 'neutral'}>
                      {key.status.charAt(0).toUpperCase() + key.status.slice(1)}
                    </StatusBadge>
                  </TableCell>

                  <TableCell>
                    {key.status === 'active' ? (
                      <div className="flex justify-end gap-1">
                        {key.user_id === user.id && (
                          <RotateKeyDialog keyId={key.id} />
                        )}

                        <RevokeButton
                          prefix={key.prefix}
                          disabled={
                            revoke.isPending && revoke.variables === key.id
                          }
                          onConfirm={() => revoke.mutate(key.id)}
                        />
                      </div>
                    ) : (
                      <div className="text-right text-muted-foreground">—</div>
                    )}
                  </TableCell>
                </TableRow>
              ))}

              {keys.isPending && <SkeletonRows columns={showUser ? 8 : 7} />}

              {!keys.isPending && rows.length === 0 && !keys.isError && (
                <TableRow>
                  <TableCell
                    colSpan={showUser ? 8 : 7}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No API keys yet. Create one with Create key.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Use a key in your code</CardTitle>
          <CardDescription>
            Put one of your keys in place of YOUR_KEY, and the name of a chat
            model it may use, as the Models page shows it, in place of
            MODEL_NAME.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KeySnippet
            apiKey="YOUR_KEY"
            model="MODEL_NAME"
          />
        </CardContent>
      </Card>
    </div>
  )
}

function RevokeButton({
  prefix,
  disabled,
  onConfirm,
}: {
  prefix: string
  disabled: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Revoke ${prefix}...`}
              disabled={disabled}
            >
              <Trash2 />
            </Button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Revoke</TooltipContent>
      </Tooltip>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke {prefix}...?</AlertDialogTitle>
          <AlertDialogDescription>
            It will stop working immediately. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Revoke
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
