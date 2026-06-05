import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export default function AdminProfile() {
  const { profile, company, signOut } = useAuth()
  const [toast, setToast] = useState('')
  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''),2800) }
  const ini = profile?.full_name?.split(' ').map((p,i)=>i<2?p[0]:'').join('').toUpperCase()||''

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/admin" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <h1>Profil & Entreprise</h1>
      </div>

      <div className="content">
        {/* Avatar */}
        <div className="card" style={{textAlign:'center',padding:'24px'}}>
          <div className="av" style={{width:'76px',height:'76px',fontSize:'22px',fontWeight:'800',background:'var(--accent)',color:'#fff',margin:'0 auto 12px'}}>{ini}</div>
          <div style={{fontSize:'17px',fontWeight:'800'}}>{profile?.full_name}</div>
          <div style={{fontSize:'13px',color:'var(--text2)',marginTop:'2px'}}>Admin · {company?.name}</div>
        </div>

        {/* Raccourcis */}
        <div className="card">
          <div className="card-title">Gestion</div>
          <Link to="/admin/corrections" style={{textDecoration:'none'}}>
            <div style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px 0',borderBottom:'1px solid var(--border)',cursor:'pointer'}}>
              <div style={{width:'38px',height:'38px',borderRadius:'10px',background:'var(--red-bg)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <i className="ti ti-pencil" style={{fontSize:'18px',color:'var(--red)'}}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:'14px',fontWeight:'700'}}>Corrections d'heures</div>
                <div style={{fontSize:'12px',color:'var(--text2)'}}>Corriger les pointages manquants</div>
              </div>
              <i className="ti ti-chevron-right" style={{color:'var(--text3)',fontSize:'18px'}}/>
            </div>
          </Link>
          <Link to="/admin/export" style={{textDecoration:'none'}}>
            <div style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px 0',cursor:'pointer'}}>
              <div style={{width:'38px',height:'38px',borderRadius:'10px',background:'var(--red-bg)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <i className="ti ti-file-type-pdf" style={{fontSize:'18px',color:'var(--red)'}}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:'14px',fontWeight:'700'}}>Export mensuel PDF</div>
                <div style={{fontSize:'12px',color:'var(--text2)'}}>Feuille officielle d'heures non modifiable</div>
              </div>
              <i className="ti ti-chevron-right" style={{color:'var(--text3)',fontSize:'18px'}}/>
            </div>
          </Link>
        </div>

        {/* Infos entreprise */}
        <div className="card">
          <div className="card-title">Entreprise</div>
          <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
            <span style={{fontSize:'13px',color:'var(--text2)'}}>Nom</span>
            <span style={{fontSize:'13px',fontWeight:'700'}}>{company?.name}</span>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
            <span style={{fontSize:'13px',color:'var(--text2)'}}>Secteur</span>
            <span style={{fontSize:'13px',fontWeight:'700'}}>{company?.sector||'—'}</span>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0'}}>
            <span style={{fontSize:'13px',color:'var(--text2)'}}>Pause repas</span>
            <span style={{fontSize:'13px',fontWeight:'700'}}>{company?.pause_mode==='fixed'?'Fixe 30min':'Gérée par l\'employé'}</span>
          </div>
        </div>

        {/* Abonnement */}
        <div className="card" style={{border:'1.5px solid var(--green)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'6px'}}>
            <div className="card-title" style={{margin:0}}>Abonnement</div>
            <span className="badge bg">Essai gratuit</span>
          </div>
          <div style={{fontSize:'14px',color:'var(--text2)',marginBottom:'10px'}}>Accès à toutes les fonctionnalités</div>
          <button className="btn btn-sm btn-p" onClick={()=>showToast('Disponible bientôt — 39 CHF/mois')}>
            <i className="ti ti-crown"/>Passer au Pro — 39 CHF/mois
          </button>
        </div>

        {/* Déconnexion */}
        <div className="card">
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',cursor:'pointer'}} onClick={signOut}>
            <span style={{fontSize:'14px',fontWeight:'700',color:'var(--red)'}}>Déconnexion</span>
            <i className="ti ti-logout" style={{color:'var(--red)',fontSize:'20px'}}/>
          </div>
        </div>
      </div>

      <div className="nav">
        <Link to="/admin" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-layout-dashboard"/>Accueil</div></Link>
        <Link to="/admin/planning" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-calendar"/>Planning</div></Link>
        <Link to="/admin/team" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-users"/>Équipe</div></Link>
        <Link to="/admin/chat" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-message-2"/>Chat</div></Link>
        <div className="nav-item active"><i className="ti ti-user-circle"/>Profil</div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
