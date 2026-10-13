import { Navigate, useLocation } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import AuthPage from '@/components/AuthPage'
import { BackendStatus } from '@/components/layout/BackendStatus'

// Austin's sign-in card with the backend health line under it.
export function AuthRoute() {
  const { user } = useAuth()
  const location = useLocation()

  // A signed-in person goes on to the page they asked for.
  if (user) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? '/'} replace />
  }

  return (
    <>
      <AuthPage />
      <BackendStatus className="backend-status" />
    </>
  )
}
