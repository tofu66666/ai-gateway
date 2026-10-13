import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Minus, Plus, Users } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { queryKeys, useTeams } from '@/api/hooks'
import { createTeam } from '@/api/teams'
import type { Team } from '@/api/teams'
import { useCurrentUser } from '@/auth/useAuth'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function TeamsPage() {
  const user = useCurrentUser()
  const teams = useTeams()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('')
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [memberTeam, setMemberTeam] = useState<Team | null>(null)
  const [memberIdentifier, setMemberIdentifier] = useState('')
  const [memberAction, setMemberAction] = useState<'add' | 'remove' | null>(
    null,
  )

  const canManageMembers =
    user.role === 'team_lead' || user.role === 'admin'

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

  function openMemberAction(team: Team, action: 'add' | 'remove') {
    setMemberTeam(team)
    setMemberAction(action)
    setMemberIdentifier('')
  }

  function closeMemberAction() {
    setMemberTeam(null)
    setMemberAction(null)
    setMemberIdentifier('')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Teams & Projects</h1>
        <p className="text-muted-foreground">
          Open a team to manage its projects.
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
                You are not currently in any teams.
              </p>
            </div>
          )}

          {teams.data && teams.data.length > 0 && (
            <div className="space-y-3">
              {teams.data.map((team) => (
                <Card key={team.id} size="sm">
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle>
                      <Link to={`/teams/${team.id}`} className="hover:underline">
                        {team.name}
                      </Link>
                    </CardTitle>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedTeam(team)}
                      >
                        View Members
                      </Button>

                      {canManageMembers && (
                        <>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label={`Add member to ${team.name}`}
                            onClick={() => openMemberAction(team, 'add')}
                          >
                            <Plus />
                          </Button>

                          <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label={`Remove member from ${team.name}`}
                            onClick={() => openMemberAction(team, 'remove')}
                          >
                            <Minus />
                          </Button>
                        </>
                      )}
                    </div>
                  </CardHeader>
                </Card>
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
                    {create.isPending ? 'Creating...' : 'Create Team'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {selectedTeam && (
        <Card>
          <CardHeader>
            <CardTitle>{selectedTeam.name} — Members</CardTitle>
            <CardDescription>
              View the members of this team.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Users className="size-8 text-muted-foreground" />
              <p className="font-medium">No member data available</p>
              <p className="text-sm text-muted-foreground">
                Team members will appear here when member data is
                available.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={memberAction !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) closeMemberAction()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {memberAction === 'add' ? 'Add Member' : 'Remove Member'}
            </DialogTitle>

            <DialogDescription>
              {memberAction === 'add'
                ? `Add an existing user to ${memberTeam?.name ?? 'this team'}.`
                : `Remove a user from ${memberTeam?.name ?? 'this team'}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="member-identifier">
                User email or ID
              </Label>

              <Input
                id="member-identifier"
                value={memberIdentifier}
                onChange={(event) =>
                  setMemberIdentifier(event.target.value)
                }
                placeholder="User email or ID"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Member management will be enabled when the team member API
              is available.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeMemberAction}
            >
              Cancel
            </Button>

            <Button
              type="button"
              disabled={!memberIdentifier.trim()}
            >
              {memberAction === 'add' ? 'Add Member' : 'Remove Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}