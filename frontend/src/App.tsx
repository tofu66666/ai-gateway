import { useEffect, useState } from 'react'
import { getHealth, type Health } from './api'
import AuthPage from './components/AuthPage'

function App() {
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
    <>
      <AuthPage />

      <p className="backend-status">
        Backend: {status}
      </p>
    </>
  )
}

export default App