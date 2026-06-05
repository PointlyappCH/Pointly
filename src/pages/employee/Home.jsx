import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const MAX_MS = 24 * 60 * 60 * 1000

export default function EmpHome() {
  const { profile, company } = useAuth()
  const [log, setLog]       = useState(null)
  const [now, setNow]       = useState(Date.now())
  const [toast, setToast]   = useState('')
  const [showDepoint, setShowDepoint] = useState(false)
  const [remark, setRemark] = useState('')
  const timerRef = useRef(null)

  const today     = format(new Date(), 'yyyy-MM-dd')
  const dateLabel = format(new Date(), "EEEE d MMMM", { locale: fr })
  const firstName = profile?.full_name?.split(' ')[0] || ''

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''), 2800) }

  async function loadLog() {
    if (!profile) return
    const { data } = await supabase
      .from('time_logs').select('*')
      .eq('user_id', profile.id).eq('log_date', today).maybeSingle()
    setLog(data)
  }

  useEffect(() => {
    loadLog()
    timerRef.current = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timerRef.current)
  }, [profile])

  // ── Calcul timer ──
  function getWorkedMs() {
    if (!log?.punched_in) return 0
    const start = new Date(log.punched_in).getTime()
    const end   = log.punched_out ? new Date(log.punched_out).getTime() : Math.min(now, start + MAX_MS)
    const pauseMs = log.pause_start && log.pause_end
      ? new Date(log.pause_end).getTime() - new Date(log.pause_start).getTime()
      : log.pause_start && !log.pause_end ? now - new Date(log.pause_start).getTime() : 0
    return Math.max(0, end - start - pauseMs)
  }

  function fmtMs(ms) {
    const s = Math.floor(ms / 1000)
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  }
  function fmtHM(ms) {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s/3600)}h${String(Math.floor((s%3600)/60)).padStart(2,'0')}`
  }

  const workedMs    = getWorkedMs()
  const isError24h  = log?.punched_in && !log?.punched_out && (now - new Date(log.punched_in).getTime()) >= MAX_MS
  const isPaused    = log?.pause_start && !log?.pause_end
  const isWorking   = log?.punched_in && !log?.punched_out && !isPaused && !isError24h
  const isDone      = log?.punched_out

  // ── Pointage ──
  async function punch() {
    if (!profile || !company) return
    if (isError24h) { setShowDepoint(true); return }
    if (isDone) return
    if (isWorking || isPaused) { setShowDepoint(true); return }

    // Pointer
    const { error } = await supabase.from('time_logs').upsert({
      user_id: profile.id, company_id: company.id, log_date: today,
      punched_in: new Date().toISOString(),
    }, { onConflict: 'user_id,log_date' })
    if (error) { showToast('Erreur : '+error.message); return }
    loadLog(); showToast('Pointé ✅')
  }

  async function togglePause() {
    if (!log) return
    if (isPaused) {
      await supabase.from('time_logs').update({ pause_end: new Date().toISOString() }).eq('id', log.id)
    } else {
      await supabase.from('time_logs').update({ pause_start: new Date().toISOString() }).eq('id', log.id)
    }
    loadLog()
  }

  async function depoint() {
    if (!log) return
    const ms = getWorkedMs()
    const net = ms / 3600000
    await supabase.from('time_logs').update({
      punched_out: new Date().toISOString(),
      net_hours: net,
      remark: remark || null,
      error_24h: isError24h,
    }).eq('id', log.id)
    setShowDepoint(false); setRemark(''); loadLog()
    showToast(isError24h ? '⚠️ Correction enregistrée' : 'Dépointé ✅')
  }

  // ── UI ──
  let circleClass = 'pc'
  let icon = 'ti-clock'
  let label = 'Pointer'
  if (isError24h) { circleClass='pc error'; icon='ti-alert-triangle'; label='Erreur 24h' }
  else if (isDone)    { circleClass='pc done';  icon='ti-check';           label='Terminé' }
  else if (isPaused)  { circleClass='pc ps';    icon='ti-player-pause';    label='En pause' }
  else if (isWorking) { circleClass='pc in';    icon='ti-clock-check';     label='En cours' }

  return (
    <div className="screen">
      <div className="topbar">
        <div style={{width:'30px',height:'30px',borderRadius:'9px',background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          <i className="ti ti-clock-check" style={{fontSize:'15px',color:'#fff'}}/>
        </div>
        <h1>Mon espace</h1>
        <i className="ti ti-bell" style={{fontSize:'22px',color:'var(--text2)'}}/>
      </div>

      <div className="content">
        <div style={{fontSize:'14px',color:'var(--text2)'}}>Bonjour <strong style={{color:'var(--text)'}}>{firstName}</strong> · {dateLabel}</div>

        {isError24h && (
          <div style={{background:'var(--red-bg)',border:'1.5px solid var(--red)',borderRadius:'var(--rs)',padding:'12px 14px',display:'flex',alignItems:'flex-start',gap:'10px'}}>
            <i className="ti ti-alert-triangle" style={{fontSize:'22px',color:'var(--red)',flexShrink:0,marginTop:'1px'}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:'14px',fontWeight:'700',color:'var(--red)',marginBottom:'3px'}}>Oubli de dépointage détecté</div>
              <div style={{fontSize:'12px',color:'#8B1F1F',lineHeight:'1.5'}}>Compteur arrêté automatiquement après 24h. Contactez votre responsable pour corriger.</div>
              <button className="btn btn-r btn-sm" style={{marginTop:'8px'}} onClick={()=>setShowDepoint(true)}><i className="ti ti-pencil"/>Corriger maintenant</button>
            </div>
          </div>
        )}

        {/* PUNCH CARD */}
        <div className="card" style={{textAlign:'center',padding:'20px'}}>
          <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'4px'}}>
            {profile?.poste || '—'}
          </div>
          <div style={{fontSize:'28px',fontWeight:'800',fontVariantNumeric:'tabular-nums',margin:'8px 0',color:isError24h?'var(--red)':'var(--text)',letterSpacing:'.01em'}}>
            {fmtMs(workedMs)}
          </div>
          <div className={circleClass} onClick={punch}>
            <i className={`ti ${icon} pi`}/>
            <div className="pl">{label}</div>
          </div>
          {(isWorking || isPaused) && !isDone && (
            <div style={{display:'flex',gap:'8px',marginTop:'14px',justifyContent:'center'}}>
              <button className={`btn btn-sm ${isPaused?'btn-g':'btn-o'}`} onClick={togglePause}>
                <i className={`ti ${isPaused?'ti-play':'ti-player-pause'}`}/>
                {isPaused ? 'Reprendre' : 'Pause'}
              </button>
              <button className="btn btn-sm btn-r" onClick={()=>setShowDepoint(true)}>
                <i className="ti ti-player-stop"/>Dépointer
              </button>
            </div>
          )}
        </div>

        <div className="sg">
          <div className="sc"><div className="sv">{fmtHM(workedMs)}</div><div className="sl">Travaillé</div></div>
          <div className="sc"><div className="sv">{profile?.h_due||169}h</div><div className="sl">Dues/mois</div></div>
        </div>
      </div>

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
                <div style={{fontSize:'13px',color:'var(--text2)'}}>Temps travaillé : {fmtHM(workedMs)}</div>
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
        <Link to="/emp/planning" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-calendar"/>Planning</div></Link>
        <Link to="/emp/dispo" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-adjustments"/>Dispos</div></Link>
        <Link to="/emp/chat" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-message-2"/>Chat</div></Link>
        <Link to="/emp/exchanges" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-arrows-exchange"/>Échanges</div></Link>
        <Link to="/emp/profile" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-user-circle"/>Profil</div></Link>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
