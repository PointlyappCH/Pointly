import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function AdminHome() {
  const { profile, company } = useAuth()
  const [logs, setLogs]     = useState([])
  const [shifts, setShifts] = useState([])
  const [toast, setToast]   = useState('')

  const today = format(new Date(), 'yyyy-MM-dd')
  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''),2800) }

  async function loadToday() {
    if (!company) return
    const [{ data: s }, { data: l }] = await Promise.all([
      supabase.from('shifts')
        .select('*, profiles(full_name,color_bg,color_fg,poste)')
        .eq('company_id', company.id).eq('shift_date', today),
      supabase.from('time_logs')
        .select('*, profiles(full_name,color_bg,color_fg)')
        .eq('company_id', company.id).eq('log_date', today),
    ])
    setShifts(s||[]); setLogs(l||[])
  }

  useEffect(() => {
    loadToday()
    const ch = supabase.channel('admin-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'time_logs'},loadToday)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [company])

  const firstName  = profile?.full_name?.split(' ')[0]||''
  const dateLabel  = format(new Date(),'EEEE d MMMM',{locale:fr})
  const pointed    = logs.filter(l=>l.punched_in&&!l.punched_out).length
  const errors     = logs.filter(l=>l.error_24h||(!l.punched_out&&l.punched_in&&(Date.now()-new Date(l.punched_in).getTime())>24*3600*1000)).length

  function mkIni(n=''){ const p=n.trim().split(' '); return((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase() }

  function statusBadge(log) {
    if (!log) return <span className="badge bk">Non pointé</span>
    if (log.error_24h) return <span className="badge br">⚠ Erreur 24h</span>
    if (log.punched_out) return <span className="badge bg">Terminé</span>
    if (log.pause_start&&!log.pause_end) return <span className="badge bo">Pause</span>
    if (log.punched_in) return <span className="badge bg">Pointé</span>
    return <span className="badge bk">Non pointé</span>
  }

  function liveTimer(log) {
    if (!log?.punched_in || log?.punched_out) return null
    const ms = Date.now() - new Date(log.punched_in).getTime()
    const h = Math.floor(ms/3600000)
    const m = Math.floor((ms%3600000)/60000)
    return `${h}h${String(m).padStart(2,'0')}`
  }

  return (
    <div className="screen">
      <div className="topbar">
        <div style={{width:'30px',height:'30px',borderRadius:'9px',background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          <i className="ti ti-clock-check" style={{fontSize:'15px',color:'#fff'}}/>
        </div>
        <h1>{company?.name||'Pointly'}</h1>
        <span className="badge bb">Admin</span>
      </div>

      <div className="content">
        <div style={{fontSize:'14px',color:'var(--text2)'}}>
          Bonjour <strong style={{color:'var(--text)'}}>{firstName}</strong> · {dateLabel}
        </div>

        {/* Stats */}
        <div className="sg">
          <div className="sc"><div className="sv" style={{color:'var(--green)'}}>{pointed}</div><div className="sl">Pointés</div></div>
          <div className="sc" style={{cursor:errors>0?'pointer':'default'}} onClick={()=>errors>0&&window.location.assign('/admin/corrections')}>
            <div className="sv" style={{color:errors>0?'var(--red)':'var(--text2)'}}>{errors}</div>
            <div className="sl">{errors>0?'⚠ Erreurs':'Erreurs'}</div>
          </div>
        </div>

        {/* Alerte erreurs */}
        {errors > 0 && (
          <Link to="/admin/corrections" style={{textDecoration:'none'}}>
            <div style={{background:'var(--red-bg)',border:'1.5px solid var(--red)',borderRadius:'var(--rs)',padding:'12px 14px',display:'flex',alignItems:'center',gap:'10px'}}>
              <i className="ti ti-alert-triangle" style={{fontSize:'20px',color:'var(--red)',flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:'13px',fontWeight:'700',color:'var(--red)'}}>
                  {errors} oubli{errors>1?'s':''} de dépointage
                </div>
                <div style={{fontSize:'11px',color:'#8B1F1F'}}>Cliquez pour corriger →</div>
              </div>
            </div>
          </Link>
        )}

        {/* Live */}
        <div className="card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
              <span className="live-dot"/>
              <span style={{fontSize:'14px',fontWeight:'700'}}>Live aujourd'hui</span>
            </div>
            <Link to="/admin/planning" style={{textDecoration:'none',fontSize:'12px',color:'var(--text3)'}}>Planning →</Link>
          </div>

          {shifts.length===0 && (
            <div style={{fontSize:'13px',color:'var(--text3)',padding:'6px 0'}}>
              Aucun shift planifié — <Link to="/admin/planning" style={{color:'var(--accent)'}}>Ajouter →</Link>
            </div>
          )}

          {shifts.slice(0,5).map(s => {
            const log = logs.find(l=>l.user_id===s.user_id)
            const timer = liveTimer(log)
            return (
              <div key={s.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <div className="av" style={{width:'30px',height:'30px',fontSize:'10px',background:s.profiles?.color_bg||'#E6F1FB',color:s.profiles?.color_fg||'#185FA5'}}>
                  {mkIni(s.profiles?.full_name)}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:'13px',fontWeight:'700'}}>{s.profiles?.full_name?.split(' ')[0]}</div>
                  <div style={{fontSize:'11px',color:'var(--text2)'}}>{s.poste} · {s.start_time?.slice(0,5)}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  {statusBadge(log)}
                  {timer && <div style={{fontSize:'11px',fontWeight:'700',color:'var(--green)',marginTop:'2px'}}>{timer}</div>}
                </div>
              </div>
            )
          })}
        </div>

        {/* Actions rapides */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
          <Link to="/admin/corrections" style={{textDecoration:'none'}}>
            <div className="card" style={{textAlign:'center',padding:'16px',cursor:'pointer',border:errors>0?'1.5px solid var(--red)':'1px solid var(--border)'}}>
              <i className="ti ti-pencil" style={{fontSize:'24px',color:errors>0?'var(--red)':'var(--text2)',display:'block',marginBottom:'6px'}}/>
              <div style={{fontSize:'12px',fontWeight:'700',color:errors>0?'var(--red)':'var(--text)'}}>Corrections</div>
              {errors>0 && <div style={{fontSize:'10px',color:'var(--red)',marginTop:'2px'}}>{errors} en attente</div>}
            </div>
          </Link>
          <Link to="/admin/export" style={{textDecoration:'none'}}>
            <div className="card" style={{textAlign:'center',padding:'16px',cursor:'pointer'}}>
              <i className="ti ti-file-type-pdf" style={{fontSize:'24px',color:'var(--red)',display:'block',marginBottom:'6px'}}/>
              <div style={{fontSize:'12px',fontWeight:'700'}}>Export PDF</div>
              <div style={{fontSize:'10px',color:'var(--text3)',marginTop:'2px'}}>Feuille officielle</div>
            </div>
          </Link>
        </div>

        {/* Notif */}
        <div style={{background:'var(--green-bg)',border:'1px solid #9FE1CB',borderRadius:'var(--rs)',padding:'12px 14px',display:'flex',alignItems:'center',gap:'10px'}}>
          <i className="ti ti-bell-ringing" style={{fontSize:'20px',color:'var(--green)',flexShrink:0}}/>
          <div style={{flex:1,fontSize:'13px',color:'#0A5E45',fontWeight:'600'}}>Planning prêt ? Notifiez l'équipe</div>
          <button className="btn btn-sm btn-g" onClick={()=>showToast('Équipe notifiée ! 📲')}>Notifier</button>
        </div>
      </div>

      <div className="nav">
        <div className="nav-item active"><i className="ti ti-layout-dashboard"/>Accueil</div>
        <Link to="/admin/planning" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-calendar"/>Planning</div></Link>
        <Link to="/admin/team" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-users"/>Équipe</div></Link>
        <Link to="/admin/chat" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-message-2"/>Chat</div></Link>
        <Link to="/admin/profile" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-user-circle"/>Profil</div></Link>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
