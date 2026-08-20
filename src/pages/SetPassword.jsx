import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase' // adapte le chemin selon ton projet

export default function SetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères.')
      return
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }

    setLoading(true)
    // Le lien d'invitation Supabase a déjà ouvert une session temporaire à l'arrivée sur cette page
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateErr) {
      setError(updateErr.message)
      return
    }

    navigate('/') // redirige vers l'accueil employé/admin selon le rôle
  }

  return (
    <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="card" style={{ maxWidth: '360px', width: '100%', padding: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>Bienvenue sur Pointly</h1>
        <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '20px' }}>
          Choisis un mot de passe pour accéder à ton compte.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: '12px', borderRadius: 'var(--rs)', border: '1px solid var(--border)', marginBottom: '10px' }}
            autoFocus
          />
          <input
            type="password"
            placeholder="Confirme le mot de passe"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={{ width: '100%', padding: '12px', borderRadius: 'var(--rs)', border: '1px solid var(--border)', marginBottom: '10px' }}
          />

          {error && <div style={{ color: 'var(--red)', fontSize: '13px', marginBottom: '10px' }}>{error}</div>}

          <button type="submit" className="btn" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Un instant…' : 'Créer mon compte'}
          </button>
        </form>
      </div>
    </div>
  )
}
