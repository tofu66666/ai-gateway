import { apiFetch } from './client'
import type { User } from './types'

export type RegisterResponse = {
  status: string
  user_id: string
  email: string
  email_confirmation_required: boolean
  message: string
}

export type LoginResponse = {
  status: string
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  expires_at: number
  user: User
}

export function register(email: string, password: string) {
  return apiFetch<RegisterResponse>('/register', {
    method: 'POST',
    body: { email, password },
  })
}

export function login(email: string, password: string) {
  return apiFetch<LoginResponse>('/login', {
    method: 'POST',
    body: { email, password },
  })
}

// The signed-in user, from the stored token.
export function getMe() {
  return apiFetch<User>('/me')
}
