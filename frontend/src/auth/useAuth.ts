import type { User } from '@/api/types'

// Placeholder until foundation MR 2 adds AuthProvider, /login and /me.
const devUser: User = { id: 'dev', email: 'dev@example.com', role: 'admin' }

export function useAuth() {
  return {
    user: devUser,
    signOut: () => {},
  }
}
