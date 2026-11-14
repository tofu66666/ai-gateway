import { Download } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { useKeys, useModels } from '@/api/hooks'
import type { Model } from '@/api/projects'
import { useCurrentUser } from '@/auth/useAuth'
import { ErrorState } from '@/components/layout/ErrorState'
import { SkeletonLines, SkeletonRows } from '@/components/layout/Placeholders'
import { StatusBadge } from '@/components/layout/StatusBadge'
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
import { downloadCsv, toCsv } from '@/lib/csv'
import { formatDateTime, formatMoney, formatShortDateTime } from '@/lib/format'
import { httpTone } from '@/lib/status'
import { useTimeWindow, windowStart } from '@/lib/time-window'
import { cn } from '@/lib/utils'
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

// A long name is cut so the numbers stay on screen; the full name is in its
// tooltip and the details.
function Clipped({ text, className }: { text: string; className: string }) {
  return (
    <span title={text} className={cn('block truncate', className)}>
      {text}
    </span>
  )
}

// H18IALMOND-13, -41: the requests the caller can see in the top bar's window,
// newest first: their own, those in the teams they lead, and every one for an
// admin, as on the Breakdown. Usage only: prompts and responses are never
// shown (client meeting, Mon 19 Oct 2026).
export function RequestsPage() {
  const user = useCurrentUser()
  const isAdmin = user.role === 'admin'
  // A user sees only their own requests, so the column would repeat them.
  const showUser = user.role !== 'user'
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

  const noRequests = filtering ? (
    'No requests match these filters in this period.'
  ) : (
    <>
      No requests in this period.{' '}
      <Link
        to="/playground"
        className="text-primary underline-offset-4 hover:underline"
      >
        Try a model in the Playground
      </Link>
      .
    </>
  )
  const statusOf = (row: BreakdownRow) => (
    <StatusBadge tone={httpTone(row.status)}>{row.status}</StatusBadge>
  )

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
        <h1 className="text-2xl font-semibold">Requests</h1>
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
          <CardTitle>Request log</CardTitle>
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
          {/* The key and the provider are in the details and the export, so
              the table fits a laptop screen. */}
          <div className="max-md:hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  {showUser && <TableHead>User</TableHead>}
                  <TableHead>Project</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Tokens in / out</TableHead>
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
                    <TableCell title={formatDateTime(row.created_at)}>
                      {formatShortDateTime(row.created_at)}
                    </TableCell>
                    {showUser && (
                      <TableCell>
                        <Clipped
                          text={nameOf('user', row.user_id)}
                          className="max-w-40"
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Clipped
                        text={nameOf('project', row.project_id)}
                        className="max-w-36"
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <Clipped
                        text={nameOf('model', row.model_id)}
                        className="max-w-40"
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.input_tokens.toLocaleString('en-US')} /{' '}
                      {row.output_tokens.toLocaleString('en-US')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.cost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.latency === null ? '—' : `${row.latency} ms`}
                    </TableCell>
                    <TableCell>{statusOf(row)}</TableCell>
                    <TableCell>
                      <RequestDetails
                        requestId={row.id}
                        time={formatDateTime(row.created_at)}
                        fields={detailsOf(row)}
                        compact
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {isPending && <SkeletonRows columns={showUser ? 9 : 8} />}
                {!isPending && shown.length === 0 && !error && (
                  <TableRow>
                    <TableCell
                      colSpan={showUser ? 9 : 8}
                      className="h-24 text-center whitespace-normal text-muted-foreground"
                    >
                      {noRequests}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* On a phone, one block per request instead of the wide table. */}
          <ul className="divide-y md:hidden">
            {visible.map((row) => (
              <li key={row.id} className="space-y-1 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {nameOf('model', row.model_id)}
                  </span>
                  {statusOf(row)}
                </div>
                <p className="truncate text-muted-foreground">
                  {formatShortDateTime(row.created_at)} ·{' '}
                  {nameOf('project', row.project_id)}
                  {showUser && ` · ${nameOf('user', row.user_id)}`}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-x-2 text-muted-foreground tabular-nums">
                  <span>
                    {row.input_tokens.toLocaleString('en-US')} /{' '}
                    {row.output_tokens.toLocaleString('en-US')} tokens ·{' '}
                    {formatMoney(row.cost)}
                    {row.latency !== null && ` · ${row.latency} ms`}
                  </span>
                  <span className="ml-auto">
                    <RequestDetails
                      requestId={row.id}
                      time={formatDateTime(row.created_at)}
                      fields={detailsOf(row)}
                    />
                  </span>
                </div>
              </li>
            ))}
            {isPending && (
              <li className="py-3">
                <SkeletonLines rows={3} className="h-16" />
              </li>
            )}
            {!isPending && shown.length === 0 && !error && (
              <li className="py-6 text-center text-sm text-muted-foreground">
                {noRequests}
              </li>
            )}
          </ul>

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
