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
  const [startSector, setStartSector] = useState('')
  const [segments, setSegments] = useState([])
  const [showSectorModal, setShowSectorModal] = useState(false)
  const [sectorInput, setSectorInput] = useState('')
  const [savingSector, setSavingSector] = useState(false)

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
    if (l?.id) {
      const { data: segs } = await supabase.from('shift_segments')
        .select('*').eq('time_log_id', l.id).order('started_at')
      setSegments(segs||[])
    } else {
      setSegments([])
    }
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
    const { data: newLog, error: insErr } = await supabase.from('time_logs').upsert({
      user_id: profile.id, company_id: company.id,
      log_date: today, punched_in: new Date().toISOString(),
    }, { onConflict: 'user_id,log_date' }).select().single()

    if (!insErr && newLog && company.sectors_enabled) {
      await supabase.from('shift_segments').insert({
        time_log_id: newLog.id, company_id: company.id, user_id: profile.id,
        sector: startSector.trim() || 'Général',
        started_at: new Date().toISOString(),
      })
    }

    setCheckingCode(false); setShowCodeModal(false); setCodeInput(''); setStartSector('')
    loadLog(); showToast('Pointé ✅')
  }

  function currentOpenSegment() {
    return segments.find(s => !s.ended_at) || null
  }

  async function togglePause() {
    if (!log) return
    const now = new Date().toISOString()
    if (isPaused) {
      await supabase.from('time_logs').update({ pause_end: now }).eq('id', log.id)
      if (company?.sectors_enabled) {
        const lastSector = segments[segments.length-1]?.sector || 'Général'
        await supabase.from('shift_segments').insert({
          time_log_id: log.id, company_id: company.id, user_id: profile.id,
          sector: lastSector, started_at: now,
        })
      }
    } else {
      await supabase.from('time_logs').update({ pause_start: now }).eq('id', log.id)
      if (company?.sectors_enabled) {
        const open = currentOpenSegment()
        if (open) await supabase.from('shift_segments').update({ ended_at: now }).eq('id', open.id)
      }
    }
    loadLog()
  }

  async function changeSector() {
    if (!log || !sectorInput.trim() || savingSector) return
    setSavingSector(true)
    const now = new Date().toISOString()
    const open = currentOpenSegment()
    if (open) await supabase.from('shift_segments').update({ ended_at: now }).eq('id', open.id)
    await supabase.from('shift_segments').insert({
      time_log_id: log.id, company_id: company.id, user_id: profile.id,
      sector: sectorInput.trim(), started_at: now,
    })
    setSavingSector(false); setShowSectorModal(false); setSectorInput('')
    loadLog(); showToast('Secteur changé ✅')
  }

  async function depoint() {
    if (!log) return
    const net = workedMs / 3600000
    const now = new Date().toISOString()
    if (company?.sectors_enabled) {
      const open = currentOpenSegment()
      if (open) await supabase.from('shift_segments').update({ ended_at: now }).eq('id', open.id)
    }
    await supabase.from('time_logs').update({
      punched_out: now, net_hours: net,
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
            <div style={{display:'flex',gap:'8px',marginTop:'14px',justifyContent:'center',flexWrap:'wrap'}}>
              <button className={`btn btn-sm ${isPaused?'btn-g':'btn-o'}`} onClick={togglePause}>
                <i className={`ti ${isPaused?'ti-play':'ti-player-pause'}`}/>
                {isPaused?'Reprendre':'Pause'}
              </button>
              {isWorking && company?.sectors_enabled && (
                <button className="btn btn-sm btn-s" onClick={()=>{ setSectorInput(''); setShowSectorModal(true) }}>
                  <i className="ti ti-map-pin"/>Changer de secteur
                </button>
              )}
              <button className="btn btn-sm btn-r" onClick={()=>setShowDepoint(true)}>
                <i className="ti ti-player-stop"/>Dépointer
              </button>
            </div>
          )}
          {company?.sectors_enabled && isWorking && currentOpenSegment() && (
            <div style={{marginTop:'10px',fontSize:'12px',color:'var(--text2)'}}>
              📍 Secteur actuel : <strong style={{color:'var(--text)'}}>{currentOpenSegment().sector}</strong> · depuis {format(parseISO(currentOpenSegment().started_at),'HH:mm')}
            </div>
          )}
          {isDone && log?.punched_in && (
            <div style={{marginTop:'12px',fontSize:'13px',color:'var(--text2)'}}>
              {format(parseISO(log.punched_in),'HH:mm')} → {format(parseISO(log.punched_out),'HH:mm')} · <strong style={{color:'var(--green)'}}>{fmtHM(workedMs)}</strong>
            </div>
          )}
        </div>

        {/* Historique des secteurs du jour */}
        {company?.sectors_enabled && segments.length > 0 && (
          <div className="card">
            <div className="card-title">Secteurs aujourd'hui</div>
            {segments.map(seg => {
              const end = seg.ended_at ? new Date(seg.ended_at).getTime() : now
              const dur = Math.max(0, end - new Date(seg.started_at).getTime())
              return (
                <div key={seg.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'7px 0',borderBottom:'1px solid var(--border)'}}>
                  <i className="ti ti-map-pin" style={{fontSize:'16px',color:'var(--blue)',flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'13px',fontWeight:'700'}}>{seg.sector}</div>
                    <div style={{fontSize:'11px',color:'var(--text3)'}}>
                      {format(parseISO(seg.started_at),'HH:mm')} → {seg.ended_at?format(parseISO(seg.ended_at),'HH:mm'):'en cours'}
                    </div>
                  </div>
                  <div style={{fontSize:'12px',fontWeight:'700',color:'var(--text2)'}}>{fmtHM(dur)}</div>
                </div>
              )
            })}
          </div>
        )}

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
            {company?.sectors_enabled && (
              <div className="iw" style={{marginBottom:'8px'}}>
                <div className="il">Secteur de départ (optionnel)</div>
                <input className="if" value={startSector} onChange={e=>setStartSector(e.target.value)} placeholder="Ex: Piste 3, Chantier Nord…"/>
              </div>
            )}
            <button className="btn btn-p" onClick={confirmCodeAndPunchIn} disabled={checkingCode} style={{marginTop:'8px'}}>
              <i className="ti ti-check"/>{checkingCode?'Vérification…':'Valider et pointer'}
            </button>
            <button className="btn btn-s" style={{marginTop:'8px'}} onClick={()=>setShowCodeModal(false)}>Annuler</button>
          </div>
        </div>
      )}

      {/* MODAL CHANGEMENT DE SECTEUR */}
      {showSectorModal && (
        <div className="modal-bg" onClick={()=>setShowSectorModal(false)}>
          <div className="ms" onClick={e=>e.stopPropagation()}>
            <div className="mh"/>
            <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'16px'}}>
              <div style={{width:'46px',height:'46px',borderRadius:'50%',background:'var(--blue-bg)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <i className="ti ti-map-pin" style={{fontSize:'22px',color:'var(--blue)'}}/>
              </div>
              <div>
                <div style={{fontSize:'18px',fontWeight:'800'}}>Changer de secteur</div>
                <div style={{fontSize:'13px',color:'var(--text2)'}}>Le compteur continue de tourner</div>
              </div>
            </div>
            <div className="iw" style={{marginBottom:'16px'}}>
              <div className="il">Nouveau secteur</div>
              <input className="if" autoFocus value={sectorInput} onChange={e=>setSectorInput(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter') changeSector() }}
                placeholder="Ex: Piste 3, Chantier Nord…"/>
            </div>
            <button className="btn btn-p" onClick={changeSector} disabled={!sectorInput.trim()||savingSector}>
              <i className="ti ti-check"/>{savingSector?'…':'Confirmer le changement'}
            </button>
            <button className="btn btn-s" style={{marginTop:'8px'}} onClick={()=>setShowSectorModal(false)}>Annuler</button>
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
