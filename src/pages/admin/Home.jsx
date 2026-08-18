import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

const MAX_MS = 24 * 60 * 60 * 1000

export default function AdminHome() {
  const { profile, company } = useAuth()
  const [logs, setLogs]     = useState([])
  const [shifts, setShifts] = useState([])
  const [myLog, setMyLog]   = useState(null)
  const [now, setNow]       = useState(Date.now())
  const [toast, setToast]   = useState('')
  const [showDepoint, setShowDepoint] = useState(false)
  const [remark, setRemark] = useState('')
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [codeError, setCodeError] = useState('')
  const [checkingCode, setCheckingCode] = useState(false)

  const today = format(new Date(), 'yyyy-MM-dd')
  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''),2800) }
  function mkIni(n=''){ const p=n.trim().split(' '); return((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase() }
  function fmtTime(ts){ if(!ts)return'—'; return format(parseISO(ts),'HH:mm') }
  function fmtH(ms){ const h=Math.floor(ms/3600000); const m=Math.floor((ms%3600000)/60000); return `${h}h${String(m).padStart(2,'0')}` }

  async function loadData() {
    if (!company || !profile) return
    const [{ data: s }, { data: l }, { data: ml }] = await Promise.all([
      supabase.from('shifts').select('*, profiles(full_name,color_bg,color_fg,poste)')
        .eq('company_id', company.id).eq('shift_date', today),
      supabase.from('time_logs').select('*, profiles(full_name,color_bg,color_fg)')
        .eq('company_id', company.id).eq('log_date', today),
      supabase.from('time_logs').select('*')
        .eq('user_id', profile.id).eq('log_date', today).maybeSingle(),
    ])
    setShifts(s||[])
    setLogs(l||[])
    setMyLog(ml)
  }

  useEffect(() => {
    loadData()
    const interval = setInterval(() => setNow(Date.now()), 1000)
    const ch = supabase.channel('admin-home-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'time_logs'},loadData)
      .subscribe()
    return () => { clearInterval(interval); supabase.removeChannel(ch) }
  }, [company, profile])

  // ── Timer admin ──
  function getWorkedMs() {
    if (!myLog?.punched_in) return 0
    const start = new Date(myLog.punched_in).getTime()
    const end   = myLog.punched_out ? new Date(myLog.punched_out).getTime() : Math.min(now, start + MAX_MS)
    const pauseMs = myLog.pause_start && myLog.pause_end
      ? new Date(myLog.pause_end).getTime() - new Date(myLog.pause_start).getTime()
      : myLog.pause_start && !myLog.pause_end ? now - new Date(myLog.pause_start).getTime() : 0
    return Math.max(0, end - start - pauseMs)
  }
  function fmtMs(ms){ const s=Math.floor(ms/1000); return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}` }

  const workedMs   = getWorkedMs()
  const isError    = myLog?.punched_in && !myLog?.punched_out && (now - new Date(myLog.punched_in).getTime()) >= MAX_MS
  const isPaused   = myLog?.pause_start && !myLog?.pause_end
  const isWorking  = myLog?.punched_in && !myLog?.punched_out && !isPaused && !isError
  const isDone     = myLog?.punched_out

  function punch() {
    if (isError) { setShowDepoint(true); return }
    if (isDone) return
    if (isWorking || isPaused) { setShowDepoint(true); return }
    setCodeInput(''); setCodeError(''); setShowCodeModal(true)
  }

  async function confirmCodeAndPunchIn() {
    if (!profile || !company || checkingCode) return
    if (!codeInput.trim()) { setCodeError('Entre le code affiché dans la cabane'); return }
    setCheckingCode(true); setCodeError('')
    const { data: validCode, error } = await supabase.rpc('get_or_create_today_code', { p_company_id: company.id })
    if (error) { setCodeError('Erreur de vérification, réessaie'); setCheckingCode(false); return }
    if (codeInput.trim() !== validCode) {
      setCodeError('Code incorrect'); setCheckingCode(false); return
    }
    await supabase.from('time_logs').upsert({
      user_id: profile.id, company_id: company.id, log_date: today,
      punched_in: new Date().toISOString(),
    }, { onConflict: 'user_id,log_date' })
    setCheckingCode(false); setShowCodeModal(false); setCodeInput('')
    loadData(); showToast('Pointé ✅')
  }

  async function togglePause() {
    if (!myLog) return
    if (isPaused) {
      await supabase.from('time_logs').update({ pause_end: new Date().toISOString() }).eq('id', myLog.id)
    } else {
      await supabase.from('time_logs').update({ pause_start: new Date().toISOString() }).eq('id', myLog.id)
    }
    loadData()
  }

  async function depoint() {
    if (!myLog) return
    const net = workedMs / 3600000
    await supabase.from('time_logs').update({
      punched_out: new Date().toISOString(), net_hours: net,
      remark: remark||null, error_24h: isError,
    }).eq('id', myLog.id)
    setShowDepoint(false); setRemark(''); loadData()
    showToast(isError ? '⚠️ Correction enregistrée' : 'Dépointé ✅')
  }

  // Statut UI punch
  let circleClass='pc', icon='ti-clock', label='Pointer'
  if (isError)    { circleClass='pc error'; icon='ti-alert-triangle'; label='Erreur 24h' }
  else if (isDone)   { circleClass='pc done';  icon='ti-check';           label='Terminé' }
  else if (isPaused) { circleClass='pc ps';    icon='ti-player-pause';    label='En pause' }
  else if (isWorking){ circleClass='pc in';    icon='ti-clock-check';     label='En cours' }

  const pointed = logs.filter(l=>l.punched_in&&!l.punched_out).length
  const errors  = logs.filter(l=>l.error_24h).length
  const firstName = profile?.full_name?.split(' ')[0]||''
  const dateLabel = format(new Date(),'EEEE d MMMM',{locale:fr})

  function statusBadge(log) {
    if (!log) return <span className="badge bk">Non pointé</span>
    if (log.error_24h) return <span className="badge br">⚠ Erreur</span>
    if (log.punched_out) return <span className="badge bg">Terminé</span>
    if (log.pause_start&&!log.pause_end) return <span className="badge bo">Pause</span>
    if (log.punched_in) return <span className="badge bg">Pointé</span>
    return <span className="badge bk">—</span>
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

        {/* MON POINTAGE ADMIN */}
        <div className="card" style={{padding:'16px',textAlign:'center'}}>
          <div style={{fontSize:'12px',color:'var(--text2)',marginBottom:'4px',fontWeight:'600'}}>MON POINTAGE</div>
          <div style={{fontSize:'26px',fontWeight:'800',fontVariantNumeric:'tabular-nums',margin:'6px 0',color:isError?'var(--red)':'var(--text)'}}>
            {fmtMs(workedMs)}
          </div>
          <div className={circleClass} onClick={punch}>
            <i className={`ti ${icon} pi`}/>
            <div className="pl">{label}</div>
          </div>
          {(isWorking||isPaused) && !isDone && (
            <div style={{display:'flex',gap:'8px',marginTop:'12px',justifyContent:'center'}}>
              <button className={`btn btn-sm ${isPaused?'btn-g':'btn-o'}`} onClick={togglePause}>
                <i className={`ti ${isPaused?'ti-play':'ti-player-pause'}`}/>
                {isPaused?'Reprendre':'Pause'}
              </button>
              <button className="btn btn-sm btn-r" onClick={()=>setShowDepoint(true)}>
                <i className="ti ti-player-stop"/>Dépointer
              </button>
            </div>
          )}
        </div>

        {/* Stats équipe */}
        <div className="sg">
          <div className="sc"><div className="sv" style={{color:'var(--green)'}}>{pointed}</div><div className="sl">Équipe pointée</div></div>
          <div className="sc" style={{cursor:errors>0?'pointer':'default'}}>
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
                <div style={{fontSize:'13px',fontWeight:'700',color:'var(--red)'}}>{errors} oubli{errors>1?'s':''} de dépointage</div>
                <div style={{fontSize:'11px',color:'#8B1F1F'}}>Corriger →</div>
              </div>
            </div>
          </Link>
        )}

        {/* Live équipe */}
        <div className="card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
              <span className="live-dot"/>
              <span style={{fontSize:'14px',fontWeight:'700'}}>Équipe aujourd'hui</span>
            </div>
            <Link to="/admin/today" style={{textDecoration:'none',fontSize:'12px',color:'var(--text3)'}}>Tout voir →</Link>
          </div>
          {shifts.length===0 && (
            <div style={{fontSize:'13px',color:'var(--text3)',padding:'6px 0'}}>
              Aucun shift planifié — <Link to="/admin/planning" style={{color:'var(--accent)'}}>Ajouter →</Link>
            </div>
          )}
          {shifts.slice(0,5).map(s=>{
            const log = logs.find(l=>l.user_id===s.user_id)
            return (
              <div key={s.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <div className="av" style={{width:'30px',height:'30px',fontSize:'10px',fontWeight:'700',background:s.profiles?.color_bg||'#E6F1FB',color:s.profiles?.color_fg||'#185FA5'}}>
                  {mkIni(s.profiles?.full_name)}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:'13px',fontWeight:'700'}}>{s.profiles?.full_name?.split(' ')[0]}</div>
                  <div style={{fontSize:'11px',color:'var(--text2)'}}>{s.poste} · {s.start_time?.slice(0,5)}</div>
                </div>
                {statusBadge(log)}
              </div>
            )
          })}
        </div>

        {/* Actions rapides */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
          <Link to="/admin/today" style={{textDecoration:'none'}}>
            <div className="card" style={{textAlign:'center',padding:'16px',cursor:'pointer'}}>
              <i className="ti ti-users" style={{fontSize:'26px',color:'var(--green)',display:'block',marginBottom:'6px'}}/>
              <div style={{fontSize:'12px',fontWeight:'700'}}>Qui travaille ?</div>
            </div>
          </Link>
          <Link to={`/admin/day?date=${format(new Date(),'yyyy-MM-dd')}`} style={{textDecoration:'none'}}>
            <div className="card" style={{textAlign:'center',padding:'16px',cursor:'pointer',border:'1.5px solid var(--blue)'}}>
              <i className="ti ti-timeline" style={{fontSize:'26px',color:'var(--blue)',display:'block',marginBottom:'6px'}}/>
              <div style={{fontSize:'12px',fontWeight:'700',color:'var(--blue)'}}>Timeline du jour</div>
            </div>
          </Link>
          <Link to="/admin/export" style={{textDecoration:'none'}}>
            <div className="card" style={{textAlign:'center',padding:'16px',cursor:'pointer'}}>
              <i className="ti ti-file-type-pdf" style={{fontSize:'26px',color:'var(--red)',display:'block',marginBottom:'6px'}}/>
              <div style={{fontSize:'12px',fontWeight:'700'}}>Export PDF</div>
            </div>
          </Link>
        </div>

        {/* Notif planning */}
        <div style={{background:'var(--green-bg)',border:'1px solid #9FE1CB',borderRadius:'var(--rs)',padding:'12px 14px',display:'flex',alignItems:'center',gap:'10px'}}>
          <i className="ti ti-bell-ringing" style={{fontSize:'20px',color:'var(--green)',flexShrink:0}}/>
          <div style={{flex:1,fontSize:'13px',color:'#0A5E45',fontWeight:'600'}}>Planning prêt ? Notifiez l'équipe</div>
          <button className="btn btn-sm btn-g" onClick={()=>showToast('🔜 Notifications push — bientôt disponible')}>Notifier</button>
        </div>
      </div>

      {/* MODAL CODE DE POINTAGE */}
      {showCodeModal && (
        <div className="modal-bg" onClick={()=>setShowCodeModal(false)}>
          <div className="ms" onClick={e=>e.stopPropagation()}>
            <div className="mh"/>
            <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'16px'}}>
              <div style={{width:'46px',height:'46px',borderRadius:'50%',background:'var(--blue-bg)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <i className="ti ti-shield-lock" style={{fontSize:'22px',color:'var(--blue)'}}/>
              </div>
              <div>
                <div style={{fontSize:'18px',fontWeight:'800'}}>Code de pointage</div>
                <div style={{fontSize:'13px',color:'var(--text2)'}}>Le code affiché dans la cabane</div>
              </div>
            </div>
            <input
              className="if"
              type="text"
              inputMode="numeric"
              maxLength={4}
              placeholder="····"
              autoFocus
              value={codeInput}
              onChange={e=>{ setCodeInput(e.target.value.replace(/\D/g,'')); setCodeError('') }}
              onKeyDown={e=>{ if(e.key==='Enter') confirmCodeAndPunchIn() }}
              style={{fontSize:'26px',textAlign:'center',letterSpacing:'.3em',fontWeight:'800',marginBottom:'8px'}}
            />
            {codeError && <div style={{color:'var(--red)',fontSize:'13px',marginBottom:'10px',textAlign:'center'}}>{codeError}</div>}
            <button className="btn btn-p" onClick={confirmCodeAndPunchIn} disabled={checkingCode} style={{marginTop:'8px'}}>
              <i className="ti ti-check"/>{checkingCode?'Vérification…':'Valider et pointer'}
            </button>
            <button className="btn btn-s" style={{marginTop:'8px'}} onClick={()=>setShowCodeModal(false)}>Annuler</button>
          </div>
        </div>
      )}

      {/* MODAL DEPOINT */}
      {showDepoint && (
        <div className="modal-bg" onClick={()=>setShowDepoint(false)}>
          <div className="ms" onClick={e=>e.stopPropagation()}>
            <div className="mh"/>
            <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'16px'}}>
              <div style={{width:'46px',height:'46px',borderRadius:'50%',background:'var(--red-bg)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <i className="ti ti-player-stop" style={{fontSize:'22px',color:'var(--red)'}}/>
              </div>
              <div>
                <div style={{fontSize:'18px',fontWeight:'800'}}>Terminer la journée ?</div>
                <div style={{fontSize:'13px',color:'var(--text2)'}}>Temps travaillé : {fmtH(workedMs)}</div>
              </div>
            </div>
            <textarea className="if" rows="2" placeholder="Remarque optionnelle…" value={remark} onChange={e=>setRemark(e.target.value)} style={{marginBottom:'16px'}}/>
            <button className="btn btn-r" onClick={depoint}><i className="ti ti-check"/>Confirmer le dépointage</button>
            <button className="btn btn-s" style={{marginTop:'8px'}} onClick={()=>setShowDepoint(false)}>Annuler</button>
          </div>
        </div>
      )}

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
