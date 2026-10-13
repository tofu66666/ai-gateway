import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth'

function AuthPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { login, register } = useAuth()

  const isRegister = location.pathname === '/register'
  const expired = new URLSearchParams(location.search).has('expired')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setError('')
    setMessage('')

    if (isRegister && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    try {
      setLoading(true)

      if (isRegister) {
        const result = await register(email, password)

        setMessage(result.message)

        setPassword('')
        setConfirmPassword('')
      } else {
        // AuthRoute then moves the person on to the page they asked for.
        await login(email, password)
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isRegister
            ? 'Registration failed. Please try again.'
            : 'Login failed. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  function switchMode() {
    setError('')
    setMessage('')
    setPassword('')
    setConfirmPassword('')

    navigate(isRegister ? '/login' : '/register')
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1>AI Gateway</h1>

          <p>
            {isRegister
              ? 'Create your account to get started'
              : 'Sign in to access your AI Gateway'}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>

            <input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>

            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {isRegister && (
            <div className="form-group">
              <label htmlFor="confirm-password">Confirm Password</label>

              <input
                id="confirm-password"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>
          )}

          {expired && !error && (
            <p className="auth-error text-sm text-destructive">
              Your session has expired. Please sign in again.
            </p>
          )}

          {error && <p className="auth-error text-sm text-destructive">{error}</p>}

          {message && <p className="auth-success text-sm text-success">{message}</p>}

          <button
            className="primary-button"
            type="submit"
            disabled={loading}
          >
            {loading
              ? 'Please wait...'
              : isRegister
                ? 'Create Account'
                : 'Sign In'}
          </button>
        </form>

        <div className="auth-switch">
          <span>
            {isRegister
              ? 'Already have an account?'
              : "Don't have an account?"}
          </span>

          <button
            type="button"
            className="link-button"
            onClick={switchMode}
          >
            {isRegister ? 'Sign In' : 'Register'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AuthPage