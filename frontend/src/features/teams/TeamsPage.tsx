import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Minus, Plus, Users } from 'lucide-react'

import { createProject } from '@/api/projects'
import { createTeam, getTeams } from '@/api/teams'
import type { Team } from '@/api/teams'
import { useCurrentUser } from '@/auth/useAuth'
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
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [projectForm, setProjectForm] = useState(false)
  const [projectTeam, setProjectTeam] = useState('')
  const [projectName, setProjectName] = useState('')
  const [projectBudget, setProjectBudget] = useState('')
  const [projectError, setProjectError] = useState('')
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [memberTeam, setMemberTeam] = useState<Team | null>(null)
  const [memberIdentifier, setMemberIdentifier] = useState('')
  const [memberAction, setMemberAction] = useState<'add' | 'remove' | null>(
    null,
  )

  const canManageMembers =
    user.role === 'team_lead' || user.role === 'admin'

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

  async function handleProjectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProjectError('')
    setCreating(true)

    try {
      await createProject({
        team_id: projectTeam,
        name: projectName.trim(),
        model_ids: [],
        budget_per_month: projectBudget ? Number(projectBudget) : null,
      })

      setProjectName('')
      setProjectBudget('')
      setProjectTeam('')
      setProjectForm(false)
    } catch (err) {
      setProjectError(
        err instanceof Error ? err.message : 'Failed to create project',
      )
    } finally {
      setCreating(false)
    }
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
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle>{team.name}</CardTitle>

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

                  <Button
                    type="submit"
                    disabled={creating || !name.trim()}
                  >
                    {creating ? 'Creating...' : 'Create Team'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            onClick={() => setProjectForm(!projectForm)}
            disabled={teams.length === 0}
          >
            <Plus />
            Create Project
          </Button>

          {projectForm && (
            <form
              onSubmit={handleProjectSubmit}
              className="space-y-3 rounded-lg border p-4"
            >
              <p className="font-medium">Create Project</p>

              <select
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={projectTeam}
                onChange={(event) => setProjectTeam(event.target.value)}
                required
              >
                <option value="">Select team</option>

                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>

              <Input
                placeholder="Project name"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                required
              />

              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Monthly budget (optional)"
                value={projectBudget}
                onChange={(event) => setProjectBudget(event.target.value)}
              />

              {projectError && (
                <p className="text-sm text-destructive">{projectError}</p>
              )}

              <Button
                type="submit"
                disabled={
                  creating || !projectTeam || !projectName.trim()
                }
              >
                {creating ? 'Creating...' : 'Create Project'}
              </Button>
            </form>
          )}
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