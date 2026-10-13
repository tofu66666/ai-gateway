import type { User } from './types'

export type Session = {
  accessToken: string
  // Seconds since the epoch, as /login returns it.
  expiresAt: number
  user: User
}

const storageKey = 'p127.session'
let current: Session | null = readStored()

function readStored(): Session | null {
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

// The signed-in session, or null when there is none or its token has expired.
export function getSession(): Session | null {
  if (current && current.expiresAt * 1000 <= Date.now()) {
    clearSession()
  }
  return current
}

export function saveSession(session: Session) {
  current = session
  try {
    localStorage.setItem(storageKey, JSON.stringify(session))
  } catch {
    // Storage is blocked: the session still works until the page reloads.
  }
}

export function clearSession() {
  current = null
  try {
    localStorage.removeItem(storageKey)
  } catch {
    // Nothing to remove.
  }
}
