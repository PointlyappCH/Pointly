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

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''), 2800) }

  async function loadToday() {
    if (!company) return
    const { data: s } = await supabase
      .from('shifts').select('*, profiles(full_name,color_bg,color_fg,poste)')
      .eq('company_id', company.id).eq('shift_date', today)
    const { data: l } = await supabase
      .from('time_logs').select('*, profiles(full_name,color_bg,color_fg)')
      .eq('company_id', company.id).eq('log_date', today)
    setShifts(s || [])
    setLogs(l || [])
  }

  useEffect(() => {
    loadToday()
    // Realtime
    const ch = supabase.channel('admin-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'time_logs'},loadToday)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [company])

  const firstName = profile?.full_name?.split(' ')[0] || ''
  const dateLabel = format(new Date(), "EEEE d MMMM", { locale: fr })
  const pointed = logs.filter(l => l.punched_in && !l.punched_out).length
  const errors  = logs.filter(l => l.error_24h).length

  function mkIni(name='') {
    const p = name.trim().split(' ')
    return ((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase()
  }

  function statusBadge(log) {
    if (log.error_24h) return <span className="badge br">⚠ Erreur 24h</span>
    if (log.punched_out) return <span className="badge bg">Terminé</span>
    if (log.pause_start && !log.pause_end) return <span className="badge bo">Pause</span>
    if (log.punched_in) return <span className="badge bg">Pointé</span>
    return <span className="badge bk">Non pointé</span>
  }

  return (
    <div className="screen">
      <div className="topbar">
        <div style={{width:'30px',height:'30px',borderRadius:'9px',background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          <i className="ti ti-clock-check" style={{fontSize:'15px',color:'#fff'}}/>
        </div>
        <h1>{company?.name || 'Pointly'}</h1>
        <span className="badge bb">Admin</span>
      </div>

      <div className="content">
        <div style={{fontSize:'14px',color:'var(--text2)'}}>Bonjour <strong style={{color:'var(--text)'}}>{firstName}</strong> · {dateLabel}</div>

        <div className="sg">
          <div className="sc"><div className="sv" style={{color:'var(--green)'}}>{pointed}</div><div className="sl">Pointés</div></div>
          <div className="sc"><div className="sv" style={{color:errors>0?'var(--red)':'var(--text2)'}}>{errors}</div><div className="sl">Erreurs</div></div>
        </div>

        {/* Live */}
        <Link to="/admin/planning" style={{textDecoration:'none'}}>
          <div className="card" style={{cursor:'pointer'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'6px'}}><span className="live-dot"/><span style={{fontSize:'14px',fontWeight:'600'}}>Live aujourd'hui</span></div>
              <span style={{fontSize:'12px',color:'var(--text3)'}}>Planning →</span>
            </div>
            {shifts.length === 0 && <div style={{fontSize:'13px',color:'var(--text3)',padding:'6px 0'}}>Aucun shift planifié aujourd'hui</div>}
            {shifts.slice(0,4).map(s => {
              const log = logs.find(l=>l.user_id===s.user_id)
              return (
                <div key={s.id} style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
                  <div className="av" style={{width:'28px',height:'28px',fontSize:'10px',background:s.profiles?.color_bg||'#E6F1FB',color:s.profiles?.color_fg||'#185FA5'}}>
                    {mkIni(s.profiles?.full_name)}
                  </div>
                  <div style={{flex:1,fontSize:'13px'}}>{s.profiles?.full_name?.split(' ')[0]} <span className="pp on" style={{fontSize:'10px'}}>{s.poste}</span></div>
                  {statusBadge(log || {})}
                </div>
              )
            })}
          </div>
        </Link>

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
