import { ShieldX } from 'lucide-react'
import { Link, Outlet } from 'react-router'
import type { Role } from '@/api/types'
import { EmptyState } from '@/components/layout/EmptyState'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from './useAuth'

export function RequireRole({ roles }: { roles: Role[] }) {
  const user = useCurrentUser()

  if (!roles.includes(user.role)) {
    return (
      <EmptyState icon={ShieldX} title="You don't have access to this page">
        <Button asChild variant="link">
          <Link to="/overview">Back to Overview</Link>
        </Button>
      </EmptyState>
    )
  }
  return <Outlet />
}
