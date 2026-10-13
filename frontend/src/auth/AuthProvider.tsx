import { useQueryClient } from '@tanstack/react-query'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router'
import * as authApi from '@/api/auth'
import { setSessionExpiredHandler } from '@/api/client'
import { clearSession, getSession, saveSession } from '@/api/session'
import { AuthContext, type AuthState } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState(() => getSession()?.user ?? null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // apiFetch calls this when the backend rejects the stored token.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      queryClient.clear()
      setUser(null)
      navigate('/login?expired=1', { replace: true })
    })
    return () => setSessionExpiredHandler(() => {})
  }, [navigate, queryClient])

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password)
    saveSession({
      accessToken: result.access_token,
      expiresAt: result.expires_at,
      user: result.user,
    })
    setUser(result.user)
    return result.user
  }, [])

  const signOut = useCallback(() => {
    clearSession()
    queryClient.clear()
    setUser(null)
  }, [queryClient])

  const value = useMemo<AuthState>(
    () => ({ user, login, register: authApi.register, signOut }),
    [user, login, signOut],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
