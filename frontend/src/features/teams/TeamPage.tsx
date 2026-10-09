import { Users } from 'lucide-react'
import { useParams } from 'react-router'
import { EmptyState } from '@/components/layout/EmptyState'

export function TeamPage() {
  const { teamId } = useParams()

  return (
    <EmptyState icon={Users} title={`Team ${teamId} is not built yet`}>
      Members, key permission and projects of one team.
      <br />
      H18IALMOND-51, -52
    </EmptyState>
  )
}
