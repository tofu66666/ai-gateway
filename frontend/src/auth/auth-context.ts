import { createContext } from 'react'
import type { RegisterResponse } from '@/api/auth'
import type { User } from '@/api/types'

export type AuthState = {
  user: User | null
  // Throws ApiError: 401 wrong email or password, 403 email not confirmed.
  login: (email: string, password: string) => Promise<User>
  // Throws ApiError: 409 email already registered, other 4xx with the server's message.
  register: (email: string, password: string) => Promise<RegisterResponse>
  signOut: () => void
}

export const AuthContext = createContext<AuthState | null>(null)
