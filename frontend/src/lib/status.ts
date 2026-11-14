// How a state reads at a glance: fine, refused or limited, failed, or idle.
export type Tone = 'success' | 'warning' | 'error' | 'neutral'

// HTTP status of a gateway request: 2xx answered, 4xx refused (key, budget,
// rate limit) or stopped by the client, anything else failed.
export function httpTone(status: string | number): Tone {
  const code = Number(status)
  if (code >= 200 && code < 300) return 'success'
  if (code >= 400 && code < 500) return 'warning'
  return 'error'
}
