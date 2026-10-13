import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryKeys, useTeamMembers } from '@/api/hooks'
import { saveTeamMember, type TeamMember } from '@/api/teams'
import { useCurrentUser } from '@/auth/useAuth'
import { ErrorState } from '@/components/layout/ErrorState'
import { Badge } from '@/components/ui/badge'
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

type PermissionChange = { member: TeamMember; canCreateKey: boolean }

// H18IALMOND-51: the team lead (or an admin) decides who is in the team and
// who may create keys.
export function MembersCard({ teamId }: { teamId: string }) {
  const user = useCurrentUser()
  const members = useTeamMembers(teamId)
  const queryClient = useQueryClient()
  const canManage =
    user.role === 'admin' ||
    members.data?.some(
      (member) => member.is_owner && member.user_id === user.id,
    ) === true

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>
          Who is in this team, and who may create keys for its projects.
        </CardDescription>
        <CardAction>
          <AddMemberDialog
            teamId={teamId}
            memberEmails={
              members.data?.map((member) => member.email.toLowerCase()) ?? []
            }
          />
        </CardAction>
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
                <TableHead>Can create keys</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data.map((member) => (
                <TableRow key={member.user_id}>
                  <TableCell>
                    <span className="font-medium">{member.email}</span>
                    {member.is_owner && (
                      <Badge variant="secondary" className="ml-2">
                        Team lead
                      </Badge>
                    )}
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
