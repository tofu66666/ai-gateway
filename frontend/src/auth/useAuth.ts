import { useContext } from 'react'
import { AuthContext } from './auth-context'

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return auth
}

// For pages behind RequireAuth, where someone is always signed in.
export function useCurrentUser() {
  const { user } = useAuth()
  if (!user) {
    throw new Error('useCurrentUser must be used behind RequireAuth')
  }
  return user
}
