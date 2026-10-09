import { useEffect, useState } from 'react'
import { getHealth, type Health } from '@/api/health'
import { cn } from '@/lib/utils'

export function BackendStatus({ className }: { className?: string }) {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((err: unknown) => setError(String(err)))
  }, [])

  let status = 'checking...'
  if (error) {
    status = `unreachable (${error})`
  } else if (health) {
    const database = health.database_configured ? 'set' : 'not set'
    status = `${health.status} (env: ${health.env}, database URL ${database})`
  }

  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      Backend: {status}
    </p>
  )
}
