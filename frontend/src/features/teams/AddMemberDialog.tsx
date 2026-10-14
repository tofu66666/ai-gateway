import { useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { queryKeys } from '@/api/hooks'
import { saveTeamMember } from '@/api/teams'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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

type AddMemberDialogProps = {
  teamId: string
  // Lower-case emails of the current members, once the list has loaded.
  memberEmails: string[]
}

// H18IALMOND-51: the person needs an account; the backend finds them by email.
export function AddMemberDialog({
  teamId,
  memberEmails,
}: AddMemberDialogProps) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [canCreateKey, setCanCreateKey] = useState(false)
  const queryClient = useQueryClient()
  const trimmed = email.trim()
  const alreadyMember = memberEmails.includes(trimmed.toLowerCase())

  const add = useMutation({
    mutationFn: saveTeamMember,
    onSuccess: (_, change) => {
      toast.success(`${change.email} added to the team`)
      queryClient.invalidateQueries({ queryKey: queryKeys.members(teamId) })
      setOpen(false)
      setEmail('')
      setCanCreateKey(false)
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    add.mutate({
      team_id: teamId,
      email: trimmed,
      can_create_key: canCreateKey,
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        add.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus />
          Add member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
            <DialogDescription>
              Add someone by the email they signed up with.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="member-email">Email</Label>
            <Input
              id="member-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            {alreadyMember && (
              <p className="text-sm text-muted-foreground">
                {trimmed} is already in this team.
              </p>
            )}
          </div>

          <Label className="font-normal">
            <Checkbox
              checked={canCreateKey}
              onCheckedChange={(checked) => setCanCreateKey(checked === true)}
            />
            Can create keys for this team's projects
          </Label>

          {add.isError && (
            <p className="text-sm text-destructive">{add.error.message}</p>
          )}

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
              disabled={add.isPending || !trimmed || alreadyMember}
            >
              {add.isPending ? 'Adding...' : 'Add member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
