import { useEffect, useState } from 'react'
import { getHealth, type Health } from './api'

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
    <main>
      <h1>P127 AI Gateway</h1>
      <p>Dashboard skeleton. Usage, keys, teams and the playground will be built here.</p>
      <p>Backend: {status}</p>
    </main>
  )
}

export default App
