export type Health = {
  status: string
  env: string
  database_configured: boolean
}

// Every backend call goes through /api. nginx (in Docker) or the Vite dev
// server forwards it to the gateway and strips the /api prefix.
export async function getHealth(): Promise<Health> {
  const response = await fetch('/api/health')
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.json()
}
