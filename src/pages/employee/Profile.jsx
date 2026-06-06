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
  if (day === 1) {
    return { start: startOfMonth(now), end: endOfMonth(now), label: MONTHS[m]+' '+yr }
  }
  if (now.getDate() >= day) {
    const start = new Date(yr, m, day)
    const end   = new Date(yr, m+1, day-1)
    return { start, end, label: `${String(day).padStart(2,'0')}/${String(m+1).padStart(2,'0')} → ${String(day-1).padStart(2,'0')}/${String(m+2>12?1:m+2).padStart(2,'0')} ${yr}` }
  }
  const start = new Date(yr, m-1, day)
  const end   = new Date(yr, m, day-1)
  return { start, end, label: `${String(day).padStart(2,'0')}/${String(m===0?12:m).padStart(2,'0')} → ${String(day-1).padStart(2,'0')}/${String(m+1).padStart(2,'0')} ${yr}` }
}

function fmtH(h){ if(!h&&h!==0)return'—'; const ih=Math.floor(h); const im=Math.round((h-ih)*60); return `${ih}h${String(im).padStart(2,'0')}` }

export default function EmpProfile() {
  const { profile, signOut } = useAuth()
  const [stats, setStats] = useState({ worked:0, days:0, logs:[] })
  const [toast, setToast] = useState('')
  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''),2800) }

  useEffect(() => {
    if (!profile) return
    const period = getCyclePeriod(profile.cycle)
    const days   = eachDayOfInterval({ start: period.start, end: period.end })
    async function load() {
      const keys = days.map(d => format(d,'yyyy-MM-dd'))
      const { data } = await supabase.from('time_logs').select('*')
        .eq('user_id', profile.id).in('log_date', keys).order('log_date', { ascending: false })
      const worked = (data||[]).reduce((a,l)=>a+(l.net_hours||0), 0)
      const worked_days = (data||[]).filter(l=>l.net_hours>0).length
      setStats({ worked, days: worked_days, logs: data||[] })
    }
    load()
  }, [profile])

  const period  = getCyclePeriod(profile?.cycle)
  const hDue    = profile?.h_due || 169
  const supp    = stats.worked - hDue
  const vacRest = (profile?.vac_droit||20) - (profile?.vac_pris||0)
  const pct     = Math.min(100, Math.round((stats.worked/hDue)*100))
  const ini     = profile?.full_name?.split(' ').filter((_,i)=>i<2).map(p=>p[0]).join('').toUpperCase()||''

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/emp" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <h1>Mon profil</h1>
      </div>

      <div className="content">
        {/* Avatar */}
        <div className="card" style={{textAlign:'center',padding:'24px'}}>
          <div className="av" style={{width:'76px',height:'76px',fontSize:'22px',fontWeight:'800',margin:'0 auto 12px',background:profile?.color_bg||'#E6F1FB',color:profile?.color_fg||'#185FA5',border:'3px solid var(--surface)',boxShadow:'0 0 0 2px var(--border)'}}>{ini}</div>
          <div style={{fontSize:'17px',fontWeight:'800'}}>{profile?.full_name}</div>
          <div style={{fontSize:'13px',color:'var(--text2)',marginTop:'4px',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}>
            <span className="badge bk">{profile?.poste||'—'}</span>
            <span className="badge" style={{background:profile?.contract==='heure'?'var(--orange-bg)':'var(--blue-bg)',color:profile?.contract==='heure'?'#7A4500':'var(--blue)'}}>
              {profile?.contract==='heure'?'À l\'heure':'Fixe mensuel'}
            </span>
          </div>
        </div>

        {/* Stats mois */}
        <div className="card" style={{border:'1.5px solid var(--accent)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
              <i className="ti ti-chart-bar" style={{fontSize:'16px',color:'var(--accent)'}}/>
              <div style={{fontSize:'14px',fontWeight:'700'}}>Mon mois en cours</div>
            </div>
            <span style={{fontSize:'11px',color:'var(--text3)',fontWeight:'500'}}>{period.label}</span>
          </div>

          {/* Progression */}
          <div style={{marginBottom:'16px'}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',color:'var(--text2)',fontWeight:'600',marginBottom:'6px'}}>
              <span>{fmtH(stats.worked)} travaillé</span>
              <span>{pct}% · {fmtH(hDue)} dues</span>
            </div>
            <div style={{height:'10px',background:'var(--border)',borderRadius:'5px',overflow:'hidden'}}>
              <div style={{height:'100%',borderRadius:'5px',background:pct>=100?'var(--green)':pct>=80?'var(--orange)':'var(--blue)',width:pct+'%',transition:'width .5s'}}/>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
            <div style={{background:'var(--green-bg)',borderRadius:'var(--rs)',padding:'12px',textAlign:'center'}}>
              <div style={{fontSize:'11px',fontWeight:'700',color:'#0A5E45',marginBottom:'4px'}}>TRAVAILLÉ</div>
              <div style={{fontSize:'26px',fontWeight:'800',color:'#0A5E45'}}>{fmtH(stats.worked)}</div>
              <div style={{fontSize:'11px',color:'#0A5E45',marginTop:'2px'}}>sur {fmtH(hDue)}</div>
            </div>
            <div style={{background:supp>=0?'var(--green-bg)':'var(--red-bg)',borderRadius:'var(--rs)',padding:'12px',textAlign:'center'}}>
              <div style={{fontSize:'11px',fontWeight:'700',color:supp>=0?'#0A5E45':'#8B1F1F',marginBottom:'4px'}}>H. SUPP.</div>
              <div style={{fontSize:'26px',fontWeight:'800',color:supp>=0?'var(--green)':'var(--red)'}}>{(supp>=0?'+':'')+fmtH(Math.abs(supp))}</div>
              <div style={{fontSize:'11px',color:supp>=0?'#0A5E45':'#8B1F1F',marginTop:'2px'}}>{supp>=0?'ce mois':'à rattraper'}</div>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
            <div style={{background:'var(--orange-bg)',borderRadius:'var(--rs)',padding:'12px',textAlign:'center'}}>
              <div style={{fontSize:'11px',fontWeight:'700',color:'#7A4500',marginBottom:'4px'}}>VAC. RESTANTES</div>
              <div style={{fontSize:'26px',fontWeight:'800',color:'#7A4500'}}>{vacRest}</div>
              <div style={{fontSize:'11px',color:'#7A4500',marginTop:'2px'}}>/ {profile?.vac_droit||20} j ({profile?.vac_pris||0} pris)</div>
            </div>
            <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--rs)',padding:'12px',textAlign:'center'}}>
              <div style={{fontSize:'11px',fontWeight:'700',color:'var(--text2)',marginBottom:'4px'}}>JOURS TRAVAILLÉS</div>
              <div style={{fontSize:'26px',fontWeight:'800',color:'var(--text)'}}>{stats.days}</div>
              <div style={{fontSize:'11px',color:'var(--text2)',marginTop:'2px'}}>ce mois</div>
            </div>
          </div>
        </div>

        {/* Paramètres contrat */}
        <div className="card">
          <div className="card-title">Mon contrat</div>
          {[
            ['Cycle de calcul', {
              '1-1':'1er → 1er (mois calendaire)',
              '25-25':'25 → 25',
              '15-15':'15 → 15',
              '20-20':'20 → 20',
              '10-10':'10 → 10',
            }[profile?.cycle||'1-1']||'1er → 1er'],
            ['Heures dues', fmtH(hDue)+' / mois'],
            ['Type', profile?.contract==='heure'?'À l\'heure':'Fixe mensuel'],
            ['Vacances', (profile?.vac_droit||20)+' jours / an'],
          ].map(([l,v])=>(
            <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
              <span style={{fontSize:'13px',color:'var(--text2)'}}>{l}</span>
              <span style={{fontSize:'13px',fontWeight:'700'}}>{v}</span>
            </div>
          ))}
        </div>

        {/* Historique récent */}
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
                  <div style={{fontSize:'15px',fontWeight:'800',color:l.net_hours>0?'var(--green)':'var(--text3)'}}>{fmtH(l.net_hours||0)}</div>
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
