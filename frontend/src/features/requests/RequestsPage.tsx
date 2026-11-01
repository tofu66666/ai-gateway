import { Download } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { useKeys, useModels } from '@/api/hooks'
import type { Model } from '@/api/projects'
import { useCurrentUser } from '@/auth/useAuth'
import { ErrorState } from '@/components/layout/ErrorState'
import { Badge } from '@/components/ui/badge'
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
import type { BreakdownRow } from '@/features/breakdown/aggregate'
import { useBreakdownData } from '@/features/breakdown/useBreakdownData'
import { formatDateTime, formatMoney } from '@/lib/format'
import { useTimeWindow, windowStart } from '@/lib/time-window'
import { downloadCsv, toCsv } from './csv'
import { type RequestFilter, requestFilters, valueOf } from './filters'
import { RequestDetails } from './RequestDetails'
import { RequestFilters } from './RequestFilters'

const pageSize = 25

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
  const [params, setParams] = useSearchParams()
  const prefixOf = new Map(keys.data?.map((key) => [key.id, key.prefix]))
  const providerOf = new Map(
    models.data?.map((model: ProviderModel) => [model.id, model.provider]),
  )
  // A key's prefix, once GET /api_keys has answered (it can take seconds);
  // a key the list does not have shows the start of its id instead.
  const keyOf = (keyId: string | null | undefined) => {
    if (!keyId) return '—'
    const prefix = prefixOf.get(keyId)
    if (prefix) return `${prefix}...`
    return keys.isPending ? '…' : `${keyId.slice(0, 8)}...`
  }

  // The filters live in the URL, so a filtered view can be shared.
  const filters = Object.fromEntries(
    requestFilters.map((by) => [by, params.get(by) ?? 'all']),
  ) as Record<RequestFilter, string>
  const filtering = requestFilters.some((by) => filters[by] !== 'all')
  function setFilter(by: RequestFilter, value: string) {
    setParams(
      (next) => {
        if (value === 'all') next.delete(by)
        else next.set(by, value)
        // Another team's projects are not in this one.
        if (by === 'team') next.delete('project')
        next.delete('page')
        return next
      },
      { replace: true },
    )
  }
  // Options come from every loaded request; projects follow the chosen team.
  const optionsFor = (by: RequestFilter) => {
    const values = new Set(
      rows
        .filter(
          (row) =>
            by !== 'project' ||
            filters.team === 'all' ||
            row.team_id === filters.team,
        )
        .map(valueOf[by]),
    )
    values.delete('')
    return [...values]
      .map((value) => ({
        value,
        label:
          by === 'key'
            ? keyOf(value)
            : by === 'status'
              ? value
              : nameOf(by, value),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }

  const since = windowStart(timeWindow).getTime()
  const shown = rows
    .filter(
      (row) =>
        new Date(row.created_at).getTime() >= since &&
        requestFilters.every(
          (by) => filters[by] === 'all' || valueOf[by](row) === filters[by],
        ),
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
  // The page is in the URL too; a shorter list shows its last page.
  const pages = Math.max(1, Math.ceil(shown.length / pageSize))
  const page = Math.min(Math.max(1, Number(params.get('page')) || 1), pages)
  const visible = shown.slice((page - 1) * pageSize, page * pageSize)
  function setPage(to: number) {
    setParams(
      (next) => {
        if (to <= 1) next.delete('page')
        else next.set('page', String(to))
        return next
      },
      { replace: true },
    )
  }
  const detailsOf = (row: BreakdownRow): [string, string][] => [
    ['Request', row.id],
    ['Time', formatDateTime(row.created_at)],
    ['User', nameOf('user', row.user_id)],
    ['Team', row.team_id ? nameOf('team', row.team_id) : '—'],
    ['Project', nameOf('project', row.project_id)],
    ['Key', keyOf(row.key_id)],
    ['Model', nameOf('model', row.model_id)],
    ...(isAdmin
      ? [['Provider', providerOf.get(row.model_id) ?? '—'] as [string, string]]
      : []),
    ['Input tokens', row.input_tokens.toLocaleString('en-US')],
    ['Output tokens', row.output_tokens.toLocaleString('en-US')],
    ['Cost', formatMoney(row.cost)],
    ['Latency', row.latency === null ? '—' : `${row.latency} ms`],
    ['Status', String(row.status)],
  ]

  // Every filtered request, not just this page, in the table's columns;
  // numbers stay numbers so a spreadsheet can add them up.
  function exportCsv() {
    const columns: [string, (row: BreakdownRow) => string | number][] = [
      ['Time', (row) => row.created_at],
      ['User', (row) => nameOf('user', row.user_id)],
      ['Project', (row) => nameOf('project', row.project_id)],
      ['Key', (row) => keyOf(row.key_id)],
      ['Model', (row) => nameOf('model', row.model_id)],
      ['Provider', (row) => providerOf.get(row.model_id) ?? ''],
      ['Input tokens', (row) => row.input_tokens],
      ['Output tokens', (row) => row.output_tokens],
      ['Cost (USD)', (row) => Number(row.cost)],
      ['Latency (ms)', (row) => row.latency ?? ''],
      ['Status', (row) => String(row.status)],
    ]
    const shownColumns = isAdmin
      ? columns
      : columns.filter(([header]) => header !== 'Provider')
    downloadCsv(
      `requests_${timeWindow}`,
      toCsv([
        shownColumns.map(([header]) => header),
        ...shown.map((row) => shownColumns.map(([, value]) => value(row))),
      ]),
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Request History</h1>
        <p className="text-muted-foreground">{scopes[user.role]}</p>
      </div>

      <RequestFilters
        filters={filters}
        optionsFor={optionsFor}
        onChange={setFilter}
        onReset={() =>
          setParams(
            (next) => {
              requestFilters.forEach((by) => next.delete(by))
              next.delete('page')
              return next
            },
            { replace: true },
          )
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Requests</CardTitle>
          <CardDescription>
            One row per model request. Usage only: prompts and responses are not
            shown.
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              disabled={shown.length === 0}
              onClick={exportCsv}
            >
              <Download />
              Export CSV
            </Button>
          </CardAction>
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
                <TableHead>
                  <span className="sr-only">Details</span>
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {visible.map((row) => (
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
                  <TableCell>
                    <RequestDetails
                      time={formatDateTime(row.created_at)}
                      fields={detailsOf(row)}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {shown.length === 0 && !error && (
                <TableRow>
                  <TableCell
                    colSpan={isAdmin ? 12 : 11}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {isPending
                      ? 'Loading requests...'
                      : filtering
                        ? 'No requests match these filters in this period.'
                        : 'No requests in this period.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {shown.length > pageSize && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-4 text-sm text-muted-foreground">
              <p>
                {(page - 1) * pageSize + 1}–
                {Math.min(page * pageSize, shown.length)} of {shown.length}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
