import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const email = username.includes('@') ? username : username.toLowerCase() + '@invibe.it'
      await signIn(email, password)
      navigate('/')
    } catch {
      setError('Username o password errati.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '32px 24px', maxWidth: 420, width: '100%', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <img src="/logo_login.png" alt="Invibe" style={{ height: 110, objectFit: 'contain', marginBottom: 14 }} />
        <div className="rollsign" style={{ borderRadius: 'var(--r-md)', justifyContent: 'center' }}>Bus · Transfer 2026</div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label className="input-label" htmlFor="u">Username</label>
          <input id="u" className="input-field" type="text" placeholder="nomecognome" value={username}
            onChange={e => setUsername(e.target.value)} required autoCapitalize="none" autoCorrect="off" />
        </div>
        <div>
          <label className="input-label" htmlFor="p">Password</label>
          <input id="p" className="input-field" type="password" value={password}
            onChange={e => setPassword(e.target.value)} required />
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Accesso…' : 'Entra'}
        </button>
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center' }}>
          Stesse credenziali della Staff App
        </div>
      </form>
    </div>
  )
}
