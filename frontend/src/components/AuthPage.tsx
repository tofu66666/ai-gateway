import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4 sm:p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="justify-items-center text-center">
          <Logo className="mb-2 size-10" />
          <h1 className="text-2xl font-semibold">AI Gateway</h1>
          <CardDescription>
            {isRegister
              ? 'Create your account to get started'
              : 'Sign in to access your AI Gateway'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>

              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="Enter your email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>

              <Input
                id="password"
                type="password"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            {isRegister && (
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>

                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
            )}

            {expired && !error && (
              <p className="text-sm text-destructive">
                Your session has expired. Please sign in again.
              </p>
            )}

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            {message && <p className="text-sm text-success">{message}</p>}

            <Button className="w-full" type="submit" disabled={loading}>
              {loading
                ? 'Please wait...'
                : isRegister
                  ? 'Create account'
                  : 'Sign in'}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center gap-1 text-muted-foreground">
          <span>
            {isRegister
              ? 'Already have an account?'
              : "Don't have an account?"}
          </span>

          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            onClick={switchMode}
          >
            {isRegister ? 'Sign in' : 'Register'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

export default AuthPage