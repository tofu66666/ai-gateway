
import { useState } from 'react'
import { Check, Copy, Info } from 'lucide-react'
import type { AuditAction, AuditLogFilters } from '@/api/audit'
import { useAuditActions, useAuditLogs } from '@/api/hooks'
import { ErrorState } from '@/components/layout/ErrorState'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatDateTime } from '@/lib/format'
import {
  AuditFilters,
  type AuditFilterValues,
} from './AuditFilters'

const emptyFilters: AuditFilterValues = {
  action: 'all',
  userEmail: '',
  startDate: '',
  endDate: '',
}

function startOfDate(value: string) {
  if (!value) return undefined
  return Math.floor(new Date(`${value}T00:00:00`).getTime() / 1000)
}

function endOfDate(value: string) {
  if (!value) return undefined
  return Math.floor(new Date(`${value}T23:59:59`).getTime() / 1000)
}

function formatAction(action: string) {
  return action
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatDetails(details: unknown, pretty = false) {
  if (details === null || details === undefined) {
    return '—'
  }

  if (typeof details === 'string') {
    return details
  }

  try {
    return JSON.stringify(details, null, pretty ? 2 : undefined) ?? '—'
  } catch {
    return String(details)
  }
}

function detailsPreview(details: unknown) {
  const text = formatDetails(details)
    .replace(/\s+/g, ' ')
    .trim()

  if (text.length <= 100) {
    return text
  }

  return `${text.slice(0, 100)}…`
}

type TargetDescription = {
  label: string
  description: string
}

const targetDescriptions: Record<AuditAction, TargetDescription> = {
  create_api_key: {
    label: 'API Key ID',
    description: 'Identifies the API key created by this action.',
  },
  revoke_api_key: {
    label: 'API Key ID',
    description: 'Identifies the API key revoked by this action.',
  },
  rotate_api_key: {
    label: 'API Key ID',
    description: 'Identifies the API key rotated by this action.',
  },
  team_add_user: {
    label: 'Team ID',
    description: 'Identifies the team that received a member.',
  },
  team_remove_user: {
    label: 'Team ID',
    description: 'Identifies the team from which a member was removed.',
  },
  team_modify_owner: {
    label: 'Team ID',
    description: 'Identifies the team whose ownership changed.',
  },
  team_create: {
    label: 'Team ID',
    description: 'Identifies the newly created team.',
  },
  team_modify: {
    label: 'Team ID',
    description: 'Identifies the team whose settings or membership changed.',
  },
  model_create: {
    label: 'Model ID',
    description: 'Identifies the newly created model.',
  },
  model_modify: {
    label: 'Model ID',
    description: 'Identifies the model whose settings changed.',
  },
  project_create: {
    label: 'Project ID',
    description: 'Identifies the newly created project.',
  },
  project_modify: {
    label: 'Project ID',
    description: 'Identifies the project whose settings changed.',
  },
}

function TargetId({
  targetId,
  action,
}: {
  targetId: string | null
  action: AuditAction
}) {
  if (!targetId) {
    return <span className="text-muted-foreground">—</span>
  }

  const target = targetDescriptions[action] ?? {
    label: 'Target ID',
    description: 'Identifies the resource affected by this action.',
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex max-w-full cursor-help items-center gap-1.5 rounded-sm text-left underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={`${target.label}: ${targetId}. Show target information`}
        >
          <span className="break-all">{targetId}</span>
          <Info
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </button>
      </TooltipTrigger>

      <TooltipContent side="top" sideOffset={6}>
        <div className="max-w-64 space-y-1">
          <p className="font-semibold">{target.label}</p>
          <p>{target.description}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

function AuditDetails({
  details,
  action,
}: {
  details: unknown
  action: string
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const fullDetails = formatDetails(details, true)
  const preview = detailsPreview(details)

  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(fullDetails)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setCopied(false)
        }
      }}
    >
      <div className="flex min-w-0 max-w-64 flex-col items-start gap-1.5">
        <span
          className="w-full truncate font-mono text-xs text-muted-foreground"
          title={preview}
        >
          {preview}
        </span>

        <DialogTrigger asChild>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 py-0"
          >
            View details
          </Button>
        </DialogTrigger>
      </div>

      <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{formatAction(action)} details</DialogTitle>
          <DialogDescription>
            Full audit details for this activity.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30 p-4">
          <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed">
            {fullDetails}
          </pre>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copyDetails()}
          >
            {copied ? (
              <Check className="mr-2 size-4" aria-hidden="true" />
            ) : (
              <Copy className="mr-2 size-4" aria-hidden="true" />
            )}
            {copied ? 'Copied' : 'Copy details'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function AuditLogsPage() {
  const [filters, setFilters] = useState<AuditFilterValues>(emptyFilters)
  const actions = useAuditActions()

  const queryFilters: AuditLogFilters = {
    action: filters.action === 'all' ? undefined : filters.action,
    user_email: filters.userEmail.trim() || undefined,
    start: startOfDate(filters.startDate),
    end: endOfDate(filters.endDate),
  }

  const auditLogs = useAuditLogs(queryFilters)
  const rows = auditLogs.data ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-muted-foreground">
          Review administrative changes across the platform.
        </p>
      </div>

      <AuditFilters
        filters={filters}
        actions={actions.data ?? []}
        onChange={setFilters}
        onReset={() => setFilters(emptyFilters)}
      />

      {actions.error && (
        <ErrorState
          title="Couldn't load audit actions"
          error={actions.error}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>
            Changes to keys, members, budgets, limits, models and projects.
            Hover over a Target ID to see what it represents. Select View
            details to read the full audit record.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {auditLogs.error && (
            <ErrorState
              title="Couldn't load audit logs"
              error={auditLogs.error}
            />
          )}

          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(row.created_at)}
                    </TableCell>

                    <TableCell>
                      <div>{row.user_email ?? 'Unknown user'}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {row.user_id}
                      </div>
                    </TableCell>

                    <TableCell className="font-medium">
                      {formatAction(row.action)}
                    </TableCell>

                    <TableCell className="font-mono text-xs">
                      <TargetId
                        targetId={row.target_id}
                        action={row.action}
                      />
                    </TableCell>

                    <TableCell>
                      <AuditDetails
                        details={row.details}
                        action={row.action}
                      />
                    </TableCell>
                  </TableRow>
                ))}

                {rows.length === 0 && !auditLogs.error && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {auditLogs.isPending
                        ? 'Loading audit logs...'
                        : 'No audit logs match these filters.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TooltipProvider>
        </CardContent>
      </Card>
    </div>
  )
}
