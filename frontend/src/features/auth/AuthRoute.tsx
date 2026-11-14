import { Navigate, useLocation } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import AuthPage from '@/components/AuthPage'
import { BackendStatus } from '@/components/layout/BackendStatus'

// Austin's sign-in card, with a line under it when the backend is not ready.
export function AuthRoute() {
  const { user } = useAuth()
  const location = useLocation()

  // A signed-in person goes on to the page they asked for.
  if (user) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? '/'} replace />
  }

  const page = location.pathname === '/register' ? 'Create account' : 'Sign in'

  return (
    <>
      <title>{`${page} · AI Gateway`}</title>
      <AuthPage />
      <BackendStatus className="fixed inset-x-0 bottom-3 px-4 text-center" />
    </>
  )
}
