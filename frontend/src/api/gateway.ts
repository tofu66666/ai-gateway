// POST /chat/completions with a virtual key. This call does not go through
// apiFetch: the key is not the session token, and a 401 here means a bad key,
// not an expired session.

export type ChatReply = {
  content: string
  // null when the gateway reported no usage, as when a stream is stopped.
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
  // Streams only: how long the first piece of the answer took.
  firstTokenMs: number | null
  // Streams only: Stop was pressed before the end.
  stopped: boolean
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

type Usage = { prompt_tokens?: number; completion_tokens?: number }

type Completion = {
  choices?: { message?: { content?: string } }[]
  usage?: Usage
}

// One event of a stream (H18IALMOND-21). The last one before [DONE] has no
// choices, only usage; a provider failure mid-stream arrives as {"error"}.
type StreamChunk = {
  choices?: { delta?: { content?: string | null } }[]
  usage?: Usage | null
  error?: { message?: string }
}

export async function sendChat(
  virtualKey: string,
  model: string,
  prompt: string,
): Promise<ChatReply> {
  const started = performance.now()
  const response = await postChat(virtualKey, {
    model,
    messages: [{ role: 'user', content: prompt }],
  })
  const latencyMs = Math.round(performance.now() - started)
  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw gatewayError(response.status, data)
  }
  const completion = (data ?? {}) as Completion
  return {
    content: completion.choices?.[0]?.message?.content ?? '',
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
    latencyMs,
    firstTokenMs: null,
    stopped: false,
    requestId: response.headers.get('X-Request-ID'),
  }
}

// The same call with stream: true. onText gets the whole answer so far each
// time a piece arrives; aborting the signal (Stop) keeps what has arrived.
export async function streamChat(
  virtualKey: string,
  model: string,
  prompt: string,
  { onText, signal }: { onText: (text: string) => void; signal: AbortSignal },
): Promise<ChatReply> {
  const started = performance.now()
  let text = ''
  let usage: Usage | null = null
  let firstTokenMs: number | null = null
  let requestId: string | null = null
  try {
    const response = await postChat(
      virtualKey,
      {
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        // Without this the gateway keeps the token counts to itself.
        stream_options: { include_usage: true },
      },
      signal,
    )
    requestId = response.headers.get('X-Request-ID')
    if (!response.ok || !response.body) {
      // Refused before the stream started: a normal JSON error.
      const data: unknown = await response.json().catch(() => null)
      throw gatewayError(response.status, data)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      // Each event ends with a newline; the last piece may be half a line.
      const lines = buffer.split('\n')
      buffer = done ? '' : (lines.pop() ?? '')
      for (const line of lines) {
        const chunk = parseEvent(line)
        if (chunk?.error) {
          throw new GatewayError(
            502,
            chunk.error.message ?? 'The provider failed during the answer',
          )
        }
        const piece = chunk?.choices?.[0]?.delta?.content
        if (piece) {
          firstTokenMs ??= Math.round(performance.now() - started)
          text += piece
          onText(text)
        }
        if (chunk?.usage) {
          usage = chunk.usage
        }
      }
      if (done) {
        break
      }
    }
  } catch (error) {
    if (!signal.aborted) {
      throw error
    }
  }
  return {
    content: text,
    inputTokens: usage?.prompt_tokens ?? null,
    outputTokens: usage?.completion_tokens ?? null,
    latencyMs: Math.round(performance.now() - started),
    firstTokenMs,
    stopped: signal.aborted,
    requestId,
  }
}

function postChat(virtualKey: string, body: object, signal?: AbortSignal) {
  return fetch(new URL('/api/chat/completions', window.location.origin), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${virtualKey}`,
    },
    body: JSON.stringify(body),
    signal,
  })
}

// "data: {...}" lines carry the chunks; blank lines, comments and the closing
// "data: [DONE]" carry none.
function parseEvent(line: string): StreamChunk | null {
  if (!line.startsWith('data:')) {
    return null
  }
  const data = line.slice('data:'.length).trim()
  if (data === '[DONE]') {
    return null
  }
  try {
    return JSON.parse(data) as StreamChunk
  } catch {
    return null
  }
}

function gatewayError(status: number, data: unknown) {
  return new GatewayError(
    status,
    errorMessage(data) ?? `Request failed (HTTP ${status})`,
  )
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
