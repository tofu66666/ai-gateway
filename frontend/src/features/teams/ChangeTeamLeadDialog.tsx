
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { queryKeys, useTeamMembers } from '@/api/hooks'
import { changeTeamOwner } from '@/api/teams'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

type Props = {
  teamId: string
}

export function ChangeTeamLeadDialog({ teamId }: Props) {
  const [open, setOpen] = useState(false)
  const [newOwnerId, setNewOwnerId] = useState('')
  const queryClient = useQueryClient()
  const members = useTeamMembers(teamId)

  const candidates = (members.data ?? []).filter(
    (member) => !member.is_owner,
  )

  const changeOwner = useMutation({
    mutationFn: () =>
      changeTeamOwner({
        team_id: teamId,
        new_owner_id: newOwnerId,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.members(teamId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.teams,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.teamBudgets([teamId]),
        }),
      ])

      toast.success('Team lead updated')
      setOpen(false)
      setNewOwnerId('')
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        changeOwner.reset()

        if (!next) {
          setNewOwnerId('')
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Change team lead
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change team lead</DialogTitle>

          <DialogDescription>
            Select an existing team member to become the
            new team owner.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="new-team-lead">
            New team lead
          </Label>

          {members.isPending && (
            <p className="text-sm text-muted-foreground">
              Loading team members...
            </p>
          )}

          {members.isError && (
            <p role="alert" className="text-sm text-destructive">
              {members.error.message}
            </p>
          )}

          {members.isSuccess && (
            <select
              id="new-team-lead"
              className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={newOwnerId}
              onChange={(event) => {
                setNewOwnerId(event.target.value)
                changeOwner.reset()
              }}
            >
              <option value="">
                Select a member
              </option>

              {candidates.map((member) => (
                <option
                  key={member.user_id}
                  value={member.user_id}
                >
                  {member.email}
                </option>
              ))}
            </select>
          )}

          {members.isSuccess && candidates.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Add another member to this team before
              changing its lead.
            </p>
          )}

          {changeOwner.isError && (
            <p role="alert" className="text-sm text-destructive">
              {changeOwner.error.message}
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
            type="button"
            disabled={!newOwnerId || changeOwner.isPending}
            onClick={() => changeOwner.mutate()}
          >
            {changeOwner.isPending
              ? 'Saving...'
              : 'Change team lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
