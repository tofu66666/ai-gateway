import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './useAuth'

export function RequireAuth() {
  const { user, endedBy } = useAuth()
  const location = useLocation()

  if (!user) {
    // Come back here after signing in, unless the person signed out on purpose.
    const state = endedBy === 'sign-out' ? null : { from: location.pathname }
    return (
      <Navigate
        to={endedBy === 'expiry' ? '/login?expired=1' : '/login'}
        replace
        state={state}
      />
    )
  }
  return <Outlet />
}
