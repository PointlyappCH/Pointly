import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function Login() {
  const { signIn } = useAuth()
  const nav = useNavigate()
  const [mode, setMode] = useState('login') // 'login' | 'forgot'
  const [email, setEmail]   = useState('')
  const [pwd,   setPwd]     = useState('')
  const [err,   setErr]     = useState('')
  const [info,  setInfo]    = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setErr(''); setLoading(true)
    try {
      await signIn(email, pwd)
      nav('/')
    } catch (e) {
      setErr('Email ou mot de passe incorrect')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgot(e) {
    e.preventDefault()
    setErr(''); setInfo(''); setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/set-password`,
      })
      if (error) throw error
      setInfo('Si un compte existe avec cet email, un lien de réinitialisation vient d\'être envoyé.')
    } catch (e) {
      // Message volontairement générique : on ne confirme pas si l'email existe ou non
      setInfo('Si un compte existe avec cet email, un lien de réinitialisation vient d\'être envoyé.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-bg" style={{width:'100%'}}>
      <div style={{width:'56px',height:'56px',borderRadius:'18px',background:'rgba(255,255,255,.12)',backdropFilter:'blur(20px)',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:'14px',border:'1px solid rgba(255,255,255,.15)'}}>
        <i className="ti ti-clock-check" style={{fontSize:'28px',color:'#fff'}}/>
      </div>
      <div style={{fontSize:'32px',fontWeight:'800',color:'#fff',marginBottom:'4px',letterSpacing:'-.02em'}}>Pointly</div>
      <div style={{fontSize:'14px',color:'rgba(255,255,255,.5)',marginBottom:'36px'}}>Planning & pointage d'équipe</div>

      {mode === 'login' && (
        <form className="login-card" onSubmit={handleLogin} style={{width:'100%'}}>
          <div style={{fontSize:'14px',fontWeight:'700',color:'rgba(255,255,255,.8)',marginBottom:'14px'}}>Se connecter</div>
          {err && <div style={{background:'rgba(255,50,50,.15)',border:'1px solid rgba(255,100,100,.3)',borderRadius:'10px',padding:'10px 14px',fontSize:'13px',color:'#FF8080',marginBottom:'10px'}}>{err}</div>}
          <input className="li" placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/>
          <input className="li" placeholder="Mot de passe" type="password" value={pwd} onChange={e=>setPwd(e.target.value)} required/>
          <button className="lb lb-a" type="submit" disabled={loading}>
            {loading ? <span className="spinner" style={{width:'18px',height:'18px',borderWidth:'2px',borderColor:'var(--border)',borderTopColor:'var(--accent)'}}/>
                     : <><i className="ti ti-login" style={{fontSize:'18px'}}/>Se connecter</>}
          </button>
          <div
            onClick={() => { setMode('forgot'); setErr(''); setInfo('') }}
            style={{textAlign:'center',fontSize:'12px',color:'rgba(255,255,255,.5)',marginTop:'14px',cursor:'pointer'}}
          >
            Mot de passe oublié ?
          </div>
        </form>
      )}

      {mode === 'forgot' && (
        <form className="login-card" onSubmit={handleForgot} style={{width:'100%'}}>
          <div style={{fontSize:'14px',fontWeight:'700',color:'rgba(255,255,255,.8)',marginBottom:'6px'}}>Mot de passe oublié</div>
          <div style={{fontSize:'12px',color:'rgba(255,255,255,.4)',marginBottom:'14px'}}>
            Indique ton email, on t'envoie un lien pour en choisir un nouveau.
          </div>
          {info && <div style={{background:'rgba(80,200,120,.12)',border:'1px solid rgba(80,200,120,.3)',borderRadius:'10px',padding:'10px 14px',fontSize:'13px',color:'#7EDDA0',marginBottom:'10px'}}>{info}</div>}
          {err && <div style={{background:'rgba(255,50,50,.15)',border:'1px solid rgba(255,100,100,.3)',borderRadius:'10px',padding:'10px 14px',fontSize:'13px',color:'#FF8080',marginBottom:'10px'}}>{err}</div>}
          <input className="li" placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/>
          <button className="lb lb-a" type="submit" disabled={loading}>
            {loading ? <span className="spinner" style={{width:'18px',height:'18px',borderWidth:'2px',borderColor:'var(--border)',borderTopColor:'var(--accent)'}}/>
                     : <><i className="ti ti-send" style={{fontSize:'18px'}}/>Envoyer le lien</>}
          </button>
          <div
            onClick={() => { setMode('login'); setErr(''); setInfo('') }}
            style={{textAlign:'center',fontSize:'12px',color:'rgba(255,255,255,.5)',marginTop:'14px',cursor:'pointer'}}
          >
            ← Retour à la connexion
          </div>
        </form>
      )}

      {mode === 'login' && (
        <>
          <div style={{display:'flex',alignItems:'center',gap:'10px',width:'100%',marginBottom:'16px',marginTop:'16px'}}>
            <div style={{flex:1,height:'1px',background:'rgba(255,255,255,.1)'}}/>
            <div style={{fontSize:'12px',color:'rgba(255,255,255,.3)'}}>pas encore de compte ?</div>
            <div style={{flex:1,height:'1px',background:'rgba(255,255,255,.1)'}}/>
          </div>
          <Link to="/register" style={{textDecoration:'none',width:'100%'}}>
            <button className="lb lb-e" style={{width:'100%'}}>
              <i className="ti ti-building" style={{fontSize:'18px'}}/>Créer mon entreprise
            </button>
          </Link>
        </>
      )}

      <div style={{marginTop:'16px',fontSize:'12px',color:'rgba(255,255,255,.3)',textAlign:'center'}}>
        Version beta · Données sécurisées Supabase
      </div>
    </div>
  )
}
