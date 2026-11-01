import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { queryKeys, useTeamMembers } from '@/api/hooks'
import { removeTeamMember, saveTeamMember, type TeamMember } from '@/api/teams'
import { ErrorState } from '@/components/layout/ErrorState'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
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
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AddMemberDialog } from './AddMemberDialog'
import { useCanManageTeam } from './useCanManageTeam'

type PermissionChange = { member: TeamMember; canCreateKey: boolean }

// H18IALMOND-51: the team lead (or an admin) decides who is in the team and
// who may create keys.
export function MembersCard({ teamId }: { teamId: string }) {
  const members = useTeamMembers(teamId)
  const queryClient = useQueryClient()
  const canManage = useCanManageTeam(teamId)

  const permission = useMutation({
    mutationFn: ({ member, canCreateKey }: PermissionChange) =>
      saveTeamMember({
        team_id: teamId,
        user_id: member.user_id,
        can_create_key: canCreateKey,
      }),
    onSuccess: (_, { member, canCreateKey }) => {
      toast.success(
        canCreateKey
          ? `${member.email} can now create keys`
          : `${member.email} can no longer create keys`,
      )
      return queryClient.invalidateQueries({
        queryKey: queryKeys.members(teamId),
      })
    },
    onError: (error) => toast.error(error.message),
  })
  // Show the new position while it is being saved.
  const saving = permission.isPending ? permission.variables : undefined

  const remove = useMutation({
    mutationFn: (member: TeamMember) =>
      removeTeamMember(teamId, member.user_id),
    onSuccess: (_, member) => {
      toast.success(`${member.email} removed from the team`)
      return queryClient.invalidateQueries({
        queryKey: queryKeys.members(teamId),
      })
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>
          Who is in this team, and who may create keys for its projects.
        </CardDescription>
        {canManage && (
          <CardAction>
            <AddMemberDialog
              teamId={teamId}
              memberEmails={
                members.data?.map((member) => member.email.toLowerCase()) ?? []
              }
            />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {members.isPending && (
          <p className="text-sm text-muted-foreground">Loading members...</p>
        )}
        {members.isError && (
          <ErrorState title="Couldn't load the members" error={members.error} />
        )}
        {members.data?.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No members in this team yet.
          </p>
        )}
        {members.data && members.data.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead className="whitespace-normal">
                  Can create keys
                </TableHead>
                {canManage && (
                  <TableHead className="w-12">
                    <span className="sr-only">Remove</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data.map((member) => (
                <TableRow key={member.user_id}>
                  {/* Wraps on a phone, so Remove stays on screen. */}
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium break-all">
                        {member.email}
                      </span>
                      {member.is_owner && (
                        <Badge variant="secondary">Team lead</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      aria-label={`${member.email} can create keys`}
                      checked={
                        saving?.member.user_id === member.user_id
                          ? saving.canCreateKey
                          : member.can_create_key
                      }
                      disabled={
                        !canManage || member.is_owner || permission.isPending
                      }
                      onCheckedChange={(checked) =>
                        permission.mutate({ member, canCreateKey: checked })
                      }
                    />
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      {!member.is_owner && (
                        <RemoveButton
                          email={member.email}
                          disabled={remove.isPending}
                          onConfirm={() => remove.mutate(member)}
                        />
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

type RemoveButtonProps = {
  email: string
  disabled: boolean
  onConfirm: () => void
}

function RemoveButton({ email, disabled, onConfirm }: RemoveButtonProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${email}`}
          disabled={disabled}
        >
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {email}?</AlertDialogTitle>
          <AlertDialogDescription>
            They will no longer see this team or be able to create keys for its
            projects.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
