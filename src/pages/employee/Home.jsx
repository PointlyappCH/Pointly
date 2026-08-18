import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

const MAX_MS = 24 * 60 * 60 * 1000

export default function EmpHome() {
  const { profile, company } = useAuth()
  const [log, setLog]         = useState(null)
  const [myShift, setMyShift] = useState(null)
  const [now, setNow]         = useState(Date.now())
  const [toast, setToast]     = useState('')
  const [showDepoint, setShowDepoint] = useState(false)
  const [remark, setRemark]   = useState('')
  const [pendingExchanges, setPendingExchanges] = useState(0)
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [codeError, setCodeError] = useState('')
  const [checkingCode, setCheckingCode] = useState(false)

  const today = format(new Date(), 'yyyy-MM-dd')
  const dateLabel = format(new Date(), "EEEE d MMMM", { locale: fr })
  const firstName = profile?.full_name?.split(' ')[0] || ''

  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''),2800) }
  function mkIni(n=''){ const p=n.trim().split(' '); return((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase() }

  async function loadLog() {
    if (!profile || !company) return
    const [{ data: l }, { data: s }, { data: ex }] = await Promise.all([
      supabase.from('time_logs').select('*').eq('user_id', profile.id).eq('log_date', today).maybeSingle(),
      supabase.from('shifts').select('*').eq('user_id', profile.id).eq('shift_date', today).maybeSingle(),
      supabase.from('exchanges').select('id').eq('target_id', profile.id).eq('status','pending'),
    ])
    setLog(l); setMyShift(s); setPendingExchanges((ex||[]).length)
  }

  useEffect(() => {
    loadLog()
    const iv = setInterval(() => setNow(Date.now()), 1000)
    const ch = supabase.channel('emp-home-'+profile?.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'time_logs'},loadLog)
      .subscribe()
    return () => { clearInterval(iv); supabase.removeChannel(ch) }
  }, [profile, company])

  function getWorkedMs() {
    if (!log?.punched_in) return 0
    const start  = new Date(log.punched_in).getTime()
    const end    = log.punched_out ? new Date(log.punched_out).getTime() : Math.min(now, start + MAX_MS)
    const pauseMs = log.pause_start && log.pause_end
      ? new Date(log.pause_end).getTime() - new Date(log.pause_start).getTime()
      : log.pause_start && !log.pause_end ? now - new Date(log.pause_start).getTime() : 0
    return Math.max(0, end - start - pauseMs)
  }

  function fmtMs(ms){ const s=Math.floor(ms/1000); return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}` }
  function fmtHM(ms){ const s=Math.floor(ms/1000); return `${Math.floor(s/3600)}h${String(Math.floor((s%3600)/60)).padStart(2,'0')}` }

  const workedMs   = getWorkedMs()
  const isError    = log?.punched_in && !log?.punched_out && (now - new Date(log.punched_in).getTime()) >= MAX_MS
  const isPaused   = log?.pause_start && !log?.pause_end
  const isWorking  = log?.punched_in && !log?.punched_out && !isPaused && !isError
  const isDone     = !!log?.punched_out

  function punch() {
    if (!profile || !company) return
    if (isError || isDone) { setShowDepoint(true); return }
    if (isWorking || isPaused) { setShowDepoint(true); return }
    // Démarrage d'une journée : on demande d'abord le code affiché dans la cabane
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
      user_id: profile.id, company_id: company.id,
      log_date: today, punched_in: new Date().toISOString(),
    }, { onConflict: 'user_id,log_date' })
    setCheckingCode(false); setShowCodeModal(false); setCodeInput('')
    loadLog(); showToast('Pointé ✅')
  }

  async function togglePause() {
    if (!log) return
    if (isPaused) await supabase.from('time_logs').update({ pause_end: new Date().toISOString() }).eq('id', log.id)
    else          await supabase.from('time_logs').update({ pause_start: new Date().toISOString() }).eq('id', log.id)
    loadLog()
  }

  async function depoint() {
    if (!log) return
    const net = workedMs / 3600000
    await supabase.from('time_logs').update({
      punched_out: new Date().toISOString(), net_hours: net,
      remark: remark||null, error_24h: isError,
    }).eq('id', log.id)
    setShowDepoint(false); setRemark(''); loadLog()
    showToast(isError ? '⚠️ Correction enregistrée' : 'Dépointé ✅')
  }

  let circleClass='pc', icon='ti-clock', label='Pointer'
  if (isError)    { circleClass='pc error'; icon='ti-alert-triangle'; label='Erreur 24h' }
  else if (isDone)   { circleClass='pc done';  icon='ti-check';           label='Terminé' }
  else if (isPaused) { circleClass='pc ps';    icon='ti-player-pause';    label='En pause' }
  else if (isWorking){ circleClass='pc in';    icon='ti-clock-check';     label='En cours' }

  return (
    <div className="screen">
      <div className="topbar">
        <div style={{width:'30px',height:'30px',borderRadius:'9px',background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          <i className="ti ti-clock-check" style={{fontSize:'15px',color:'#fff'}}/>
        </div>
        <h1>Mon espace</h1>
        {pendingExchanges > 0 && <span className="badge bo">{pendingExchanges} échange{pendingExchanges>1?'s':''}</span>}
      </div>

      <div className="content">
        <div style={{fontSize:'14px',color:'var(--text2)'}}>
          Bonjour <strong style={{color:'var(--text)'}}>{firstName}</strong> · {dateLabel}
        </div>

        {/* Erreur 24h */}
        {isError && (
          <div style={{background:'var(--red-bg)',border:'1.5px solid var(--red)',borderRadius:'var(--rs)',padding:'12px 14px',display:'flex',alignItems:'flex-start',gap:'10px'}}>
            <i className="ti ti-alert-triangle" style={{fontSize:'22px',color:'var(--red)',flexShrink:0,marginTop:'1px'}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:'14px',fontWeight:'700',color:'var(--red)',marginBottom:'3px'}}>Oubli de dépointage détecté</div>
              <div style={{fontSize:'12px',color:'#8B1F1F',lineHeight:'1.5'}}>Compteur arrêté après 24h. Contactez votre responsable.</div>
              <button className="btn btn-r btn-sm" style={{marginTop:'8px'}} onClick={()=>setShowDepoint(true)}><i className="ti ti-pencil"/>Corriger</button>
            </div>
          </div>
        )}

        {/* Shift du jour */}
        {myShift && (
          <Link to={`/emp/day?date=${today}`} style={{textDecoration:'none'}}>
            <div style={{background:'var(--blue-bg)',border:'1px solid var(--blue)',borderRadius:'var(--rs)',padding:'10px 14px',display:'flex',alignItems:'center',gap:'10px'}}>
              <i className="ti ti-calendar-event" style={{fontSize:'20px',color:'var(--blue)',flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:'13px',fontWeight:'700',color:'var(--blue)'}}>{myShift.poste}</div>
                <div style={{fontSize:'12px',color:'var(--blue)',opacity:.8}}>
                  {myShift.start_time?.slice(0,5)} → {myShift.end_time?.slice(0,5)||'fin au dépointage'} · Voir ma journée →
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* PUNCH */}
        <div className="card" style={{textAlign:'center',padding:'20px'}}>
          <div style={{fontSize:'30px',fontWeight:'800',fontVariantNumeric:'tabular-nums',margin:'8px 0',color:isError?'var(--red)':'var(--text)',letterSpacing:'.01em'}}>
            {fmtMs(workedMs)}
          </div>
          <div className={circleClass} onClick={punch}>
            <i className={`ti ${icon} pi`}/>
            <div className="pl">{label}</div>
          </div>
          {(isWorking||isPaused) && !isDone && (
            <div style={{display:'flex',gap:'8px',marginTop:'14px',justifyContent:'center'}}>
              <button className={`btn btn-sm ${isPaused?'btn-g':'btn-o'}`} onClick={togglePause}>
                <i className={`ti ${isPaused?'ti-play':'ti-player-pause'}`}/>
                {isPaused?'Reprendre':'Pause'}
              </button>
              <button className="btn btn-sm btn-r" onClick={()=>setShowDepoint(true)}>
                <i className="ti ti-player-stop"/>Dépointer
              </button>
            </div>
          )}
          {isDone && log?.punched_in && (
            <div style={{marginTop:'12px',fontSize:'13px',color:'var(--text2)'}}>
              {format(parseISO(log.punched_in),'HH:mm')} → {format(parseISO(log.punched_out),'HH:mm')} · <strong style={{color:'var(--green)'}}>{fmtHM(workedMs)}</strong>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="sg">
          <div className="sc"><div className="sv">{fmtHM(workedMs)}</div><div className="sl">Aujourd'hui</div></div>
          <div className="sc"><div className="sv">{profile?.h_due||169}h</div><div className="sl">Dues/mois</div></div>
        </div>

        {/* Raccourcis */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
          <Link to="/emp/planning" style={{textDecoration:'none'}}>
            <div className="card" style={{textAlign:'center',padding:'16px',cursor:'pointer'}}>
              <i className="ti ti-calendar" style={{fontSize:'26px',color:'var(--blue)',display:'block',marginBottom:'6px'}}/>
              <div style={{fontSize:'12px',fontWeight:'700'}}>Mon planning</div>
            </div>
          </Link>
          <Link to="/emp/exchanges" style={{textDecoration:'none'}}>
            <div className="card" style={{textAlign:'center',padding:'16px',cursor:'pointer',position:'relative'}}>
              <i className="ti ti-arrows-exchange" style={{fontSize:'26px',color:'var(--orange)',display:'block',marginBottom:'6px'}}/>
              <div style={{fontSize:'12px',fontWeight:'700'}}>Échanges</div>
              {pendingExchanges>0 && <span style={{position:'absolute',top:'8px',right:'8px',background:'var(--red)',color:'#fff',fontSize:'10px',fontWeight:'700',width:'18px',height:'18px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center'}}>{pendingExchanges}</span>}
            </div>
          </Link>
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
        <Link to="/emp/profile" style={{textDecoration:'none',flex:1}}><div className="nav-item" style={{position:'relative'}}>
          <i className="ti ti-user-circle"/>Profil
        </div></Link>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
