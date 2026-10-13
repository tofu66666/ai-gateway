import { clearSession, getSession } from './session'

export class ApiError extends Error {
  status: number
  // The call that failed, such as "GET /projects", so an error is easy to report.
  request: string

  constructor(status: number, message: string, request: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.request = request
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
}

let onSessionExpired = () => {}

// AuthProvider sets this, so a rejected token signs the person out.
export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler
}

// Every backend call goes through /api. nginx (in Docker) or the Vite dev
// server forwards it to the gateway and strips the prefix.
export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const method = options.method ?? 'GET'
  const token = getSession()?.accessToken
  const headers: Record<string, string> = {}
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(new URL(`/api${path}`, window.location.origin), {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const data = await readJson(response)

  if (!response.ok) {
    const message =
      errorMessage(data) ?? `Request failed (HTTP ${response.status})`
    // The team, project and models routes answer 403 "Invalid token".
    const rejected =
      response.status === 401 ||
      (response.status === 403 && message === 'Invalid token')
    if (token && rejected) {
      clearSession()
      onSessionExpired()
    }
    throw new ApiError(response.status, message, `${method} ${path}`)
  }
  return data as T
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// Route code answers {"message"}; FastAPI answers {"detail"}, a list for 422.
function errorMessage(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) {
    return null
  }
  if ('message' in data && typeof data.message === 'string') {
    return data.message
  }
  if ('detail' in data) {
    if (typeof data.detail === 'string') {
      return data.detail
    }
    if (Array.isArray(data.detail)) {
      const first: unknown = data.detail[0]
      if (
        typeof first === 'object' &&
        first !== null &&
        'msg' in first &&
        typeof first.msg === 'string'
      ) {
        return first.msg
      }
    }
  }
  return null
}
