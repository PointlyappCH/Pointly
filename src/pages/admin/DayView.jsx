import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { format, parseISO, isToday } from 'date-fns'
import { fr } from 'date-fns/locale'

const HOUR_START = 6   // 06:00
const HOUR_END   = 24  // 24:00
const HOURS      = Array.from({ length: HOUR_END - HOUR_START }, (_,i) => HOUR_START + i)
const HOUR_PX    = 56  // pixels par heure

export default function DayView() {
  const { profile, company } = useAuth()
  const [searchParams] = useSearchParams()
  const dateParam = searchParams.get('date') || format(new Date(), 'yyyy-MM-dd')

  const [shifts,  setShifts]  = useState([])
  const [logs,    setLogs]    = useState([])
  const [emps,    setEmps]    = useState([])
  const [postes,  setPostes]  = useState([])
  const [note,    setNote]    = useState(null)
  const [now,     setNow]     = useState(new Date())
  const [modal,   setModal]   = useState(null) // { emp? } pour ajouter/modifier
  const [toast,   setToast]   = useState('')

  const [shiftForm, setShiftForm] = useState({
    userId:'', poste:'', startTime:'08:00', endTime:'17:00', hasEndTime:true
  })

  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''),2800) }
  function mkIni(n=''){ const p=n.trim().split(' '); return((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase() }
  function timeToH(t){ if(!t)return null; const[h,m]=t.split(':'); return parseInt(h)+parseInt(m)/60 }
  function hToTime(h){ return `${String(Math.floor(h)).padStart(2,'0')}:${String(Math.round((h%1)*60)).padStart(2,'0')}` }
  function hToY(h){ return (h - HOUR_START) * HOUR_PX }
  function hToH(ms){ const h=Math.floor(ms/3600000); const m=Math.floor((ms%3600000)/60000); return `${h}h${String(m).padStart(2,'0')}` }

  async function load() {
    if (!company) return
    const [{ data:s },{ data:l },{ data:e },{ data:p },{ data:n }] = await Promise.all([
      supabase.from('shifts').select('*, profiles(full_name,color_bg,color_fg)')
        .eq('company_id', company.id).eq('shift_date', dateParam),
      supabase.from('time_logs').select('*')
        .eq('company_id', company.id).eq('log_date', dateParam),
      supabase.from('profiles').select('*').eq('company_id', company.id).eq('role','employee').order('full_name'),
      supabase.from('postes').select('*').eq('company_id', company.id).order('name'),
      supabase.from('day_notes').select('*').eq('company_id', company.id).eq('note_date', dateParam).maybeSingle(),
    ])
    setShifts(s||[]); setLogs(l||[]); setEmps(e||[]); setPostes(p||[]); setNote(n)
    if (e?.length) setShiftForm(f=>({...f, userId:e[0].id, poste:e[0].poste||p?.[0]?.name||''}))
  }

  useEffect(() => {
    load()
    const interval = setInterval(() => setNow(new Date()), 30000)
    const ch = supabase.channel('dayview')
      .on('postgres_changes',{event:'*',schema:'public',table:'time_logs'},load)
      .on('postgres_changes',{event:'*',schema:'public',table:'shifts'},load)
      .subscribe()
    return () => { clearInterval(interval); supabase.removeChannel(ch) }
  }, [company, dateParam])

  async function saveShift() {
    if (!shiftForm.userId || !shiftForm.poste) return
    const existing = shifts.find(s=>s.user_id===shiftForm.userId)
    if (existing) {
      await supabase.from('shifts').update({
        poste: shiftForm.poste,
        start_time: shiftForm.startTime,
        end_time: shiftForm.hasEndTime ? shiftForm.endTime : null,
      }).eq('id', existing.id)
    } else {
      await supabase.from('shifts').insert({
        company_id: company.id, user_id: shiftForm.userId,
        shift_date: dateParam, poste: shiftForm.poste,
        start_time: shiftForm.startTime,
        end_time: shiftForm.hasEndTime ? shiftForm.endTime : null,
        created_by: profile.id,
      })
    }
    load(); setModal(null); showToast('Shift enregistré ✅')
  }

  async function removeShift(id) {
    await supabase.from('shifts').delete().eq('id', id)
    load(); showToast('Shift supprimé')
  }

  function openModal(emp) {
    const existing = emp ? shifts.find(s=>s.user_id===emp.id) : null
    setShiftForm({
      userId: emp?.id || (emps[0]?.id||''),
      poste: existing?.poste || emp?.poste || postes[0]?.name || '',
      startTime: existing?.start_time?.slice(0,5) || '08:00',
      endTime: existing?.end_time?.slice(0,5) || '17:00',
      hasEndTime: !!existing?.end_time || true,
    })
    setModal({ emp })
  }

  // ── Calcul durée shift ──
  function shiftDuration(s) {
    const start = timeToH(s.start_time?.slice(0,5))
    const end   = s.end_time ? timeToH(s.end_time.slice(0,5)) : null
    if (!start) return null
    if (end) return end - start
    // Si pointé, utilise le log
    const log = logs.find(l=>l.user_id===s.user_id)
    if (log?.punched_out) {
      const realEnd = new Date(log.punched_out)
      return realEnd.getHours() + realEnd.getMinutes()/60 - start
    }
    if (log?.punched_in) {
      const nowH = now.getHours() + now.getMinutes()/60
      return nowH - start
    }
    return 2 // défaut 2h si non pointé et pas de fin fixée
  }

  function logStatus(userId) {
    const log = logs.find(l=>l.user_id===userId)
    if (!log?.punched_in) return null
    if (log.error_24h) return { color:'var(--red)', label:'Erreur' }
    if (log.punched_out) return { color:'var(--green)', label:'Terminé', punchIn: log.punched_in, punchOut: log.punched_out }
    if (log.pause_start && !log.pause_end) return { color:'var(--orange)', label:'Pause', punchIn: log.punched_in }
    return { color:'var(--green)', label:'En cours', punchIn: log.punched_in }
  }

  const dateObj = parseISO(dateParam)
  const isCurrentDay = isToday(dateObj)
  const nowH = now.getHours() + now.getMinutes()/60

  // Couleurs par poste (automatique)
  const posteColors = ['#185FA5','#0A5E45','#7A4500','#534AB7','#8B1F1F','#854F0B']
  const posteColorMap = {}
  postes.forEach((p,i) => { posteColorMap[p.name] = posteColors[i % posteColors.length] })

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/admin/planning" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <h1>{format(dateObj,'EEEE d MMMM',{locale:fr})}</h1>
        <button className="btn btn-sm btn-p" onClick={()=>openModal(null)}>
          <i className="ti ti-plus"/>Shift
        </button>
      </div>

      <div className="content" style={{padding:'0',paddingBottom:'80px'}}>

        {/* Note du jour */}
        {note && (
          <div style={{padding:'10px 14px',background:note.color==='red'?'var(--red-bg)':'var(--blue-bg)',borderBottom:'1px solid var(--border)',display:'flex',gap:'8px',alignItems:'center'}}>
            <i className={`ti ${note.color==='red'?'ti-alert-circle':'ti-info-circle'}`} style={{color:note.color==='red'?'var(--red)':'var(--blue)',flexShrink:0}}/>
            <span style={{fontSize:'13px',color:note.color==='red'?'var(--red)':'var(--blue)',fontWeight:'600'}}>{note.content}</span>
          </div>
        )}

        {/* Stats rapides */}
        <div style={{padding:'10px 14px',display:'flex',gap:'8px',borderBottom:'1px solid var(--border)',background:'var(--surface)'}}>
          <span className="badge bg">{shifts.length} shift{shifts.length!==1?'s':''}</span>
          <span className="badge bb">{logs.filter(l=>l.punched_in&&!l.punched_out).length} en cours</span>
          {logs.filter(l=>l.error_24h).length>0 && <span className="badge br">⚠ {logs.filter(l=>l.error_24h).length} erreur{logs.filter(l=>l.error_24h).length>1?'s':''}</span>}
        </div>

        {/* ── TIMELINE ── */}
        <div style={{display:'flex',overflowY:'auto',position:'relative',background:'var(--bg)'}}>

          {/* Colonne heures */}
          <div style={{width:'44px',flexShrink:0,position:'sticky',left:0,zIndex:2,background:'var(--surface)',borderRight:'1px solid var(--border)'}}>
            <div style={{height:`${(HOUR_END-HOUR_START)*HOUR_PX}px`,position:'relative'}}>
              {HOURS.map(h=>(
                <div key={h} style={{position:'absolute',top:`${hToY(h)}px`,width:'100%',paddingRight:'4px'}}>
                  <span style={{fontSize:'10px',fontWeight:'600',color:'var(--text3)',display:'block',textAlign:'right',lineHeight:'1',transform:'translateY(-50%)'}}>{String(h).padStart(2,'0')}:00</span>
                </div>
              ))}
            </div>
          </div>

          {/* Zone timeline */}
          <div style={{flex:1,position:'relative',minWidth:'0'}}>
            <div style={{height:`${(HOUR_END-HOUR_START)*HOUR_PX}px`,position:'relative'}}>

              {/* Lignes horizontales heures */}
              {HOURS.map(h=>(
                <div key={h} style={{position:'absolute',top:`${hToY(h)}px`,left:0,right:0,borderTop:`1px solid ${h%2===0?'var(--border)':'rgba(0,0,0,.04)'}`,pointerEvents:'none'}}/>
              ))}

              {/* Ligne "maintenant" */}
              {isCurrentDay && nowH >= HOUR_START && nowH <= HOUR_END && (
                <div style={{position:'absolute',top:`${hToY(nowH)}px`,left:0,right:0,zIndex:5,pointerEvents:'none',display:'flex',alignItems:'center',gap:'4px'}}>
                  <div style={{width:'8px',height:'8px',borderRadius:'50%',background:'var(--red)',flexShrink:0,marginLeft:'-4px'}}/>
                  <div style={{flex:1,height:'1.5px',background:'var(--red)'}}/>
                  <span style={{fontSize:'10px',fontWeight:'700',color:'var(--red)',paddingRight:'6px',background:'var(--bg)',whiteSpace:'nowrap'}}>
                    {format(now,'HH:mm')}
                  </span>
                </div>
              )}

              {/* Colonnes par employé */}
              {shifts.length === 0 && (
                <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center'}}>
                  <i className="ti ti-calendar-off" style={{fontSize:'32px',color:'var(--text3)',display:'block',marginBottom:'8px'}}/>
                  <div style={{fontSize:'13px',color:'var(--text3)'}}>Aucun shift planifié ce jour</div>
                  <button className="btn btn-p btn-sm" style={{marginTop:'12px'}} onClick={()=>openModal(null)}>
                    <i className="ti ti-plus"/>Ajouter un shift
                  </button>
                </div>
              )}

              {/* Shifts */}
              {(() => {
                // Distribuer les shifts en colonnes pour éviter les chevauchements
                const cols = []
                shifts.forEach(s => {
                  const startH = timeToH(s.start_time?.slice(0,5)) || HOUR_START
                  const dur    = shiftDuration(s) || 2
                  const endH   = startH + dur
                  let placed   = false
                  for (let c=0; c<cols.length; c++) {
                    const lastShift = cols[c][cols[c].length-1]
                    const lastEnd   = timeToH(lastShift.start_time?.slice(0,5)) + (shiftDuration(lastShift)||2)
                    if (startH >= lastEnd) { cols[c].push(s); placed=true; break }
                  }
                  if (!placed) cols.push([s])
                })

                const colW = cols.length > 0 ? `calc(${100/cols.length}% - 2px)` : '100%'

                return cols.map((col, ci) => col.map(s => {
                  const startH = timeToH(s.start_time?.slice(0,5)) || HOUR_START
                  const dur    = Math.max(0.5, shiftDuration(s) || 2)
                  const endH   = startH + dur
                  const top    = hToY(Math.max(startH, HOUR_START))
                  const height = hToY(Math.min(endH, HOUR_END)) - hToY(Math.max(startH, HOUR_START))
                  const status = logStatus(s.user_id)
                  const emp    = emps.find(e=>e.id===s.user_id)
                  const color  = posteColorMap[s.poste] || 'var(--accent)'
                  const log    = logs.find(l=>l.user_id===s.user_id)

                  // Calcul de la barre de progression (temps réel pointé)
                  let progressH = 0
                  if (log?.punched_in) {
                    const punchH = new Date(log.punched_in).getHours() + new Date(log.punched_in).getMinutes()/60
                    const punchEndH = log.punched_out
                      ? new Date(log.punched_out).getHours() + new Date(log.punched_out).getMinutes()/60
                      : Math.min(nowH, startH + dur)
                    progressH = Math.max(0, punchEndH - Math.max(punchH, startH))
                  }
                  const progressPct = dur > 0 ? Math.min(100, (progressH/dur)*100) : 0

                  return (
                    <div key={s.id} style={{
                      position:'absolute', top:`${top}px`, height:`${Math.max(height,28)}px`,
                      left:`calc(${ci * (100/cols.length)}% + 4px)`, width:`calc(${100/cols.length}% - 8px)`,
                      background:`${color}15`, border:`2px solid ${color}`,
                      borderRadius:'10px', overflow:'hidden', cursor:'pointer', zIndex:3,
                      transition:'all .15s',
                    }} onClick={()=>openModal(emp)}>
                      {/* Barre de progression temps réel */}
                      {progressPct > 0 && (
                        <div style={{position:'absolute',top:0,left:0,width:`${progressPct}%`,height:'100%',background:`${color}25`,borderRight:`2px solid ${color}`,zIndex:1}}/>
                      )}
                      <div style={{position:'relative',zIndex:2,padding:'4px 6px',height:'100%',display:'flex',flexDirection:'column',justifyContent:'space-between'}}>
                        <div>
                          {/* Initiales + nom */}
                          <div style={{display:'flex',alignItems:'center',gap:'4px',marginBottom:'2px'}}>
                            <div style={{width:'20px',height:'20px',borderRadius:'50%',background:emp?.color_bg||'#E6F1FB',color:emp?.color_fg||'#185FA5',fontSize:'8px',fontWeight:'700',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                              {mkIni(s.profiles?.full_name||emp?.full_name||'')}
                            </div>
                            {height > 40 && <span style={{fontSize:'11px',fontWeight:'700',color:color,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                              {s.profiles?.full_name?.split(' ')[0] || emp?.full_name?.split(' ')[0]}
                            </span>}
                          </div>
                          {height > 52 && <div style={{fontSize:'10px',fontWeight:'600',color:color,opacity:.85}}>{s.poste}</div>}
                          {height > 68 && <div style={{fontSize:'10px',color:color,opacity:.7}}>
                            {s.start_time?.slice(0,5)} → {s.end_time?.slice(0,5)||'?'}
                          </div>}
                        </div>
                        {/* Badge statut */}
                        {status && height > 44 && (
                          <div style={{fontSize:'9px',fontWeight:'700',color:status.color,background:`${status.color}20`,borderRadius:'8px',padding:'2px 5px',display:'inline-block',alignSelf:'flex-start'}}>
                            {status.label}
                          </div>
                        )}
                      </div>
                      {/* Bouton suppression */}
                      <button style={{position:'absolute',top:'2px',right:'2px',background:'none',border:'none',cursor:'pointer',color:color,fontSize:'14px',padding:'2px',zIndex:4,opacity:.6}}
                        onClick={e=>{e.stopPropagation();removeShift(s.id)}}>
                        <i className="ti ti-x"/>
                      </button>
                    </div>
                  )
                }))
              })()}
            </div>
          </div>
        </div>

        {/* Liste employés sans shift */}
        {emps.filter(e=>!shifts.find(s=>s.user_id===e.id)).length > 0 && (
          <div style={{padding:'12px 14px',borderTop:'1px solid var(--border)'}}>
            <div style={{fontSize:'11px',fontWeight:'700',color:'var(--text2)',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'.05em'}}>Non planifiés ce jour</div>
            <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
              {emps.filter(e=>!shifts.find(s=>s.user_id===e.id)).map(e=>(
                <div key={e.id} onClick={()=>openModal(e)}
                  style={{display:'flex',alignItems:'center',gap:'6px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'20px',padding:'5px 12px',cursor:'pointer',transition:'border-color .15s'}}
                  onMouseEnter={el=>el.currentTarget.style.borderColor='var(--accent)'}
                  onMouseLeave={el=>el.currentTarget.style.borderColor='var(--border)'}>
                  <div className="av" style={{width:'22px',height:'22px',fontSize:'8px',fontWeight:'700',background:e.color_bg||'#E6F1FB',color:e.color_fg||'#185FA5'}}>
                    {mkIni(e.full_name)}
                  </div>
                  <span style={{fontSize:'12px',fontWeight:'600'}}>{e.full_name.split(' ')[0]}</span>
                  <i className="ti ti-plus" style={{fontSize:'12px',color:'var(--accent)'}}/>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL AJOUT/MODIF SHIFT ── */}
      {modal && (
        <div className="modal-bg" onClick={()=>setModal(null)}>
          <div className="ms" onClick={e=>e.stopPropagation()}>
            <div className="mh"/>
            <div style={{fontSize:'18px',fontWeight:'800',marginBottom:'4px'}}>
              {shifts.find(s=>s.user_id===shiftForm.userId) ? 'Modifier le shift' : 'Ajouter un shift'}
            </div>
            <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'16px'}}>{format(dateObj,'EEEE d MMMM',{locale:fr})}</div>

            <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
              {/* Employé */}
              <div className="iw"><div className="il">Employé</div>
                <select className="if" value={shiftForm.userId}
                  onChange={e=>setShiftForm(f=>({...f,userId:e.target.value,poste:emps.find(em=>em.id===e.target.value)?.poste||postes[0]?.name||''}))}
                  style={{cursor:'pointer'}}>
                  {emps.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>

              {/* Poste */}
              <div className="iw"><div className="il">Poste de travail</div>
                <select className="if" value={shiftForm.poste} onChange={e=>setShiftForm(f=>({...f,poste:e.target.value}))} style={{cursor:'pointer'}}>
                  {postes.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
                  {postes.length===0 && <option>— Créez des postes dans Équipe</option>}
                </select>
              </div>

              {/* Horaires */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                <div className="iw"><div className="il">Heure de début</div>
                  <input className="if" type="time" value={shiftForm.startTime}
                    onChange={e=>setShiftForm(f=>({...f,startTime:e.target.value}))}
                    style={{fontSize:'18px',fontWeight:'700',textAlign:'center'}}/>
                </div>
                <div className="iw">
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div className="il">Heure de fin</div>
                    <label style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'11px',color:'var(--text2)',cursor:'pointer'}}>
                      <input type="checkbox" checked={shiftForm.hasEndTime}
                        onChange={e=>setShiftForm(f=>({...f,hasEndTime:e.target.checked}))}/>
                      Fixée
                    </label>
                  </div>
                  <input className="if" type="time" value={shiftForm.endTime}
                    onChange={e=>setShiftForm(f=>({...f,endTime:e.target.value}))}
                    disabled={!shiftForm.hasEndTime}
                    style={{fontSize:'18px',fontWeight:'700',textAlign:'center',opacity:shiftForm.hasEndTime?1:.4}}/>
                </div>
              </div>

              {/* Aperçu durée */}
              {shiftForm.hasEndTime && shiftForm.startTime && shiftForm.endTime && (() => {
                const dur = timeToH(shiftForm.endTime) - timeToH(shiftForm.startTime)
                if (dur <= 0) return null
                return (
                  <div style={{background:'var(--green-bg)',borderRadius:'var(--rs)',padding:'10px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:'13px',color:'#0A5E45',fontWeight:'600'}}>Durée du shift</span>
                    <span style={{fontSize:'18px',fontWeight:'800',color:'var(--green)'}}>{hToH(dur*3600000)}</span>
                  </div>
                )
              })()}
            </div>

            <button className="btn btn-p" style={{marginTop:'16px'}} onClick={saveShift}>
              <i className="ti ti-check"/>Enregistrer le shift
            </button>
            {shifts.find(s=>s.user_id===shiftForm.userId) && (
              <button className="btn btn-s" style={{marginTop:'8px',color:'var(--red)'}}
                onClick={()=>{removeShift(shifts.find(s=>s.user_id===shiftForm.userId).id);setModal(null)}}>
                <i className="ti ti-trash"/>Supprimer ce shift
              </button>
            )}
            <button className="btn btn-s" style={{marginTop:'8px'}} onClick={()=>setModal(null)}>Annuler</button>
          </div>
        </div>
      )}

      <div className="nav">
        <Link to="/admin" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-layout-dashboard"/>Accueil</div></Link>
        <Link to="/admin/planning" style={{textDecoration:'none',flex:1}}><div className="nav-item active"><i className="ti ti-calendar"/>Planning</div></Link>
        <Link to="/admin/team" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-users"/>Équipe</div></Link>
        <Link to="/admin/chat" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-message-2"/>Chat</div></Link>
        <Link to="/admin/profile" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-user-circle"/>Profil</div></Link>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
