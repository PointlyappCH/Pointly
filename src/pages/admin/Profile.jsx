import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export default function AdminProfile() {
  const { profile, company, signOut, canExport, isAdmin, isModerator } = useAuth()
  const [toast, setToast] = useState('')
  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''),2800) }
  const ini = profile?.full_name?.split(' ').filter((_,i)=>i<2).map(p=>p[0]).join('').toUpperCase()||''

  const shortcuts = [
    { to:'/admin/today',       icon:'ti-users',          color:'var(--green-bg)',  ic:'var(--green)',  title:"Qui travaille aujourd'hui", sub:'Vue live de l\'équipe', show:true },
    { to:'/admin/corrections', icon:'ti-pencil',         color:'var(--red-bg)',    ic:'var(--red)',    title:'Corrections d\'heures',     sub:'Corriger les pointages', show:true },
    { to:'/admin/export',      icon:'ti-file-type-pdf',  color:'var(--red-bg)',    ic:'var(--red)',    title:'Export PDF officiel',       sub:'Feuille d\'heures mensuelle', show:canExport },
    { to:'/admin/exchanges',   icon:'ti-arrows-exchange',color:'var(--orange-bg)', ic:'var(--orange)', title:'Échanges d\'horaires',      sub:'Valider les demandes', show:true },
    { to:'/admin/settings',    icon:'ti-settings',       color:'var(--blue-bg)',   ic:'var(--blue)',   title:'Réglages',                  sub:'Entreprise, postes, couleurs', show:isAdmin },
  ].filter(s=>s.show)

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/admin" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <h1>Profil</h1>
      </div>
      <div className="content">
        <div className="card" style={{textAlign:'center',padding:'24px'}}>
          <div className="av" style={{width:'76px',height:'76px',fontSize:'22px',fontWeight:'800',background:'var(--accent)',color:'#fff',margin:'0 auto 12px'}}>{ini}</div>
          <div style={{fontSize:'17px',fontWeight:'800'}}>{profile?.full_name}</div>
          <div style={{fontSize:'13px',color:'var(--text2)',marginTop:'4px',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}>
            <span className="badge bb">{company?.name}</span>
            <span className="badge" style={{background:isAdmin?'var(--accent)':isModerator?'var(--orange-bg)':'var(--bg)',color:isAdmin?'#fff':isModerator?'#7A4500':'var(--text2)'}}>
              {isAdmin?'Admin':isModerator?'Modérateur':'Employé'}
            </span>
          </div>
        </div>

        {isModerator && (
          <div style={{background:'var(--orange-bg)',border:'1px solid var(--orange)',borderRadius:'var(--rs)',padding:'10px 14px',display:'flex',gap:'8px',alignItems:'center'}}>
            <i className="ti ti-shield" style={{color:'var(--orange)',fontSize:'18px',flexShrink:0}}/>
            <div style={{fontSize:'13px',color:'#7A4500',fontWeight:'600'}}>Compte Modérateur — accès à tout sauf l'export des heures</div>
          </div>
        )}

        <div className="card">
          <div className="card-title">Accès rapides</div>
          {shortcuts.map(s=>(
            <Link key={s.to} to={s.to} style={{textDecoration:'none'}}>
              <div style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px 0',borderBottom:'1px solid var(--border)',cursor:'pointer'}}>
                <div style={{width:'40px',height:'40px',borderRadius:'11px',background:s.color,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <i className={`ti ${s.icon}`} style={{fontSize:'20px',color:s.ic}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:'14px',fontWeight:'700',color:'var(--text)'}}>{s.title}</div>
                  <div style={{fontSize:'12px',color:'var(--text2)'}}>{s.sub}</div>
                </div>
                <i className="ti ti-chevron-right" style={{color:'var(--text3)',fontSize:'18px'}}/>
              </div>
            </Link>
          ))}
        </div>

        {isAdmin && (
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
        )}

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
