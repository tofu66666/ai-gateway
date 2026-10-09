import AuthPage from '@/components/AuthPage'
import { BackendStatus } from '@/components/layout/BackendStatus'

// Austin's card from !5 with the backend health line under it, as on main
// before the router. H18IALMOND-16 wires the form.
export function AuthRoute() {
  return (
    <>
      <AuthPage />
      <BackendStatus className="backend-status" />
    </>
  )
}
