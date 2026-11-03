import { useTeamMembers } from '@/api/hooks'
import { useCurrentUser } from '@/auth/useAuth'

// Admins and the team's lead may change a team: its members, who may create
// keys, and its projects. The backend refuses anyone else, so nobody else is
// offered the buttons.
export function useCanManageTeam(teamId: string) {
  const user = useCurrentUser()
  const members = useTeamMembers(teamId)
  return (
    user.role === 'admin' ||
    members.data?.some(
      (member) => member.is_owner && member.user_id === user.id,
    ) === true
  )
}
