import { useEffect, useState } from 'react'
import { getHealth, type Health } from '@/api/health'
import { cn } from '@/lib/utils'

// A line under the sign-in card, only when the gateway is not ready: a
// working gateway needs no message.
export function BackendStatus({ className }: { className?: string }) {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((err: unknown) => setError(String(err)))
  }, [])

  let problem: string | null = null
  if (error || (health && health.status !== 'ok')) {
    problem = "The gateway isn't ready right now, so signing in may fail."
  } else if (health?.database_configured === false) {
    problem = 'The gateway has no database set up, so signing in may fail.'
  }
  if (!problem) {
    return null
  }

  // The raw reason is in the tooltip, for whoever runs the backend.
  return (
    <p
      role="status"
      title={error ?? health?.status}
      className={cn('text-xs text-destructive', className)}
    >
      {problem}
    </p>
  )
}
