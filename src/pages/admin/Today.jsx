import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function AdminToday() {
  const { company } = useAuth()
  const [emps, setEmps]     = useState([])
  const [shifts, setShifts] = useState([])
  const [logs, setLogs]     = useState([])
  const [filter, setFilter] = useState('all') // all | working | absent | late
  const [now, setNow]       = useState(Date.now())

  const today = format(new Date(), 'yyyy-MM-dd')

  function mkIni(n=''){ const p=n.trim().split(' '); return((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase() }
  function fmtTime(ts){ if(!ts)return'—'; return format(parseISO(ts),'HH:mm') }
  function fmtH(ms){ const h=Math.floor(ms/3600000); const m=Math.floor((ms%3600000)/60000); return `${h}h${String(m).padStart(2,'0')}` }

  async function load() {
    if (!company) return
    const [{ data: e }, { data: s }, { data: l }] = await Promise.all([
      supabase.from('profiles').select('*').eq('company_id', company.id).eq('role','employee'),
      supabase.from('shifts').select('*').eq('company_id', company.id).eq('shift_date', today),
      supabase.from('time_logs').select('*').eq('company_id', company.id).eq('log_date', today),
    ])
    setEmps(e||[])
    setShifts(s||[])
    setLogs(l||[])
  }

  useEffect(() => {
    load()
    const interval = setInterval(() => { setNow(Date.now()); load() }, 30000)
    const ch = supabase.channel('today-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'time_logs'},load)
      .subscribe()
    return () => { clearInterval(interval); supabase.removeChannel(ch) }
  }, [company])

  // Enrichir chaque employé avec son statut
  const enriched = emps.map(emp => {
    const shift = shifts.find(s=>s.user_id===emp.id)
    const log   = logs.find(l=>l.user_id===emp.id)
    let status = 'absent'
    let workedMs = 0
    let statusLabel = 'Absent'
    let statusColor = 'var(--text3)'
    let statusBg    = 'var(--bg)'

    if (log?.punched_in) {
      const start = new Date(log.punched_in).getTime()
      const end   = log.punched_out ? new Date(log.punched_out).getTime() : now
      const pauseMs = log.pause_start && log.pause_end
        ? new Date(log.pause_end).getTime() - new Date(log.pause_start).getTime()
        : log.pause_start && !log.pause_end ? now - new Date(log.pause_start).getTime() : 0
      workedMs = Math.max(0, end - start - pauseMs)
    }

    if (log?.error_24h) {
      status='error'; statusLabel='⚠ Erreur 24h'; statusColor='var(--red)'; statusBg='var(--red-bg)'
    } else if (log?.punched_out) {
      status='done'; statusLabel='Terminé'; statusColor='var(--green)'; statusBg='var(--green-bg)'
    } else if (log?.pause_start && !log?.pause_end) {
      status='paused'; statusLabel='En pause'; statusColor='var(--orange)'; statusBg='var(--orange-bg)'
    } else if (log?.punched_in) {
      status='working'; statusLabel='En cours'; statusColor='var(--green)'; statusBg='var(--green-bg)'
    } else if (shift) {
      // Planifié mais pas pointé — en retard ?
      const [h,m] = (shift.start_time||'00:00').split(':')
      const planned = new Date()
      planned.setHours(parseInt(h), parseInt(m), 0, 0)
      if (now > planned.getTime() + 15*60*1000) {
        status='late'; statusLabel=`Retard +${fmtH(now-planned.getTime())}`; statusColor='var(--red)'; statusBg='var(--red-bg)'
      } else {
        status='planned'; statusLabel='Planifié'; statusColor='var(--blue)'; statusBg='var(--blue-bg)'
      }
    }

    return { ...emp, shift, log, status, statusLabel, statusColor, statusBg, workedMs }
  })

  const filtered = filter==='all' ? enriched
    : filter==='working' ? enriched.filter(e=>e.status==='working'||e.status==='paused')
    : filter==='absent'  ? enriched.filter(e=>e.status==='absent')
    : filter==='late'    ? enriched.filter(e=>e.status==='late'||e.status==='error')
    : enriched

  const counts = {
    working: enriched.filter(e=>e.status==='working'||e.status==='paused').length,
    late:    enriched.filter(e=>e.status==='late'||e.status==='error').length,
    done:    enriched.filter(e=>e.status==='done').length,
    absent:  enriched.filter(e=>e.status==='absent').length,
  }

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/admin" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <h1>Aujourd'hui</h1>
        <div style={{display:'flex',alignItems:'center',gap:'5px',fontSize:'12px',color:'var(--green)',fontWeight:'700'}}>
          <span className="live-dot"/>
          {format(new Date(),'HH:mm')}
        </div>
      </div>

      <div className="content">
        <div style={{fontSize:'14px',color:'var(--text2)',fontWeight:'500'}}>
          {format(new Date(),'EEEE d MMMM yyyy',{locale:fr})}
        </div>

        {/* Stats rapides */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px'}}>
          {[
            {label:'Pointés',val:counts.working,color:'var(--green)',bg:'var(--green-bg)'},
            {label:'Retard',val:counts.late,color:'var(--red)',bg:'var(--red-bg)'},
            {label:'Terminés',val:counts.done,color:'var(--blue)',bg:'var(--blue-bg)'},
            {label:'Absents',val:counts.absent,color:'var(--text3)',bg:'var(--bg)'},
          ].map(s=>(
            <div key={s.label} style={{background:s.bg,borderRadius:'var(--rs)',padding:'10px',textAlign:'center',border:'1px solid var(--border)'}}>
              <div style={{fontSize:'22px',fontWeight:'800',color:s.color}}>{s.val}</div>
              <div style={{fontSize:'10px',color:s.color,fontWeight:'600',marginTop:'2px'}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filtres */}
        <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
          {[
            {k:'all',label:'Tous'},
            {k:'working',label:'Pointés'},
            {k:'late',label:'Retard'},
            {k:'absent',label:'Absents'},
          ].map(f=>(
            <span key={f.k} className={`chip ${filter===f.k?'c-on':'c-off'}`} onClick={()=>setFilter(f.k)}>
              {f.label}
            </span>
          ))}
        </div>

        {/* Liste employés */}
        <div className="card">
          {filtered.length===0 && <div style={{fontSize:'13px',color:'var(--text3)',padding:'6px 0'}}>Aucun employé dans cette catégorie</div>}
          {filtered.map(emp=>(
            <div key={emp.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
              <div className="av" style={{width:'40px',height:'40px',fontSize:'13px',background:emp.color_bg||'#E6F1FB',color:emp.color_fg||'#185FA5',fontWeight:'700'}}>
                {mkIni(emp.full_name)}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:'14px',fontWeight:'700'}}>{emp.full_name}</div>
                <div style={{fontSize:'12px',color:'var(--text2)'}}>
                  {emp.shift ? `${emp.poste} · prévu ${emp.shift.start_time?.slice(0,5)}` : emp.poste||'—'}
                </div>
                {emp.log?.punched_in && (
                  <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'2px'}}>
                    Arrivée {fmtTime(emp.log.punched_in)}
                    {emp.log.pause_start && ` · pause ${fmtTime(emp.log.pause_start)}`}
                    {emp.log.punched_out && ` → ${fmtTime(emp.log.punched_out)}`}
                  </div>
                )}
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{background:emp.statusBg,color:emp.statusColor,fontSize:'11px',fontWeight:'700',padding:'3px 10px',borderRadius:'20px',marginBottom:'4px'}}>
                  {emp.statusLabel}
                </div>
                {emp.workedMs > 0 && (
                  <div style={{fontSize:'13px',fontWeight:'800',color:'var(--green)'}}>{fmtH(emp.workedMs)}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Lien corrections si retards */}
        {counts.late > 0 && (
          <Link to="/admin/corrections" style={{textDecoration:'none'}}>
            <div style={{background:'var(--red-bg)',border:'1px solid var(--red)',borderRadius:'var(--rs)',padding:'12px 14px',display:'flex',alignItems:'center',gap:'10px'}}>
              <i className="ti ti-alert-triangle" style={{color:'var(--red)',fontSize:'20px'}}/>
              <div style={{flex:1,fontSize:'13px',color:'var(--red)',fontWeight:'700'}}>{counts.late} retard{counts.late>1?'s':''} — corriger les heures →</div>
            </div>
          </Link>
        )}
      </div>

      <div className="nav">
        <Link to="/admin" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-layout-dashboard"/>Accueil</div></Link>
        <Link to="/admin/planning" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-calendar"/>Planning</div></Link>
        <div className="nav-item active"><i className="ti ti-users"/>Aujourd'hui</div>
        <Link to="/admin/chat" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-message-2"/>Chat</div></Link>
        <Link to="/admin/profile" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-user-circle"/>Profil</div></Link>
      </div>
    </div>
  )
}
