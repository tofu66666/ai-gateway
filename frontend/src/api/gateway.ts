// POST /chat/completions with a virtual key. This call does not go through
// apiFetch: the key is not the session token, and a 401 here means a bad key,
// not an expired session.

export type ChatReply = {
  content: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  // Sent once the gateway logs requests (H18IALMOND-10).
  requestId: string | null
}

export class GatewayError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'GatewayError'
    this.status = status
  }
}

type Completion = {
  choices?: { message?: { content?: string } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export async function sendChat(
  virtualKey: string,
  model: string,
  prompt: string,
): Promise<ChatReply> {
  const started = performance.now()
  const response = await fetch(
    new URL('/api/chat/completions', window.location.origin),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${virtualKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
      }),
    },
  )
  const latencyMs = Math.round(performance.now() - started)
  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new GatewayError(
      response.status,
      errorMessage(data) ?? `Request failed (HTTP ${response.status})`,
    )
  }
  const completion = (data ?? {}) as Completion
  return {
    content: completion.choices?.[0]?.message?.content ?? '',
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
    latencyMs,
    requestId: response.headers.get('X-Request-ID'),
  }
}

// The gateway answers {"detail"}; a provider error is {"error": {"message"}},
// sometimes inside a list.
function errorMessage(data: unknown): string | null {
  const body: unknown = Array.isArray(data) ? data[0] : data
  if (typeof body !== 'object' || body === null) {
    return null
  }
  if ('detail' in body && typeof body.detail === 'string') {
    return body.detail
  }
  if (
    'error' in body &&
    typeof body.error === 'object' &&
    body.error !== null &&
    'message' in body.error &&
    typeof body.error.message === 'string'
  ) {
    return body.error.message
  }
  return null
}
