import { useState } from 'react'
import type { AuditLogFilters } from '@/api/audit'
import { useAuditActions, useAuditLogs } from '@/api/hooks'
import { ErrorState } from '@/components/layout/ErrorState'
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

function formatDetails(details: unknown) {
  if (details === null || details === undefined) {
    return '—'
  }

  if (typeof details === 'string') {
    return details
  }

  try {
    return JSON.stringify(details)
  } catch {
    return String(details)
  }
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
        <h1 className="text-2xl font-semibold">Audit Logs</h1>
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
          </CardDescription>
        </CardHeader>

        <CardContent>
          {auditLogs.error && (
            <ErrorState
              title="Couldn't load audit logs"
              error={auditLogs.error}
            />
          )}

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
                    {row.target_id ?? '—'}
                  </TableCell>

                  <TableCell className="max-w-md break-words font-mono text-xs">
                    {formatDetails(row.details)}
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
        </CardContent>
      </Card>
    </div>
  )
}