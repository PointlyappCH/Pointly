import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { signIn } = useAuth()
  const nav = useNavigate()
  const [email, setEmail]   = useState('')
  const [pwd,   setPwd]     = useState('')
  const [err,   setErr]     = useState('')
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

  return (
    <div className="login-bg" style={{width:'100%'}}>
      <div style={{width:'56px',height:'56px',borderRadius:'18px',background:'rgba(255,255,255,.12)',backdropFilter:'blur(20px)',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:'14px',border:'1px solid rgba(255,255,255,.15)'}}>
        <i className="ti ti-clock-check" style={{fontSize:'28px',color:'#fff'}}/>
      </div>
      <div style={{fontSize:'32px',fontWeight:'800',color:'#fff',marginBottom:'4px',letterSpacing:'-.02em'}}>Pointly</div>
      <div style={{fontSize:'14px',color:'rgba(255,255,255,.5)',marginBottom:'36px'}}>Planning & pointage d'équipe</div>

      <form className="login-card" onSubmit={handleLogin} style={{width:'100%'}}>
        <div style={{fontSize:'14px',fontWeight:'700',color:'rgba(255,255,255,.8)',marginBottom:'14px'}}>Se connecter</div>
        {err && <div style={{background:'rgba(255,50,50,.15)',border:'1px solid rgba(255,100,100,.3)',borderRadius:'10px',padding:'10px 14px',fontSize:'13px',color:'#FF8080',marginBottom:'10px'}}>{err}</div>}
        <input className="li" placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/>
        <input className="li" placeholder="Mot de passe" type="password" value={pwd} onChange={e=>setPwd(e.target.value)} required/>
        <button className="lb lb-a" type="submit" disabled={loading}>
          {loading ? <span className="spinner" style={{width:'18px',height:'18px',borderWidth:'2px',borderColor:'var(--border)',borderTopColor:'var(--accent)'}}/>
                   : <><i className="ti ti-login" style={{fontSize:'18px'}}/>Se connecter</>}
        </button>
      </form>

      <div style={{display:'flex',alignItems:'center',gap:'10px',width:'100%',marginBottom:'16px'}}>
        <div style={{flex:1,height:'1px',background:'rgba(255,255,255,.1)'}}/>
        <div style={{fontSize:'12px',color:'rgba(255,255,255,.3)'}}>pas encore de compte ?</div>
        <div style={{flex:1,height:'1px',background:'rgba(255,255,255,.1)'}}/>
      </div>
      <Link to="/register" style={{textDecoration:'none',width:'100%'}}>
        <button className="lb lb-e" style={{width:'100%'}}>
          <i className="ti ti-building" style={{fontSize:'18px'}}/>Créer mon entreprise
        </button>
      </Link>
      <div style={{marginTop:'16px',fontSize:'12px',color:'rgba(255,255,255,.3)',textAlign:'center'}}>
        Version beta · Données sécurisées Supabase
      </div>
    </div>
  )
}
