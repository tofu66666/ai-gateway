import { Ban } from 'lucide-react'
import { Link } from 'react-router'
import { useProjects, useTeamBudgets, useTeams } from '@/api/hooks'
import { ErrorState } from '@/components/layout/ErrorState'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { type BudgetState, teamBudgetRows } from './metrics'

// Each state has a dot and words, so it never rests on colour alone.
const look: Record<BudgetState, [dot: string, words: string]> = {
  blocked: ['bg-destructive', 'blocked'],
  alert: ['bg-warning', 'alert'],
  ok: ['bg-success', 'within budget'],
  none: ['bg-muted-foreground/40', 'no budget'],
}

// H18IALMOND-26: each team's month against its budget (H18IALMOND-19), the
// most urgent first: amber past the alert threshold, red once blocked, and
// how many projects can no longer send requests.
export function TeamBudgets() {
  const teams = useTeams()
  const budgets = useTeamBudgets(teams.data)
  const projects = useProjects()
  const error = teams.error ?? budgets.error ?? projects.error
  const rows = teamBudgetRows(budgets.data ?? [], projects.data ?? [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team budgets</CardTitle>
        <CardDescription>
          This month against each team's budget.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {error ? (
          <ErrorState title="Couldn't load team budgets" error={error} />
        ) : budgets.isPending || projects.isPending ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Loading budgets...
          </p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No teams yet.
          </p>
        ) : (
          <ul className="space-y-3 text-sm">
            {rows.map((row) => (
              <li key={row.id}>
                <div className="flex flex-wrap items-center gap-x-2">
                  <span
                    aria-hidden
                    className={cn(
                      'size-2.5 shrink-0 rounded-full',
                      look[row.state][0],
                    )}
                  />
                  <Link
                    to={`/teams/${row.id}`}
                    className="font-medium wrap-break-word hover:underline"
                  >
                    {row.name}
                  </Link>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {row.usage !== null && `${Math.round(row.usage * 100)}% · `}
                    {look[row.state][1]}
                  </span>
                </div>
                {row.cutOff > 0 && (
                  <p className="mt-1 ml-4.5 flex items-center gap-1.5 text-destructive">
                    <Ban aria-hidden className="size-3.5" />
                    {row.cutOff === 1
                      ? '1 project'
                      : `${row.cutOff} projects`}{' '}
                    cut off
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
