import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Register() {
  const { registerCompany } = useAuth()
  const nav = useNavigate()
  const [step, setStep] = useState(1)
  const [err, setErr]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sector, setSector] = useState('Restauration')
  const [pauseMode, setPauseMode] = useState('managed')
  const [form, setForm] = useState({ companyName:'', fullName:'', email:'', password:'', password2:'' })

  function set(k) { return e => setForm(f=>({...f,[k]:e.target.value})) }

  async function handleSubmit(e) {
    e.preventDefault()
    setErr('')
    if (form.password !== form.password2) { setErr('Les mots de passe ne correspondent pas'); return }
    if (form.password.length < 6) { setErr('Mot de passe trop court (min 6 caractères)'); return }
    setLoading(true)
    try {
      await registerCompany({ ...form, sector, pauseMode })
      nav('/')
    } catch (e) {
      setErr(e.message || 'Erreur lors de la création du compte')
    } finally {
      setLoading(false)
    }
  }

  const sectors = [
    {k:'Restauration',icon:'🍳'},{k:'Commerce',icon:'🛍️'},
    {k:'Loisirs',icon:'🎡'},{k:'Autre PME',icon:'🏢'},
  ]

  return (
    <div className="screen" style={{overflowY:'auto'}}>
      <div className="topbar">
        <Link to="/login" style={{textDecoration:'none',color:'var(--text2)'}}>
          <i className="ti ti-arrow-left" style={{fontSize:'22px'}}/>
        </Link>
        <h1>Créer mon entreprise</h1>
      </div>
      <form className="content" onSubmit={handleSubmit}>
        {/* Steps */}
        <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
          {[1,2,3].map(i=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:'6px',flex:i<3?1:0}}>
              <div style={{width:'28px',height:'28px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:'700',flexShrink:0,background:i===step?'var(--accent)':i<step?'var(--green)':'var(--bg)',color:i<=step?'#fff':'var(--text3)',border:'1.5px solid',borderColor:i<step?'var(--green)':i===step?'var(--accent)':'var(--border)'}}>{i<step?'✓':i}</div>
              {i<3&&<div style={{flex:1,height:'2px',background:i<step?'var(--green)':'var(--border)'}}/>}
            </div>
          ))}
        </div>

        {err && <div className="err-bar">{err}</div>}

        {step === 1 && (
          <div className="card" style={{display:'flex',flexDirection:'column',gap:'10px'}}>
            <div style={{fontSize:'16px',fontWeight:'700',marginBottom:'4px'}}>Informations</div>
            <div className="iw"><div className="il">Nom de l'entreprise</div><input className="if" placeholder="Café du Lac" value={form.companyName} onChange={set('companyName')} required/></div>
            <div className="iw"><div className="il">Votre nom complet</div><input className="if" placeholder="Sophie Martin" value={form.fullName} onChange={set('fullName')} required/></div>
            <div className="iw"><div className="il">Email</div><input className="if" type="email" placeholder="sophie@cafedulac.ch" value={form.email} onChange={set('email')} required/></div>
            <div className="iw"><div className="il">Mot de passe</div><input className="if" type="password" placeholder="Min. 6 caractères" value={form.password} onChange={set('password')} required/></div>
            <div className="iw"><div className="il">Confirmer</div><input className="if" type="password" placeholder="Répéter" value={form.password2} onChange={set('password2')} required/></div>
          </div>
        )}

        {step === 2 && (
          <div className="card">
            <div style={{fontSize:'16px',fontWeight:'700',marginBottom:'12px'}}>Secteur d'activité</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
              {sectors.map(s=>(
                <div key={s.k} onClick={()=>setSector(s.k)} style={{border:`2px solid ${sector===s.k?'var(--accent)':'var(--border)'}`,borderRadius:'var(--rs)',padding:'12px',textAlign:'center',cursor:'pointer',background:sector===s.k?'var(--bg)':'transparent',transition:'all .15s'}}>
                  <div style={{fontSize:'22px'}}>{s.icon}</div>
                  <div style={{fontSize:'13px',fontWeight:'700',marginTop:'5px'}}>{s.k}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="card">
            <div style={{fontSize:'16px',fontWeight:'700',marginBottom:'12px'}}>Pause repas</div>
            {[{k:'managed',title:'Gérée par l\'employé',sub:'Bouton pause visible sur l\'app'},{k:'fixed',title:'Durée fixe automatique',sub:'30 min déduits automatiquement'}].map(o=>(
              <div key={o.k} onClick={()=>setPauseMode(o.k)} style={{border:`2px solid ${pauseMode===o.k?'var(--accent)':'var(--border)'}`,borderRadius:'var(--rs)',padding:'12px',cursor:'pointer',marginBottom:'8px',transition:'border-color .15s'}}>
                <div style={{fontSize:'14px',fontWeight:'700'}}>{o.title}</div>
                <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>{o.sub}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{display:'flex',gap:'8px'}}>
          {step > 1 && <button type="button" className="btn btn-s" style={{flex:1}} onClick={()=>setStep(s=>s-1)}>Retour</button>}
          {step < 3
            ? <button type="button" className="btn btn-p" style={{flex:1}} onClick={()=>setStep(s=>s+1)}>Continuer <i className="ti ti-arrow-right"/></button>
            : <button type="submit" className="btn btn-p" style={{flex:1}} disabled={loading}>
                {loading ? 'Création en cours…' : <><i className="ti ti-check"/>Créer mon compte</>}
              </button>
          }
        </div>
      </form>
    </div>
  )
}
