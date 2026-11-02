import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Plus, Users } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { queryKeys, useTeams } from '@/api/hooks'
import { createTeam } from '@/api/teams'
import { useCurrentUser } from '@/auth/useAuth'
import { ErrorState } from '@/components/layout/ErrorState'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Members are managed on each team's page (H18IALMOND-51).
export function TeamsPage() {
  const isAdmin = useCurrentUser().role === 'admin'
  const teams = useTeams()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('')

  // H18IALMOND-49: confirm the new team, and show it in the list.
  const create = useMutation({
    mutationFn: createTeam,
    onSuccess: (team) => {
      toast.success(`Team "${team.name}" created`)
      queryClient.invalidateQueries({ queryKey: queryKeys.teams })
      setName('')
      setBudget('')
      setOpen(false)
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    create.mutate({
      name: name.trim(),
      budget_per_month: budget ? Number(budget) : null,
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Teams & Projects</h1>
        <p className="text-muted-foreground">
          Open a team to manage its projects and members.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isAdmin ? 'All Teams' : 'Your Teams'}</CardTitle>
          <CardDescription>
            {/* Admins see every team, whether or not they are in it. */}
            {isAdmin
              ? 'Every team on the platform.'
              : 'Teams you currently belong to.'}
          </CardDescription>
          <CardAction>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus />
              New team
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="space-y-4">
          {teams.isPending && (
            <p className="text-muted-foreground">Loading teams...</p>
          )}

          {teams.isError && (
            <ErrorState title="Couldn't load your teams" error={teams.error} />
          )}

          {teams.data?.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Users className="size-8 text-muted-foreground" />
              <p className="font-medium">No teams yet</p>
              <p className="text-sm text-muted-foreground">
                Create a team, or ask a team lead to add you to theirs.
              </p>
            </div>
          )}

          {teams.data && teams.data.length > 0 && (
            <div className="divide-y overflow-hidden rounded-lg border">
              {teams.data.map((team) => (
                <Link
                  key={team.id}
                  to={`/teams/${team.id}`}
                  className="group flex items-center gap-3 px-4 py-3 outline-none hover:bg-muted focus-visible:bg-muted"
                >
                  <Users className="size-4 text-muted-foreground" />
                  <span className="font-medium">{team.name}</span>
                  <span className="ml-auto flex items-center gap-1 text-sm text-primary">
                    Open
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          )}

          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next)
              create.reset()
            }}
          >
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>New team</DialogTitle>
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

                  {create.isError && (
                    <p className="text-sm text-destructive">
                      {create.error.message}
                    </p>
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

                  <Button
                    type="submit"
                    disabled={create.isPending || !name.trim()}
                  >
                    {create.isPending ? 'Creating...' : 'Create team'}
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