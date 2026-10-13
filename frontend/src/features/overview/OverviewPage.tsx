import { useState } from 'react'
import { FolderKanban } from 'lucide-react'

import { useCurrentUser } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { timeWindows, useTimeWindow } from '@/lib/time-window'
import type { TimeWindow } from '@/lib/time-window'

export function OverviewPage() {
  const user = useCurrentUser()
  const { timeWindow, setTimeWindow } = useTimeWindow()
  const [model, setModel] = useState('all')
  const [team, setTeam] = useState('all')
  const [project, setProject] = useState('all')

  const canViewTeamUsage =
    user.role === 'team_lead' || user.role === 'admin'

  function resetFilters() {
    setTimeWindow('this_month')
    setModel('all')
    setTeam('all')
    setProject('all')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-muted-foreground">
          Monitor usage and spending across your projects.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Filter project usage and spending.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Time period</Label>
              <Select
                value={timeWindow}
                onValueChange={(value) =>
                  setTimeWindow(value as TimeWindow)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeWindows.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All models</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Team</Label>
              <Select value={team} onValueChange={setTeam}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All teams</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={project} onValueChange={setProject}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All projects</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={resetFilters}>
              Reset filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold">
          Project Usage & Spending
        </h2>
        <p className="text-sm text-muted-foreground">
          Usage and spending for projects matching the selected filters.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <FolderKanban className="size-8 text-muted-foreground" />
          <p className="font-medium">
            No project usage data available
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            Project usage and spending will appear here when data is
            available.
          </p>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold">
          Your Usage & Spending
        </h2>
        <p className="text-sm text-muted-foreground">
          Your personal usage across all teams and projects.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total Requests</CardDescription>
            <CardTitle className="text-2xl">—</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Token Usage</CardDescription>
            <CardTitle className="text-2xl">—</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Total Spending</CardDescription>
            <CardTitle className="text-2xl">—</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Spending by Model</CardTitle>
          <CardDescription>
            Your personal spending grouped by model.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="flex min-h-24 items-center justify-center text-sm text-muted-foreground">
            No personal usage data available
          </div>
        </CardContent>
      </Card>

      {canViewTeamUsage && (
        <>
          <div>
            <h2 className="text-lg font-semibold">
              Team Usage & Spending
            </h2>
            <p className="text-sm text-muted-foreground">
              View total usage and spending for your team.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardDescription>Total Requests</CardDescription>
                <CardTitle className="text-2xl">—</CardTitle>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Token Usage</CardDescription>
                <CardTitle className="text-2xl">—</CardTitle>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Total Spending</CardDescription>
                <CardTitle className="text-2xl">—</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Member Usage</CardTitle>
              <CardDescription>
                Usage and spending share for each team member.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Requests</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead>Spending</TableHead>
                    <TableHead>Share</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No member usage data available
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}