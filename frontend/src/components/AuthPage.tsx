import { useState } from 'react'

function AuthPage() {
  const [isRegister, setIsRegister] = useState(false)

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

        <form className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
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
                required
              />
            </div>
          )}

          <button className="primary-button" type="submit">
            {isRegister ? 'Create Account' : 'Sign In'}
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
            onClick={() => setIsRegister(!isRegister)}
          >
            {isRegister ? 'Sign In' : 'Register'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AuthPage