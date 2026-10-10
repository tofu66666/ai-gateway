import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, Users } from 'lucide-react'

import { createTeam, getTeams } from '@/api/teams'
import type { Team } from '@/api/teams'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  async function loadTeams() {
    try {
      setError('')
      setTeams(await getTeams())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teams')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTeams()
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateError('')
    setCreating(true)

    try {
      await createTeam({
        name: name.trim(),
        budget_per_month: budget ? Number(budget) : null,
      })

      setName('')
      setBudget('')
      setOpen(false)
      await loadTeams()
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'Failed to create team',
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Teams & Projects</h1>
        <p className="text-muted-foreground">
          Manage your teams and projects.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Teams</CardTitle>
          <CardDescription>
            Teams you currently belong to.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {loading && (
            <p className="text-muted-foreground">Loading teams...</p>
          )}

          {!loading && error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {!loading && !error && teams.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Users className="size-8 text-muted-foreground" />
              <p className="font-medium">No teams yet</p>
              <p className="text-sm text-muted-foreground">
                You are not currently in any teams.
              </p>
            </div>
          )}

          {!loading && !error && teams.length > 0 && (
            <div className="space-y-3">
              {teams.map((team) => (
                <Card key={team.id} size="sm">
                  <CardHeader>
                    <CardTitle>{team.name}</CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus />
                Create Team
              </Button>
            </DialogTrigger>

            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>Create Team</DialogTitle>
                  <DialogDescription>
                    Create a new team and optionally set a monthly budget.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="team-name">Team name</Label>
                    <Input
                      id="team-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="team-budget">Monthly budget</Label>
                    <Input
                      id="team-budget"
                      type="number"
                      min="0"
                      step="0.01"
                      value={budget}
                      onChange={(event) => setBudget(event.target.value)}
                      placeholder="Optional"
                    />
                  </div>

                  {createError && (
                    <p className="text-sm text-destructive">{createError}</p>
                  )}
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating || !name.trim()}>
                    {creating ? 'Creating...' : 'Create Team'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  )
}