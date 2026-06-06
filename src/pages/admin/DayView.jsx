import { useState, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { format, parseISO, isToday, addDays, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'

const HOUR_START = 6
const HOUR_END   = 23
const HOUR_PX    = 60

export default function DayView() {
  const { profile, company } = useAuth()
  const [searchParams]  = useSearchParams()
  const navigate        = useNavigate()
  const dateParam       = searchParams.get('date') || format(new Date(), 'yyyy-MM-dd')

  const [shifts,  setShifts]  = useState([])
  const [logs,    setLogs]    = useState([])
  const [emps,    setEmps]    = useState([])
  const [postes,  setPostes]  = useState([])
  const [tasks,   setTasks]   = useState([])
  const [note,    setNote]    = useState(null)
  const [now,     setNow]     = useState(new Date())
  const [loaded,  setLoaded]  = useState(false)
  const [shiftModal, setShiftModal] = useState(null)
  const [taskModal,  setTaskModal]  = useState(null)
  const [toast,      setToast]      = useState('')
  const [shiftForm,  setShiftForm]  = useState({ userId:'', poste:'', startTime:'08:00', endTime:'17:00', hasEndTime:true })
  const [taskForm,   setTaskForm]   = useState({ userId:'', time:'10:00', title:'', description:'', color:'#185FA5' })

  function showToast(m){ setToast(m); setTimeout(()=>setToast(''),2800) }
  function mkIni(n=''){ const p=n.trim().split(' '); return((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase() }
  function timeToMin(t){ if(!t) return 0; const[h,m]=(t.slice(0,5)).split(':'); return parseInt(h)*60+parseInt(m) }
  function minToY(min){ return ((min - HOUR_START*60) / 60) * HOUR_PX }
  function durToH(min){ return `${Math.floor(min/60)}h${String(min%60).padStart(2,'0')}` }

  const dateObj    = parseISO(dateParam)
  const prevDay    = format(subDays(dateObj,1),'yyyy-MM-dd')
  const nextDay    = format(addDays(dateObj,1),'yyyy-MM-dd')
  const isToday_   = isToday(dateObj)
  const nowMin     = now.getHours()*60+now.getMinutes()
  const totalMin   = (HOUR_END - HOUR_START + 1) * 60
  const totalPx    = (totalMin / 60) * HOUR_PX
  const employees  = emps.filter(e=>e.role==='employee')

  const PCOLORS = ['#185FA5','#0A5E45','#7A4500','#534AB7','#8B1F1F','#854F0B','#1D9E75','#E24B4A']
  const pColorMap = {}
  postes.forEach((p,i) => { pColorMap[p.name] = PCOLORS[i % PCOLORS.length] })

  const TASK_COLORS = [
    { value:'#185FA5', bg:'#E6F1FB' }, { value:'#0A5E45', bg:'#E1F5EE' },
    { value:'#7A4500', bg:'#FAEEDA' }, { value:'#534AB7', bg:'#EEEDFE' },
    { value:'#8B1F1F', bg:'#FCEBEB' },
  ]

  async function load() {
    if (!company?.id) return
    const [{ data:s },{ data:l },{ data:e },{ data:p },{ data:n },{ data:t }] = await Promise.all([
      supabase.from('shifts').select('*, profiles(full_name,color_bg,color_fg)').eq('company_id',company.id).eq('shift_date',dateParam),
      supabase.from('time_logs').select('*').eq('company_id',company.id).eq('log_date',dateParam),
      supabase.from('profiles').select('*').eq('company_id',company.id).order('full_name'),
      supabase.from('postes').select('*').eq('company_id',company.id).order('name'),
      supabase.from('day_notes').select('*').eq('company_id',company.id).eq('note_date',dateParam).maybeSingle(),
      supabase.from('shift_tasks').select('*').eq('company_id',company.id).eq('task_date',dateParam).order('task_time'),
    ])
    setShifts(s||[]); setLogs(l||[]); setEmps(e||[])
    setPostes(p||[]); setNote(n); setTasks(t||[])
    setLoaded(true)
  }

  async function reloadLogs() {
    if (!company?.id) return
    const { data:l } = await supabase.from('time_logs').select('*').eq('company_id',company.id).eq('log_date',dateParam)
    setLogs(l||[])
    setNow(new Date())
  }

  useEffect(() => {
    setLoaded(false)
    load()
    const clock = setInterval(() => setNow(new Date()), 10000)
    const poll  = setInterval(() => reloadLogs(), 15000)
    const ch = supabase.channel('dv-'+dateParam)
      .on('postgres_changes',{event:'*',schema:'public',table:'time_logs'},reloadLogs)
      .on('postgres_changes',{event:'*',schema:'public',table:'shifts'},load)
      .on('postgres_changes',{event:'*',schema:'public',table:'shift_tasks'},load)
      .subscribe()
    return () => { clearInterval(clock); clearInterval(poll); supabase.removeChannel(ch) }
  }, [company?.id, dateParam])

  // ── Shift CRUD ──
  async function saveShift() {
    if (!shiftForm.userId || !shiftForm.poste) return
    const existing = shifts.find(s=>s.user_id===shiftForm.userId)
    const payload  = { company_id:company.id, user_id:shiftForm.userId, shift_date:dateParam,
      poste:shiftForm.poste, start_time:shiftForm.startTime,
      end_time:shiftForm.hasEndTime ? shiftForm.endTime : null, created_by:profile.id }
    const { error } = existing
      ? await supabase.from('shifts').update(payload).eq('id',existing.id)
      : await supabase.from('shifts').insert(payload)
    if (error) { showToast('Erreur : '+error.message); return }
    await load(); setShiftModal(null); showToast('Shift enregistré ✅')
  }

  async function removeShift(id) {
    await supabase.from('shifts').delete().eq('id',id)
    await load(); showToast('Shift supprimé')
  }

  function openShiftModal(emp) {
    const existing = emp ? shifts.find(s=>s.user_id===emp.id) : null
    setShiftForm({
      userId:     emp?.id || employees[0]?.id || '',
      poste:      existing?.poste || emp?.poste || postes[0]?.name || '',
      startTime:  existing?.start_time?.slice(0,5) || '08:00',
      endTime:    existing?.end_time?.slice(0,5)   || '17:00',
      hasEndTime: existing ? !!existing.end_time : true,
    })
    setShiftModal({ emp })
  }

  // ── Task CRUD ──
  async function saveTask() {
    if (!taskForm.title.trim() || !taskModal) return
    const payload = { company_id:company.id, user_id:taskModal.userId,
      task_date:dateParam, task_time:taskForm.time,
      title:taskForm.title.trim(), description:taskForm.description.trim()||null,
      color:taskForm.color, created_by:profile.id }
    const { error } = taskModal.task?.id
      ? await supabase.from('shift_tasks').update(payload).eq('id',taskModal.task.id)
      : await supabase.from('shift_tasks').insert(payload)
    if (error) { showToast('Erreur : '+error.message); return }
    await load(); setTaskModal(null); showToast('Tâche enregistrée ✅')
  }

  async function removeTask(id) {
    await supabase.from('shift_tasks').delete().eq('id',id)
    await load()
  }

  function openTaskModal(userId, task=null) {
    setTaskForm({ userId, time:task?.task_time?.slice(0,5)||'10:00',
      title:task?.title||'', description:task?.description||'', color:task?.color||'#185FA5' })
    setTaskModal({ userId, task })
  }

  // ── Helpers ──
  function shiftDurMin(s) {
    const startMin = timeToMin(s.start_time)
    if (s.end_time) return timeToMin(s.end_time) - startMin
    const log = logs.find(l=>l.user_id===s.user_id)
    if (log?.punched_out) {
      const d = new Date(log.punched_out); return d.getHours()*60+d.getMinutes() - startMin
    }
    if (log?.punched_in) return nowMin - startMin
    return 120 // défaut 2h
  }

  function logStatus(uid) {
    const log = logs.find(l=>l.user_id===uid)
    if (!log?.punched_in) return null
    if (log.error_24h) return { color:'var(--red)', label:'Erreur' }
    if (log.punched_out) return { color:'var(--green)', label:'Terminé' }
    if (log.pause_start&&!log.pause_end) return { color:'var(--orange)', label:'Pause' }
    return { color:'var(--green)', label:'En cours' }
  }

  function progressPct(s) {
    const log = logs.find(l=>l.user_id===s.user_id)
    if (!log?.punched_in) return 0
    const startMin = timeToMin(s.start_time)
    const durMin   = Math.max(1, shiftDurMin(s))
    const punchMin = new Date(log.punched_in).getHours()*60+new Date(log.punched_in).getMinutes()
    const endMin   = log.punched_out
      ? new Date(log.punched_out).getHours()*60+new Date(log.punched_out).getMinutes()
      : Math.min(nowMin, startMin+durMin)
    return Math.min(100, Math.max(0, ((endMin-Math.max(punchMin,startMin))/durMin)*100))
  }

  // ── Calcul colonnes anti-chevauchement ──
  function buildCols() {
    const sorted = [...shifts].sort((a,b) => timeToMin(a.start_time) - timeToMin(b.start_time))
    const cols = []
    sorted.forEach(s => {
      const sMin = timeToMin(s.start_time)
      const eMin = sMin + Math.max(30, shiftDurMin(s))
      let placed = false
      for (let c=0; c<cols.length; c++) {
        const last = cols[c][cols[c].length-1]
        const lastEnd = timeToMin(last.start_time) + Math.max(30, shiftDurMin(last))
        if (sMin >= lastEnd) { cols[c].push(s); placed=true; break }
      }
      if (!placed) cols.push([s])
    })
    return cols
  }

  const HOURS = Array.from({length: HOUR_END - HOUR_START + 1}, (_,i) => HOUR_START+i)

  return (
    <div className="screen">
      {/* Topbar */}
      <div className="topbar">
        <Link to="/admin/planning" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <div style={{display:'flex',alignItems:'center',gap:'8px',flex:1}}>
          <i className="ti ti-chevron-left" style={{fontSize:'18px',cursor:'pointer',color:'var(--text2)'}} onClick={()=>navigate(`/admin/day?date=${prevDay}`)}/>
          <div style={{flex:1,textAlign:'center'}}>
            <div style={{fontSize:'15px',fontWeight:'700'}}>{format(dateObj,'EEE d MMM yyyy',{locale:fr})}</div>
            <div style={{fontSize:'10px',color:'var(--text3)',display:'flex',alignItems:'center',justifyContent:'center',gap:'3px'}}>
              <span className="live-dot" style={{width:'5px',height:'5px'}}/>
              MàJ {format(now,'HH:mm:ss')}
            </div>
          </div>
          <i className="ti ti-chevron-right" style={{fontSize:'18px',cursor:'pointer',color:'var(--text2)'}} onClick={()=>navigate(`/admin/day?date=${nextDay}`)}/>
        </div>
        <button style={{background:'none',border:'none',cursor:'pointer',color:'var(--text2)',fontSize:'20px'}} onClick={()=>{load();showToast('Actualisé ✅')}}><i className="ti ti-refresh"/></button>
        <button className="btn btn-sm btn-p" onClick={()=>openShiftModal(null)}><i className="ti ti-plus"/>Shift</button>
      </div>

      {/* Note */}
      {note && (
        <div style={{padding:'8px 14px',background:note.color==='red'?'var(--red-bg)':'var(--blue-bg)',borderBottom:'1px solid var(--border)',display:'flex',gap:'8px',alignItems:'center'}}>
          <i className={`ti ${note.color==='red'?'ti-alert-circle':'ti-info-circle'}`} style={{color:note.color==='red'?'var(--red)':'var(--blue)'}}/>
          <span style={{fontSize:'13px',fontWeight:'600',color:note.color==='red'?'var(--red)':'var(--blue)'}}>{note.content}</span>
        </div>
      )}

      {/* Stats */}
      <div style={{padding:'8px 14px',background:'var(--surface)',borderBottom:'1px solid var(--border)',display:'flex',gap:'8px',alignItems:'center'}}>
        <span className="badge bg">{shifts.length} shift{shifts.length!==1?'s':''}</span>
        <span className="badge bb">{logs.filter(l=>l.punched_in&&!l.punched_out).length} pointé{logs.filter(l=>l.punched_in&&!l.punched_out).length!==1?'s':''}</span>
        {!loaded && <span style={{fontSize:'12px',color:'var(--text3)'}}>Chargement…</span>}
        {loaded && shifts.length===0 && <span style={{fontSize:'12px',color:'var(--text3)'}}>Aucun shift · <button style={{background:'none',border:'none',color:'var(--accent)',cursor:'pointer',fontSize:'12px',fontWeight:'700'}} onClick={()=>openShiftModal(null)}>Ajouter →</button></span>}
      </div>

      {/* ══ TIMELINE ══ */}
      <div style={{flex:1,overflowY:'auto',paddingBottom:'80px'}}>
        <div style={{display:'flex',position:'relative',height:`${totalPx}px`}}>

          {/* Heures */}
          <div style={{width:'44px',flexShrink:0,background:'var(--surface)',borderRight:'1px solid var(--border)'}}>
            {HOURS.map(h=>(
              <div key={h} style={{height:`${HOUR_PX}px`,display:'flex',alignItems:'flex-start',justifyContent:'flex-end',paddingRight:'5px',paddingTop:'3px'}}>
                <span style={{fontSize:'10px',fontWeight:'600',color:isToday_&&h===now.getHours()?'var(--red)':'var(--text3)'}}>
                  {String(h).padStart(2,'0')}h
                </span>
              </div>
            ))}
          </div>

          {/* Zone blocs */}
          <div style={{flex:1,position:'relative',background:'var(--bg)'}}>

            {/* Grille */}
            {HOURS.map(h=>(
              <div key={h} style={{position:'absolute',top:`${(h-HOUR_START)*HOUR_PX}px`,left:0,right:0,
                borderTop:`1px solid ${h%2===0?'rgba(0,0,0,.08)':'rgba(0,0,0,.03)'}`,pointerEvents:'none'}}/>
            ))}
            {HOURS.map(h=>(
              <div key={h+'h'} style={{position:'absolute',top:`${(h-HOUR_START)*HOUR_PX+HOUR_PX/2}px`,left:0,right:0,
                borderTop:'1px dashed rgba(0,0,0,.03)',pointerEvents:'none'}}/>
            ))}

            {/* Ligne NOW */}
            {isToday_ && nowMin >= HOUR_START*60 && nowMin <= HOUR_END*60 && (
              <div style={{position:'absolute',top:`${minToY(nowMin)}px`,left:0,right:0,zIndex:10,pointerEvents:'none',display:'flex',alignItems:'center'}}>
                <div style={{width:'9px',height:'9px',borderRadius:'50%',background:'var(--red)',marginLeft:'-4px',flexShrink:0}}/>
                <div style={{flex:1,height:'2px',background:'var(--red)',opacity:.7}}/>
                <span style={{fontSize:'10px',fontWeight:'700',color:'var(--red)',padding:'0 4px',background:'var(--bg)'}}>
                  {format(now,'HH:mm')}
                </span>
              </div>
            )}

            {/* ── BLOCS SHIFTS ── */}
            {(() => {
              const cols = buildCols()
              const total = Math.max(1, cols.length)
              return cols.map((col, ci) =>
                col.map(s => {
                  const emp     = emps.find(e=>e.id===s.user_id)
                  const color   = pColorMap[s.poste] || emp?.color_fg || '#185FA5'
                  const startMin = timeToMin(s.start_time)
                  const durMin   = Math.max(30, shiftDurMin(s))
                  const top      = minToY(Math.max(startMin, HOUR_START*60))
                  const height   = Math.max(minToY(Math.min(startMin+durMin, HOUR_END*60)) - top, 32)
                  const pct      = progressPct(s)
                  const status   = logStatus(s.user_id)
                  const ini      = mkIni(emp?.full_name||s.profiles?.full_name||'')
                  const left     = `calc(${(ci/total)*100}% + 4px)`
                  const width    = `calc(${(1/total)*100}% - 8px)`

                  return (
                    <div key={s.id}
                      onClick={()=>openShiftModal(emp)}
                      style={{
                        position:'absolute', top:`${top}px`, left, width, height:`${height}px`,
                        borderRadius:'10px', overflow:'hidden', cursor:'pointer', zIndex:3,
                        background:`${color}18`, border:`2px solid ${color}`,
                        boxShadow:`0 2px 8px ${color}25`,
                      }}>
                      {/* Barre progression */}
                      {pct > 0 && (
                        <div style={{position:'absolute',top:0,left:0,width:'4px',height:`${pct}%`,background:color,borderRadius:'10px 0 0 10px',transition:'height 2s ease'}}/>
                      )}
                      {/* Contenu */}
                      <div style={{padding:'5px 6px 5px 10px',height:'100%',display:'flex',flexDirection:'column',gap:'2px',position:'relative',zIndex:2}}>
                        {/* Avatar + nom */}
                        <div style={{display:'flex',alignItems:'center',gap:'5px'}}>
                          <div style={{width:'22px',height:'22px',borderRadius:'5px',background:color,color:'#fff',fontSize:'8px',fontWeight:'800',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,letterSpacing:'.5px'}}>
                            {ini}
                          </div>
                          {height >= 38 && (
                            <span style={{fontSize:'11px',fontWeight:'800',color,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                              {emp?.full_name?.split(' ')[0]||'—'}
                            </span>
                          )}
                          <button style={{background:'none',border:'none',cursor:'pointer',color,fontSize:'11px',opacity:.5,padding:0,flexShrink:0,marginLeft:'auto'}}
                            onClick={e=>{e.stopPropagation();removeShift(s.id)}}>
                            <i className="ti ti-x"/>
                          </button>
                        </div>
                        {height >= 54 && <div style={{fontSize:'10px',fontWeight:'600',color,opacity:.85}}>{s.poste}</div>}
                        {height >= 70 && (
                          <div style={{fontSize:'10px',color,opacity:.7}}>
                            {s.start_time?.slice(0,5)} → {s.end_time?.slice(0,5)||'?'}
                          </div>
                        )}
                        {status && height >= 86 && (
                          <div style={{marginTop:'auto',fontSize:'9px',fontWeight:'700',color:status.color,background:`${status.color}20`,borderRadius:'5px',padding:'1px 5px',display:'inline-block',alignSelf:'flex-start'}}>
                            {status.label}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )
            })()}

            {/* ── TÂCHES ── */}
            {tasks.map(task => {
              const tMin = timeToMin(task.task_time)
              const tY   = minToY(tMin)
              const emp  = emps.find(e=>e.id===task.user_id)
              const tBg  = TASK_COLORS.find(c=>c.value===task.color)?.bg || '#E6F1FB'
              const ini  = mkIni(emp?.full_name||'')
              return (
                <div key={task.id} style={{position:'absolute',top:`${tY-12}px`,right:'6px',zIndex:8,maxWidth:'170px'}}
                  onClick={()=>openTaskModal(task.user_id, task)}>
                  <div style={{background:tBg,border:`1.5px solid ${task.color}`,borderRadius:'8px',padding:'4px 8px',cursor:'pointer',boxShadow:`0 2px 6px ${task.color}20`,display:'flex',alignItems:'center',gap:'5px'}}>
                    <div style={{width:'6px',height:'6px',borderRadius:'50%',background:task.color,flexShrink:0}}/>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:'9px',fontWeight:'700',color:task.color}}>{task.task_time?.slice(0,5)} · {ini}</div>
                      <div style={{fontSize:'10px',fontWeight:'700',color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{task.title}</div>
                    </div>
                    <i className="ti ti-x" style={{fontSize:'10px',color:task.color,flexShrink:0}} onClick={e=>{e.stopPropagation();removeTask(task.id)}}/>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Non planifiés */}
        {loaded && employees.filter(e=>!shifts.find(s=>s.user_id===e.id)).length > 0 && (
          <div style={{padding:'10px 14px',borderTop:'1px solid var(--border)',background:'var(--surface)'}}>
            <div style={{fontSize:'11px',fontWeight:'700',color:'var(--text2)',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'.05em'}}>Non planifiés ce jour</div>
            <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
              {employees.filter(e=>!shifts.find(s=>s.user_id===e.id)).map(e=>{
                const ini = mkIni(e.full_name)
                return (
                  <div key={e.id} onClick={()=>openShiftModal(e)}
                    style={{display:'flex',alignItems:'center',gap:'6px',background:'var(--bg)',border:'1.5px dashed var(--border)',borderRadius:'20px',padding:'5px 12px',cursor:'pointer'}}>
                    <div style={{width:'20px',height:'20px',borderRadius:'5px',background:e.color_bg||'#E6F1FB',color:e.color_fg||'#185FA5',fontSize:'8px',fontWeight:'800',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      {ini}
                    </div>
                    <span style={{fontSize:'12px',fontWeight:'600',color:'var(--text2)'}}>{e.full_name.split(' ')[0]}</span>
                    <i className="ti ti-plus" style={{fontSize:'12px',color:'var(--accent)'}}/>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Bouton + Tâche */}
        <div style={{padding:'10px 14px',borderTop:'1px solid var(--border)',background:'var(--surface)',display:'flex',justifyContent:'center'}}>
          <button className="btn btn-s btn-sm" onClick={()=>openTaskModal(employees[0]?.id||'')}>
            <i className="ti ti-flag"/>Ajouter une tâche
          </button>
        </div>
      </div>

      {/* ══ MODAL SHIFT ══ */}
      {shiftModal && (
        <div className="modal-bg" onClick={()=>setShiftModal(null)}>
          <div className="ms" onClick={e=>e.stopPropagation()}>
            <div className="mh"/>
            <div style={{fontSize:'18px',fontWeight:'800',marginBottom:'4px'}}>
              {shifts.find(s=>s.user_id===shiftForm.userId)?'Modifier':'Ajouter'} un shift
            </div>
            <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'16px'}}>{format(dateObj,'EEEE d MMMM',{locale:fr})}</div>
            <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
              <div className="iw"><div className="il">Employé</div>
                <select className="if" value={shiftForm.userId} onChange={e=>setShiftForm(f=>({...f,userId:e.target.value,poste:emps.find(em=>em.id===e.target.value)?.poste||postes[0]?.name||''}))} style={{cursor:'pointer'}}>
                  {employees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}
                  {employees.length===0 && <option>Aucun employé — ajoutez-en dans Équipe</option>}
                </select>
              </div>
              <div className="iw"><div className="il">Poste</div>
                <select className="if" value={shiftForm.poste} onChange={e=>setShiftForm(f=>({...f,poste:e.target.value}))} style={{cursor:'pointer'}}>
                  {postes.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
                  {postes.length===0 && <option>— Créez des postes dans Équipe</option>}
                </select>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                <div className="iw"><div className="il">Début</div>
                  <input className="if" type="time" value={shiftForm.startTime} onChange={e=>setShiftForm(f=>({...f,startTime:e.target.value}))} style={{fontSize:'18px',fontWeight:'700',textAlign:'center'}}/>
                </div>
                <div className="iw">
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <div className="il">Fin</div>
                    <label style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'11px',color:'var(--text2)',cursor:'pointer'}}>
                      <input type="checkbox" checked={shiftForm.hasEndTime} onChange={e=>setShiftForm(f=>({...f,hasEndTime:e.target.checked}))}/>Fixée
                    </label>
                  </div>
                  <input className="if" type="time" value={shiftForm.endTime} onChange={e=>setShiftForm(f=>({...f,endTime:e.target.value}))}
                    disabled={!shiftForm.hasEndTime} style={{fontSize:'18px',fontWeight:'700',textAlign:'center',opacity:shiftForm.hasEndTime?1:.4}}/>
                </div>
              </div>
              {shiftForm.hasEndTime && shiftForm.startTime && shiftForm.endTime && (() => {
                const dur = timeToMin(shiftForm.endTime) - timeToMin(shiftForm.startTime)
                if (dur<=0) return null
                return (
                  <div style={{background:'var(--green-bg)',borderRadius:'var(--rs)',padding:'10px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:'13px',color:'#0A5E45',fontWeight:'600'}}>Durée</span>
                    <span style={{fontSize:'18px',fontWeight:'800',color:'var(--green)'}}>{durToH(dur)}</span>
                  </div>
                )
              })()}
            </div>
            <button className="btn btn-p" style={{marginTop:'16px'}} onClick={saveShift}><i className="ti ti-check"/>Enregistrer</button>
            {shifts.find(s=>s.user_id===shiftForm.userId) && (
              <button className="btn btn-s" style={{marginTop:'8px',color:'var(--red)'}}
                onClick={()=>{removeShift(shifts.find(s=>s.user_id===shiftForm.userId).id);setShiftModal(null)}}>
                <i className="ti ti-trash"/>Supprimer
              </button>
            )}
            <button className="btn btn-s" style={{marginTop:'8px'}} onClick={()=>setShiftModal(null)}>Annuler</button>
          </div>
        </div>
      )}

      {/* ══ MODAL TÂCHE ══ */}
      {taskModal && (
        <div className="modal-bg" onClick={()=>setTaskModal(null)}>
          <div className="ms" onClick={e=>e.stopPropagation()}>
            <div className="mh"/>
            <div style={{fontSize:'18px',fontWeight:'800',marginBottom:'4px'}}>
              {taskModal.task ? 'Modifier' : 'Ajouter'} une tâche
            </div>
            <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'16px'}}>{format(dateObj,'EEEE d MMMM',{locale:fr})}</div>
            <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
              <div className="iw"><div className="il">Employé</div>
                <select className="if" value={taskForm.userId} onChange={e=>setTaskForm(f=>({...f,userId:e.target.value}))} style={{cursor:'pointer'}}>
                  {employees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
              <div className="iw"><div className="il">Heure</div>
                <input className="if" type="time" value={taskForm.time} onChange={e=>setTaskForm(f=>({...f,time:e.target.value}))} style={{fontSize:'20px',fontWeight:'700',textAlign:'center'}}/>
              </div>
              <div className="iw"><div className="il">Titre</div>
                <input className="if" value={taskForm.title} onChange={e=>setTaskForm(f=>({...f,title:e.target.value}))} placeholder="Ex: Réception livraison…"/>
              </div>
              <div className="iw"><div className="il">Détails (optionnel)</div>
                <textarea className="if" rows="2" value={taskForm.description} onChange={e=>setTaskForm(f=>({...f,description:e.target.value}))} placeholder="Instructions…"/>
              </div>
              <div className="iw"><div className="il">Couleur</div>
                <div style={{display:'flex',gap:'10px',marginTop:'4px'}}>
                  {TASK_COLORS.map(c=>(
                    <div key={c.value} onClick={()=>setTaskForm(f=>({...f,color:c.value}))}
                      style={{width:'32px',height:'32px',borderRadius:'50%',background:c.value,cursor:'pointer',
                        border:`3px solid ${taskForm.color===c.value?'white':'transparent'}`,
                        boxShadow:taskForm.color===c.value?`0 0 0 2px ${c.value}`:'none'}}/>
                  ))}
                </div>
              </div>
            </div>
            <button className="btn btn-p" style={{marginTop:'16px'}} onClick={saveTask}><i className="ti ti-check"/>Enregistrer</button>
            {taskModal.task && (
              <button className="btn btn-s" style={{marginTop:'8px',color:'var(--red)'}} onClick={()=>{removeTask(taskModal.task.id);setTaskModal(null)}}>
                <i className="ti ti-trash"/>Supprimer
              </button>
            )}
            <button className="btn btn-s" style={{marginTop:'8px'}} onClick={()=>setTaskModal(null)}>Annuler</button>
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
