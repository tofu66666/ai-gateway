import { useQueryClient } from '@tanstack/react-query'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import * as authApi from '@/api/auth'
import { setSessionExpiredHandler } from '@/api/client'
import { clearSession, getSession, saveSession } from '@/api/session'
import { AuthContext, type AuthState } from './auth-context'

// RequireAuth does the redirect when the user goes, so only one place navigates.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState(() => getSession()?.user ?? null)
  const [endedBy, setEndedBy] = useState<AuthState['endedBy']>(null)
  const queryClient = useQueryClient()

  const endSession = useCallback(
    (reason: 'expiry' | 'sign-out') => {
      clearSession()
      queryClient.clear()
      setEndedBy(reason)
      setUser(null)
    },
    [queryClient],
  )

  // apiFetch calls this when the backend rejects the stored token.
  useEffect(() => {
    setSessionExpiredHandler(() => endSession('expiry'))
    return () => setSessionExpiredHandler(() => {})
  }, [endSession])

  // Supabase tokens last an hour; sign out when this one does.
  useEffect(() => {
    const expiresAt = user ? getSession()?.expiresAt : undefined
    if (!expiresAt) {
      return
    }
    const timer = window.setTimeout(
      () => endSession('expiry'),
      expiresAt * 1000 - Date.now(),
    )
    return () => window.clearTimeout(timer)
  }, [user, endSession])

  // After a reload, check the stored token and pick up a changed role.
  useEffect(() => {
    const session = getSession()
    if (!session) {
      return
    }
    authApi
      .getMe()
      .then((me) => {
        if (getSession()?.accessToken === session.accessToken) {
          saveSession({ ...session, user: me })
          setUser(me)
        }
      })
      .catch(() => {
        // A rejected token has signed the person out already; other errors keep the session.
      })
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password)
    saveSession({
      accessToken: result.access_token,
      expiresAt: result.expires_at,
      user: result.user,
    })
    setEndedBy(null)
    setUser(result.user)
    return result.user
  }, [])

  const signOut = useCallback(() => endSession('sign-out'), [endSession])

  const value = useMemo<AuthState>(
    () => ({ user, endedBy, login, register: authApi.register, signOut }),
    [user, endedBy, login, signOut],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
