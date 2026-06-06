import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { format, eachDayOfInterval, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

function getCyclePeriod(cycle) {
  const now = new Date()
  const day = parseInt((cycle||'1-1').split('-')[0]) || 1
  const yr  = now.getFullYear(); const m = now.getMonth()
  const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
  if (day === 1) return { start: startOfMonth(now), end: endOfMonth(now), label: MONTHS[m]+' '+yr }
  if (now.getDate() >= day) {
    return { start: new Date(yr,m,day), end: new Date(yr,m+1,day-1),
      label:`${String(day).padStart(2,'0')}/${String(m+1).padStart(2,'0')} → ${String(day-1).padStart(2,'0')}/${String(m+2>12?1:m+2).padStart(2,'0')} ${yr}` }
  }
  return { start: new Date(yr,m-1,day), end: new Date(yr,m,day-1),
    label:`${String(day).padStart(2,'0')}/${String(m===0?12:m).padStart(2,'0')} → ${String(day-1).padStart(2,'0')}/${String(m+1).padStart(2,'0')} ${yr}` }
}

function fmtH(h){ if(!h&&h!==0)return'—'; const ih=Math.floor(h); const im=Math.round((h-ih)*60); return `${ih}h${String(im).padStart(2,'0')}` }

const COLOR_PAIRS = [
  { bg:'#E6F1FB', fg:'#185FA5', label:'Bleu' },
  { bg:'#E1F5EE', fg:'#0A5E45', label:'Vert' },
  { bg:'#FAEEDA', fg:'#7A4500', label:'Orange' },
  { bg:'#FCEBEB', fg:'#8B1F1F', label:'Rouge' },
  { bg:'#EEEDFE', fg:'#534AB7', label:'Violet' },
  { bg:'#FFF0E6', fg:'#8B4500', label:'Brun' },
  { bg:'#1A1A2E', fg:'#FFFFFF', label:'Sombre' },
  { bg:'#F0FBF7', fg:'#1D9E75', label:'Menthe' },
]

export default function EmpProfile() {
  const { profile, company, signOut, refreshProfile } = useAuth()
  const [stats, setStats]     = useState({ worked:0, days:0, logs:[] })
  const [showEdit, setShowEdit] = useState(false)
  const [showPwd,  setShowPwd]  = useState(false)
  const [toast, setToast]     = useState('')
  const [loading, setLoading] = useState(false)
  const [editForm, setEditForm] = useState({ name:'', color_bg:'', color_fg:'' })
  const [pwdForm, setPwdForm]   = useState({ current:'', newPwd:'', confirm:'' })
  const [pwdErr, setPwdErr]     = useState('')

  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''),2800) }

  useEffect(() => {
    if (profile) {
      setEditForm({ name: profile.full_name, color_bg: profile.color_bg||'#E6F1FB', color_fg: profile.color_fg||'#185FA5' })
    }
  }, [profile])

  useEffect(() => {
    if (!profile) return
    const period = getCyclePeriod(profile.cycle)
    const days   = eachDayOfInterval({ start: period.start, end: period.end })
    async function load() {
      const keys = days.map(d => format(d,'yyyy-MM-dd'))
      const { data } = await supabase.from('time_logs').select('*')
        .eq('user_id', profile.id).in('log_date', keys).order('log_date', { ascending: false })
      const worked = (data||[]).reduce((a,l)=>a+(l.net_hours||0), 0)
      setStats({ worked, days:(data||[]).filter(l=>l.net_hours>0).length, logs:data||[] })
    }
    load()
  }, [profile])

  async function saveProfile() {
    if (!editForm.name.trim()) return
    setLoading(true)
    const { error } = await supabase.from('profiles').update({
      full_name: editForm.name.trim(),
      color_bg:  editForm.color_bg,
      color_fg:  editForm.color_fg,
    }).eq('id', profile.id)
    setLoading(false)
    if (error) { showToast('Erreur : '+error.message); return }
    await refreshProfile()
    setShowEdit(false)
    showToast('Profil mis à jour ✅')
  }

  async function changePassword() {
    setPwdErr('')
    if (pwdForm.newPwd.length < 6) { setPwdErr('Minimum 6 caractères'); return }
    if (pwdForm.newPwd !== pwdForm.confirm) { setPwdErr('Les mots de passe ne correspondent pas'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: pwdForm.newPwd })
    setLoading(false)
    if (error) { setPwdErr(error.message); return }
    setShowPwd(false); setPwdForm({ current:'', newPwd:'', confirm:'' })
    showToast('Mot de passe modifié ✅')
  }

  const period = getCyclePeriod(profile?.cycle)
  const hDue   = profile?.h_due || 169
  const supp   = stats.worked - hDue
  const vacRest = (profile?.vac_droit||20) - (profile?.vac_pris||0)
  const pct    = Math.min(100, Math.round((stats.worked/hDue)*100))
  const ini    = profile?.full_name?.split(' ').filter((_,i)=>i<2).map(p=>p[0]).join('').toUpperCase()||''

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/emp" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <h1>Mon profil</h1>
        <button className="btn btn-sm btn-s" onClick={()=>setShowEdit(true)}>
          <i className="ti ti-pencil"/>Modifier
        </button>
      </div>

      <div className="content">
        {/* Avatar + infos */}
        <div className="card" style={{textAlign:'center',padding:'24px'}}>
          <div className="av" style={{width:'80px',height:'80px',fontSize:'24px',fontWeight:'800',margin:'0 auto 12px',
            background:profile?.color_bg||'#E6F1FB',color:profile?.color_fg||'#185FA5',
            border:'3px solid var(--surface)',boxShadow:'0 0 0 2px var(--border)',cursor:'pointer'}}
            onClick={()=>setShowEdit(true)}>
            {ini}
          </div>
          <div style={{fontSize:'18px',fontWeight:'800'}}>{profile?.full_name}</div>
          <div style={{fontSize:'13px',color:'var(--text2)',marginTop:'6px',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',flexWrap:'wrap'}}>
            <span className="badge bk">{profile?.poste||'—'}</span>
            <span className="badge" style={{background:profile?.contract==='heure'?'var(--orange-bg)':'var(--blue-bg)',color:profile?.contract==='heure'?'#7A4500':'var(--blue)'}}>
              {profile?.contract==='heure'?'À l\'heure':'Fixe mensuel'}
            </span>
          </div>
          <div style={{marginTop:'12px',display:'flex',gap:'8px',justifyContent:'center'}}>
            <button className="btn btn-s btn-sm" onClick={()=>setShowEdit(true)}><i className="ti ti-palette"/>Couleur</button>
            <button className="btn btn-s btn-sm" onClick={()=>setShowPwd(true)}><i className="ti ti-lock"/>Mot de passe</button>
          </div>
        </div>

        {/* Stats mois */}
        <div className="card" style={{border:'1.5px solid var(--accent)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
            <div style={{fontSize:'14px',fontWeight:'700',display:'flex',alignItems:'center',gap:'6px'}}>
              <i className="ti ti-chart-bar" style={{color:'var(--accent)'}}/>Mon mois
            </div>
            <span style={{fontSize:'11px',color:'var(--text3)'}}>{period.label}</span>
          </div>
          <div style={{marginBottom:'14px'}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',color:'var(--text2)',fontWeight:'600',marginBottom:'6px'}}>
              <span>{fmtH(stats.worked)} travaillé</span>
              <span>{pct}% · {fmtH(hDue)} dues</span>
            </div>
            <div style={{height:'10px',background:'var(--border)',borderRadius:'5px',overflow:'hidden'}}>
              <div style={{height:'100%',borderRadius:'5px',transition:'width .5s',
                background:pct>=100?'var(--green)':pct>=80?'var(--orange)':'var(--blue)',width:pct+'%'}}/>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
            <div style={{background:'var(--green-bg)',borderRadius:'var(--rs)',padding:'10px',textAlign:'center'}}>
              <div style={{fontSize:'10px',fontWeight:'700',color:'#0A5E45',marginBottom:'3px'}}>TRAVAILLÉ</div>
              <div style={{fontSize:'22px',fontWeight:'800',color:'#0A5E45'}}>{fmtH(stats.worked)}</div>
              <div style={{fontSize:'10px',color:'#0A5E45'}}>sur {fmtH(hDue)}</div>
            </div>
            <div style={{background:supp>=0?'var(--green-bg)':'var(--red-bg)',borderRadius:'var(--rs)',padding:'10px',textAlign:'center'}}>
              <div style={{fontSize:'10px',fontWeight:'700',color:supp>=0?'#0A5E45':'#8B1F1F',marginBottom:'3px'}}>H. SUPP.</div>
              <div style={{fontSize:'22px',fontWeight:'800',color:supp>=0?'var(--green)':'var(--red)'}}>{(supp>=0?'+':'')+fmtH(Math.abs(supp))}</div>
              <div style={{fontSize:'10px',color:supp>=0?'#0A5E45':'#8B1F1F'}}>{supp>=0?'ce mois':'à rattraper'}</div>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
            <div style={{background:'var(--orange-bg)',borderRadius:'var(--rs)',padding:'10px',textAlign:'center'}}>
              <div style={{fontSize:'10px',fontWeight:'700',color:'#7A4500',marginBottom:'3px'}}>VAC. REST.</div>
              <div style={{fontSize:'22px',fontWeight:'800',color:'#7A4500'}}>{vacRest}</div>
              <div style={{fontSize:'10px',color:'#7A4500'}}>/ {profile?.vac_droit||20} j</div>
            </div>
            <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--rs)',padding:'10px',textAlign:'center'}}>
              <div style={{fontSize:'10px',fontWeight:'700',color:'var(--text2)',marginBottom:'3px'}}>JOURS</div>
              <div style={{fontSize:'22px',fontWeight:'800'}}>{stats.days}</div>
              <div style={{fontSize:'10px',color:'var(--text2)'}}>ce mois</div>
            </div>
          </div>
        </div>

        {/* Contrat */}
        <div className="card">
          <div className="card-title">Mon contrat</div>
          {[
            ['Cycle',    {'1-1':'1er → 1er','25-25':'25 → 25','15-15':'15 → 15','20-20':'20 → 20','10-10':'10 → 10'}[profile?.cycle||'1-1']||'1er → 1er'],
            ['H. dues',  fmtH(hDue)+' / mois'],
            ['Contrat',  profile?.contract==='heure'?'À l\'heure':'Fixe mensuel'],
            ['Vacances', (profile?.vac_droit||20)+' jours / an'],
          ].map(([l,v])=>(
            <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
              <span style={{fontSize:'13px',color:'var(--text2)'}}>{l}</span>
              <span style={{fontSize:'13px',fontWeight:'700'}}>{v}</span>
            </div>
          ))}
        </div>

        {/* Historique */}
        {stats.logs.length > 0 && (
          <div className="card">
            <div className="card-title">Derniers pointages</div>
            {stats.logs.slice(0,5).map(l=>(
              <div key={l.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <div>
                  <div style={{fontSize:'13px',fontWeight:'600'}}>{format(parseISO(l.log_date),'EEE d MMM',{locale:fr})}</div>
                  {l.punched_in && l.punched_out && (
                    <div style={{fontSize:'11px',color:'var(--text2)'}}>
                      {format(parseISO(l.punched_in),'HH:mm')} → {format(parseISO(l.punched_out),'HH:mm')}
                    </div>
                  )}
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:'15px',fontWeight:'800',color:'var(--green)'}}>{fmtH(l.net_hours||0)}</div>
                  {l.is_modified && <span style={{fontSize:'10px',color:'var(--orange)',fontWeight:'600'}}>Modifié</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Déconnexion */}
        <div className="card">
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',cursor:'pointer'}} onClick={signOut}>
            <span style={{fontSize:'14px',fontWeight:'700',color:'var(--red)'}}>Déconnexion</span>
            <i className="ti ti-logout" style={{color:'var(--red)',fontSize:'20px'}}/>
          </div>
        </div>
      </div>

      {/* ── MODAL MODIFIER PROFIL + COULEUR ── */}
      {showEdit && (
        <div className="modal-bg" onClick={()=>setShowEdit(false)}>
          <div className="ms" onClick={e=>e.stopPropagation()}>
            <div className="mh"/>
            <div style={{fontSize:'18px',fontWeight:'800',marginBottom:'16px'}}>Modifier mon profil</div>

            {/* Aperçu avatar */}
            <div style={{textAlign:'center',marginBottom:'16px'}}>
              <div className="av" style={{width:'70px',height:'70px',fontSize:'22px',fontWeight:'800',margin:'0 auto',
                background:editForm.color_bg,color:editForm.color_fg,border:'3px solid var(--border)'}}>
                {ini}
              </div>
            </div>

            <div className="iw" style={{marginBottom:'14px'}}>
              <div className="il">Mon prénom et nom</div>
              <input className="if" value={editForm.name} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))} placeholder="Prénom Nom"/>
            </div>

            <div className="iw" style={{marginBottom:'16px'}}>
              <div className="il">Ma couleur de profil</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginTop:'8px'}}>
                {COLOR_PAIRS.map(c=>(
                  <div key={c.bg} onClick={()=>setEditForm(f=>({...f,color_bg:c.bg,color_fg:c.fg}))}
                    style={{cursor:'pointer',borderRadius:'12px',padding:'10px 6px',textAlign:'center',
                      background:c.bg,color:c.fg,
                      border:`2.5px solid ${editForm.color_bg===c.bg?c.fg:'transparent'}`,
                      boxShadow:editForm.color_bg===c.bg?`0 0 0 1px ${c.fg}20`:'none',
                      transition:'all .15s'}}>
                    <div style={{fontSize:'16px',fontWeight:'800',marginBottom:'3px'}}>TRB</div>
                    <div style={{fontSize:'10px',fontWeight:'600',opacity:.8}}>{c.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <button className="btn btn-p" onClick={saveProfile} disabled={loading}>
              {loading?'Enregistrement…':<><i className="ti ti-check"/>Enregistrer</>}
            </button>
            <button className="btn btn-s" style={{marginTop:'8px'}} onClick={()=>setShowEdit(false)}>Annuler</button>
          </div>
        </div>
      )}

      {/* ── MODAL MOT DE PASSE ── */}
      {showPwd && (
        <div className="modal-bg" onClick={()=>setShowPwd(false)}>
          <div className="ms" onClick={e=>e.stopPropagation()}>
            <div className="mh"/>
            <div style={{fontSize:'18px',fontWeight:'800',marginBottom:'4px'}}>Changer mon mot de passe</div>
            <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'16px'}}>Minimum 6 caractères</div>
            {pwdErr && <div className="err-bar" style={{marginBottom:'12px'}}>{pwdErr}</div>}
            <div style={{display:'flex',flexDirection:'column',gap:'10px',marginBottom:'16px'}}>
              <div className="iw"><div className="il">Nouveau mot de passe</div>
                <input className="if" type="password" value={pwdForm.newPwd} onChange={e=>setPwdForm(f=>({...f,newPwd:e.target.value}))} placeholder="Min. 6 caractères"/>
              </div>
              <div className="iw"><div className="il">Confirmer</div>
                <input className="if" type="password" value={pwdForm.confirm} onChange={e=>setPwdForm(f=>({...f,confirm:e.target.value}))} placeholder="Répéter"/>
              </div>
            </div>
            <button className="btn btn-p" onClick={changePassword} disabled={loading}>
              {loading?'…':<><i className="ti ti-lock"/>Changer le mot de passe</>}
            </button>
            <button className="btn btn-s" style={{marginTop:'8px'}} onClick={()=>setShowPwd(false)}>Annuler</button>
          </div>
        </div>
      )}

      <div className="nav">
        <Link to="/emp" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-layout-dashboard"/>Accueil</div></Link>
        <Link to="/emp/planning" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-calendar"/>Planning</div></Link>
        <Link to="/emp/dispo" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-adjustments"/>Dispos</div></Link>
        <Link to="/emp/chat" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-message-2"/>Chat</div></Link>
        <div className="nav-item active"><i className="ti ti-user-circle"/>Profil</div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
