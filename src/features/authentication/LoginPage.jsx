import { useState } from 'react'
import './LoginPage.css'
import { useAuth } from '../../context/AuthContext'

export default function LoginPage() {
  const { signIn, authError, loading } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [working, setWorking] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()

    setWorking(true)

    await signIn(email, password)

    setWorking(false)
  }

  return (
    <div className="login-page">
      <div className="login-card">

        <h1>GBL OS</h1>

        <p className="subtitle">
          Galveston Boat Lifts Operating System
        </p>

        <form onSubmit={handleSubmit}>

          <label>Email</label>

          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            required
          />

          <label>Password</label>

          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
          />

          <div className="checkbox-row">
            <label>
              <input
                type="checkbox"
                checked={showPassword}
                onChange={() =>
                  setShowPassword(!showPassword)
                }
              />

              Show Password
            </label>
          </div>

          {authError && (
            <div className="login-error">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={working || loading}
          >
            {working ? 'Signing In...' : 'Sign In'}
          </button>

        </form>

      </div>
    </div>
  )
}