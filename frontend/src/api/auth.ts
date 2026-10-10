export type RegisterResponse = {
  status: string
  user_id: string
  email: string
  email_confirmation_required: boolean
  message: string
}

export type LoginResponse = {
  status: string
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  expires_at: number
  user: {
    id: string
    email: string
    role: string
  }
}

export async function register(
  email: string,
  password: string,
): Promise<RegisterResponse> {
  const response = await fetch('/api/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.message || `Registration failed (${response.status})`)
  }

  return data
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const response = await fetch('/api/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.message || `Login failed (${response.status})`)
  }

  return data
}