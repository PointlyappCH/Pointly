import { useState, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { format, parseISO, isToday, addDays, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'

const HOUR_START = 6
const HOUR_END   = 23
const HOURS      = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_,i) => HOUR_START + i)
const HOUR_PX    = 64

const TASK_COLORS = [
  { label:'Bleu',   value:'#185FA5', bg:'#E6F1FB' },
  { label:'Vert',   value:'#0A5E45', bg:'#E1F5EE' },
  { label:'Orange', value:'#854F0B', bg:'#FAEEDA' },
  { label:'Rouge',  value:'#8B1F1F', bg:'#FCEBEB' },
  { label:'Violet', value:'#534AB7', bg:'#EEEDFE' },
]

export default function DayView() {
  const { profile, company } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const dateParam = searchParams.get('date') || format(new Date(), 'yyyy-MM-dd')

  const [shifts,  setShifts]  = useState([])
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [logs,    setLogs]    = useState([])
  const [emps,    setEmps]    = useState([])
  const [postes,  setPostes]  = useState([])
  const [tasks,   setTasks]   = useState([])
  const [note,    setNote]    = useState(null)
  const [now,     setNow]     = useState(new Date())

  const [shiftModal, setShiftModal] = useState(null)
  const [taskModal,  setTaskModal]  = useState(null) // { userId, task? }
  const [toast,      setToast]      = useState('')

  const [shiftForm, setShiftForm] = useState({
    userId:'', poste:'', startTime:'08:00', endTime:'17:00', hasEndTime:true
  })
  const [taskForm, setTaskForm] = useState({
    time:'09:00', title:'', description:'', color:'#185FA5'
  })

  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''),2800) }
  function mkIni(n=''){ const p=n.trim().split(' '); return((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase() }
  function timeToH(t){ if(!t)return null; const[h,m]=t.split(':'); return parseInt(h)+parseInt(m)/60 }
  function hToY(h){ return (h - HOUR_START) * HOUR_PX }
  function fmtDur(h){ const ih=Math.floor(h); const im=Math.round((h%1)*60); return `${ih}h${String(im).padStart(2,'0')}` }
  const totalH = HOUR_END - HOUR_START + 1

  async function load() {
    if (!company) return
    const [{ data:s },{ data:l },{ data:e },{ data:p },{ data:n },{ data:t }] = await Promise.all([
      supabase.from('shifts').select('*, profiles(full_name,color_bg,color_fg)')
        .eq('company_id', company.id).eq('shift_date', dateParam),
      supabase.from('time_logs').select('*')
        .eq('company_id', company.id).eq('log_date', dateParam),
      supabase.from('profiles').select('*').eq('company_id', company.id).order('full_name'),
      supabase.from('postes').select('*').eq('company_id', company.id).order('name'),
      supabase.from('day_notes').select('*').eq('company_id', company.id).eq('note_date', dateParam).maybeSingle(),
      supabase.from('shift_tasks').select('*')
        .eq('company_id', company.id).eq('task_date', dateParam).order('task_time'),
    ])
    setShifts(s||[]); setLogs(l||[]); setEmps(e||[]); setPostes(p||[])
    setNote(n); setTasks(t||[])
    const employees = e?.filter(em=>em.role==='employee')||[]
    if (employees.length && !shiftForm.userId)
      setShiftForm(f=>({...f, userId:employees[0].id, poste:employees[0].poste||p?.[0]?.name||''}))
  }

  // Recharge uniquement les logs (pointages) — rapide
  async function reloadLogs() {
    if (!company) return
    const { data:l } = await supabase.from('time_logs').select('*')
      .eq('company_id', company.id).eq('log_date', dateParam)
    setLogs(l||[])
    setLastUpdate(new Date())
  }

  useEffect(() => {
    load()
    // Timer rapide pour la ligne "maintenant" et les barres de progression
    const clockIv = setInterval(() => setNow(new Date()), 5000)
    // Rechargement des pointages toutes les 20 secondes (fallback si realtime ne marche pas)
    const reloadIv = setInterval(() => reloadLogs(), 20000)
    // Realtime Supabase
    const ch = supabase.channel('dayview-'+dateParam+'-'+Date.now())
      .on('postgres_changes',{event:'*',schema:'public',table:'time_logs',filter:`company_id=eq.${company?.id}`},() => {
        console.log('Realtime: time_logs change')
        reloadLogs()
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'shifts',filter:`company_id=eq.${company?.id}`},load)
      .on('postgres_changes',{event:'*',schema:'public',table:'shift_tasks',filter:`company_id=eq.${company?.id}`},load)
      .subscribe((status) => {
        console.log('Realtime status:', status)
      })
    return () => {
      clearInterval(clockIv)
      clearInterval(reloadIv)
      supabase.removeChannel(ch)
    }
  }, [company?.id, dateParam])

  // ── SHIFT CRUD ──
  async function saveShift() {
    if (!shiftForm.userId || !shiftForm.poste) return
    const existing = shifts.find(s=>s.user_id===shiftForm.userId)
    const payload  = {
      company_id: company.id, user_id: shiftForm.userId,
      shift_date: dateParam, poste: shiftForm.poste,
      start_time: shiftForm.startTime,
      end_time:   shiftForm.hasEndTime ? shiftForm.endTime : null,
      created_by: profile.id,
    }
    if (existing) await supabase.from('shifts').update(payload).eq('id', existing.id)
    else          await supabase.from('shifts').insert(payload)
    load(); setShiftModal(null); showToast('Shift enregistré ✅')
  }

  async function removeShift(id) {
    await supabase.from('shifts').delete().eq('id', id)
    load(); showToast('Shift supprimé')
  }

  function openShiftModal(emp) {
    const existing = emp ? shifts.find(s=>s.user_id===emp.id) : null
    const employees = emps.filter(e=>e.role==='employee')
    setShiftForm({
      userId:      emp?.id || employees[0]?.id || '',
      poste:       existing?.poste || emp?.poste || postes[0]?.name || '',
      startTime:   existing?.start_time?.slice(0,5) || '08:00',
      endTime:     existing?.end_time?.slice(0,5)   || '17:00',
      hasEndTime:  existing ? !!existing.end_time : true,
    })
    setShiftModal({ emp })
  }

  // ── TASK CRUD ──
  async function saveTask() {
    if (!taskForm.title.trim() || !taskModal) return
    const payload = {
      company_id:  company.id,
      user_id:     taskModal.userId,
      task_date:   dateParam,
      task_time:   taskForm.time,
      title:       taskForm.title.trim(),
      description: taskForm.description.trim()||null,
      color:       taskForm.color,
      created_by:  profile.id,
    }
    if (taskModal.task?.id) {
      await supabase.from('shift_tasks').update(payload).eq('id', taskModal.task.id)
    } else {
      await supabase.from('shift_tasks').insert(payload)
    }
    load(); setTaskModal(null); showToast('Tâche enregistrée ✅')
  }

  async function removeTask(id) {
    await supabase.from('shift_tasks').delete().eq('id', id)
    load(); showToast('Tâche supprimée')
  }

  function openTaskModal(userId, task=null) {
    setTaskForm({
      time:        task?.task_time?.slice(0,5) || '10:00',
      title:       task?.title || '',
      description: task?.description || '',
      color:       task?.color || '#185FA5',
    })
    setTaskModal({ userId, task })
  }

  // ── HELPERS ──
  function shiftDur(s) {
    const startH = timeToH(s.start_time?.slice(0,5)) || HOUR_START
    if (s.end_time) return timeToH(s.end_time.slice(0,5)) - startH
    const log = logs.find(l=>l.user_id===s.user_id)
    if (log?.punched_out) {
      const d=new Date(log.punched_out); return d.getHours()+d.getMinutes()/60 - startH
    }
    if (log?.punched_in) {
      const nowH = now.getHours()+now.getMinutes()/60; return nowH - startH
    }
    return 2
  }

  function logStatus(userId) {
    const log = logs.find(l=>l.user_id===userId)
    if (!log?.punched_in) return null
    if (log.error_24h)                    return { color:'var(--red)',    label:'Erreur 24h' }
    if (log.punched_out)                  return { color:'var(--green)',  label:'Terminé' }
    if (log.pause_start&&!log.pause_end)  return { color:'var(--orange)', label:'En pause' }
    return { color:'var(--green)', label:'En cours' }
  }

  function progressPct(s) {
    const log = logs.find(l=>l.user_id===s.user_id)
    if (!log?.punched_in) return 0
    const startH = timeToH(s.start_time?.slice(0,5)) || HOUR_START
    const dur    = Math.max(0.5, shiftDur(s))
    const punchH = new Date(log.punched_in).getHours()+new Date(log.punched_in).getMinutes()/60
    const endH   = log.punched_out
      ? new Date(log.punched_out).getHours()+new Date(log.punched_out).getMinutes()/60
      : Math.min(now.getHours()+now.getMinutes()/60, startH+dur)
    const worked = Math.max(0, endH - Math.max(punchH, startH))
    return Math.min(100, (worked/dur)*100)
  }

  const PCOLORS = ['#185FA5','#0A5E45','#7A4500','#534AB7','#8B1F1F','#854F0B','#1D9E75']
  const pColorMap = {}
  postes.forEach((p,i) => { pColorMap[p.name] = PCOLORS[i % PCOLORS.length] })

  const isCurrentDay = isToday(parseISO(dateParam))
  const nowH = now.getHours()+now.getMinutes()/60
  const employees = emps.filter(e=>e.role==='employee')
  const dateObj   = parseISO(dateParam)

  // Nav jour précédent / suivant
  const prevDay = format(subDays(dateObj,1),'yyyy-MM-dd')
  const nextDay = format(addDays(dateObj,1),'yyyy-MM-dd')

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/admin/planning" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <div style={{display:'flex',alignItems:'center',gap:'8px',flex:1}}>
          <i className="ti ti-chevron-left" style={{fontSize:'18px',cursor:'pointer',color:'var(--text2)'}} onClick={()=>navigate(`/admin/day?date=${prevDay}`)}/>
          <div style={{flex:1,textAlign:'center'}}>
            <div style={{fontSize:'15px',fontWeight:'700'}}>{format(dateObj,'EEE d MMM',{locale:fr})}</div>
            <div style={{fontSize:'10px',color:'var(--text3)'}}>
              <span className="live-dot" style={{display:'inline-block',width:'5px',height:'5px',marginRight:'3px'}}/>
              MàJ {format(lastUpdate,'HH:mm:ss')}
            </div>
          </div>
          <i className="ti ti-chevron-right" style={{fontSize:'18px',cursor:'pointer',color:'var(--text2)'}} onClick={()=>navigate(`/admin/day?date=${nextDay}`)}/>
        </div>
        <button style={{background:'none',border:'none',cursor:'pointer',color:'var(--text2)',fontSize:'20px',padding:'4px'}} onClick={()=>{load();showToast('Actualisé ✅')}} title="Actualiser">
          <i className="ti ti-refresh"/>
        </button>
        <button className="btn btn-sm btn-p" onClick={()=>openShiftModal(null)}>
          <i className="ti ti-plus"/>Shift
        </button>
      </div>

      {/* Note du jour */}
      {note && (
        <div style={{padding:'8px 14px',background:note.color==='red'?'var(--red-bg)':'var(--blue-bg)',borderBottom:'1px solid var(--border)',display:'flex',gap:'8px',alignItems:'center',flexShrink:0}}>
          <i className={`ti ${note.color==='red'?'ti-alert-circle':'ti-info-circle'}`} style={{color:note.color==='red'?'var(--red)':'var(--blue)',flexShrink:0,fontSize:'16px'}}/>
          <span style={{fontSize:'13px',color:note.color==='red'?'var(--red)':'var(--blue)',fontWeight:'600'}}>{note.content}</span>
        </div>
      )}

      <div style={{flex:1,overflowY:'auto',paddingBottom:'80px'}}>

        {/* ══════ TIMELINE ══════ */}
        <div style={{display:'flex',minHeight:`${totalH*HOUR_PX}px`,position:'relative'}}>

          {/* Colonne heures */}
          <div style={{width:'46px',flexShrink:0,background:'var(--surface)',borderRight:'1px solid var(--border)',position:'sticky',left:0,zIndex:4}}>
            {HOURS.map(h=>(
              <div key={h} style={{height:`${HOUR_PX}px`,display:'flex',alignItems:'flex-start',justifyContent:'flex-end',paddingRight:'6px',paddingTop:'4px'}}>
                <span style={{fontSize:'10px',fontWeight:'600',color:h===Math.floor(nowH)&&isCurrentDay?'var(--red)':'var(--text3)',whiteSpace:'nowrap'}}>
                  {String(h).padStart(2,'0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Zone des employés */}
          <div style={{flex:1,position:'relative',background:'var(--bg)'}}>

            {/* Lignes horizontales */}
            {HOURS.map(h=>(
              <div key={h} style={{position:'absolute',top:`${(h-HOUR_START)*HOUR_PX}px`,left:0,right:0,
                borderTop:`1px solid ${h%2===0?'var(--border)':'rgba(0,0,0,.04)'}`,pointerEvents:'none',zIndex:0}}/>
            ))}
            {/* Demi-heures */}
            {HOURS.map(h=>(
              <div key={h+'h'} style={{position:'absolute',top:`${(h-HOUR_START)*HOUR_PX+HOUR_PX/2}px`,left:0,right:0,
                borderTop:'1px dashed rgba(0,0,0,.04)',pointerEvents:'none',zIndex:0}}/>
            ))}

            {/* Ligne NOW */}
            {isCurrentDay && nowH >= HOUR_START && nowH <= HOUR_END && (
              <div style={{position:'absolute',top:`${hToY(nowH)}px`,left:0,right:0,zIndex:5,pointerEvents:'none',display:'flex',alignItems:'center'}}>
                <div style={{width:'9px',height:'9px',borderRadius:'50%',background:'var(--red)',flexShrink:0,marginLeft:'-4px'}}/>
                <div style={{flex:1,height:'2px',background:'var(--red)',opacity:.7}}/>
                <span style={{fontSize:'10px',fontWeight:'700',color:'var(--red)',paddingRight:'6px',paddingLeft:'3px',background:'var(--bg)',whiteSpace:'nowrap'}}>
                  {format(now,'HH:mm')}
                </span>
              </div>
            )}

            {/* Message si aucun shift */}
            {shifts.length===0 && (
              <div style={{position:'absolute',top:'30%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center',zIndex:2}}>
                <i className="ti ti-calendar-off" style={{fontSize:'32px',color:'var(--text3)',display:'block',marginBottom:'8px'}}/>
                <div style={{fontSize:'13px',color:'var(--text3)'}}>Aucun shift planifié</div>
                <button className="btn btn-p btn-sm" style={{marginTop:'10px'}} onClick={()=>openShiftModal(null)}>
                  <i className="ti ti-plus"/>Ajouter
                </button>
              </div>
            )}

            {/* ── BLOCS SHIFTS style Google Agenda ── */}
            {(() => {
              // Distribuer les shifts en colonnes pour éviter chevauchements
              const cols = []
              const sortedShifts = [...shifts].sort((a,b) => {
                const aH = timeToH(a.start_time?.slice(0,5)) || 0
                const bH = timeToH(b.start_time?.slice(0,5)) || 0
                return aH - bH
              })
              sortedShifts.forEach(s => {
                const startH = timeToH(s.start_time?.slice(0,5)) || HOUR_START
                const dur    = Math.max(0.5, shiftDur(s))
                const endH   = startH + dur
                let placed   = false
                for (let c = 0; c < cols.length; c++) {
                  const last = cols[c][cols[c].length-1]
                  const lastEnd = (timeToH(last.start_time?.slice(0,5))||HOUR_START) + Math.max(0.5, shiftDur(last))
                  if (startH >= lastEnd - 0.1) { cols[c].push(s); placed=true; break }
                }
                if (!placed) cols.push([s])
              })

              const totalCols = Math.max(1, cols.length)

              return cols.map((col, ci) => col.map(s => {
                const emp    = emps.find(e=>e.id===s.user_id)
                const status = logStatus(s.user_id)
                const color  = pColorMap[s.poste] || emp?.color_fg || 'var(--accent)'
                const colorBg = emp?.color_bg || '#E6F1FB'
                const startH = timeToH(s.start_time?.slice(0,5)) || HOUR_START
                const dur    = Math.max(0.5, shiftDur(s))
                const endH   = startH + dur
                const top    = hToY(Math.max(startH, HOUR_START))
                const height = Math.max(hToY(Math.min(endH, HOUR_END+1)) - top, 28)
                const pct    = progressPct(s)

                // Initiales style JUF
                const ini = emp ? (() => {
                  const p = emp.full_name.trim().split(' ')
                  return ((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase()
                })() : '?'

                const left  = `${(ci / totalCols) * 100}%`
                const width = `calc(${100/totalCols}% - 6px)`

                return (
                  <div key={s.id}
                    onClick={()=>openShiftModal(emp)}
                    style={{
                      position:'absolute',
                      top:`${top}px`,
                      left,
                      width,
                      height:`${height}px`,
                      borderRadius:'10px',
                      overflow:'hidden',
                      cursor:'pointer',
                      zIndex:3,
                      background:`${color}15`,
                      border:`2px solid ${color}`,
                      boxShadow:`0 2px 8px ${color}30`,
                      transition:'box-shadow .15s, transform .15s',
                    }}
                    onMouseEnter={e=>e.currentTarget.style.transform='scale(1.01)'}
                    onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
                  >
                    {/* Barre de progression réelle (temps pointé) */}
                    {pct > 0 && (
                      <div style={{
                        position:'absolute',top:0,left:0,
                        width:'100%',height:`${pct}%`,
                        background:`${color}35`,
                        borderBottom:`2px solid ${color}`,
                        zIndex:1,transition:'height 1s ease'
                      }}/>
                    )}

                    {/* Contenu du bloc */}
                    <div style={{position:'relative',zIndex:2,padding:'6px 8px',height:'100%',display:'flex',flexDirection:'column',gap:'2px'}}>

                      {/* Ligne 1 : Avatar initiales + nom */}
                      <div style={{display:'flex',alignItems:'center',gap:'5px'}}>
                        <div style={{
                          width:'24px',height:'24px',borderRadius:'6px',
                          background:color,color:'#fff',
                          fontSize:'9px',fontWeight:'800',
                          display:'flex',alignItems:'center',justifyContent:'center',
                          flexShrink:0,letterSpacing:'0.5px'
                        }}>
                          {ini}
                        </div>
                        {height > 40 && (
                          <span style={{fontSize:'11px',fontWeight:'800',color:color,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>
                            {emp?.full_name?.split(' ')[0] || '—'}
                          </span>
                        )}
                        {/* Bouton supprimer */}
                        <button
                          style={{background:'none',border:'none',cursor:'pointer',color:color,fontSize:'12px',opacity:.6,padding:'0',flexShrink:0,marginLeft:'auto'}}
                          onClick={e=>{e.stopPropagation();removeShift(s.id)}}>
                          <i className="ti ti-x"/>
                        </button>
                      </div>

                      {/* Ligne 2 : Poste */}
                      {height > 56 && (
                        <div style={{fontSize:'10px',fontWeight:'600',color:color,opacity:.85}}>
                          {s.poste}
                        </div>
                      )}

                      {/* Ligne 3 : Horaires */}
                      {height > 72 && (
                        <div style={{fontSize:'10px',color:color,opacity:.7}}>
                          {s.start_time?.slice(0,5)} → {s.end_time?.slice(0,5)||'?'}
                        </div>
                      )}

                      {/* Badge statut en bas */}
                      {status && height > 88 && (
                        <div style={{
                          marginTop:'auto',
                          fontSize:'9px',fontWeight:'700',
                          color:status.color,
                          background:`${status.color}20`,
                          borderRadius:'6px',padding:'2px 5px',
                          display:'inline-block',alignSelf:'flex-start'
                        }}>
                          {status.label}
                        </div>
                      )}
                    </div>
                  </div>
                )
              }))
            })()}

            {/* ── TÂCHES (toutes les tâches du jour) ── */}
            {tasks.map(task => {
              const tH  = timeToH(task.task_time?.slice(0,5))
              if (!tH) return null
              const tY  = hToY(tH)
              const emp = emps.find(e=>e.id===task.user_id)
              const tBg = TASK_COLORS.find(c=>c.value===task.color)?.bg || '#E6F1FB'
              const ini = emp ? ((emp.full_name.trim().split(' ')[0]||'').substring(0,2)+(emp.full_name.trim().split(' ')[1]||'').substring(0,1)).toUpperCase() : '?'

              return (
                <div key={task.id}
                  style={{position:'absolute',top:`${tY - 14}px`,right:'6px',zIndex:7,maxWidth:'160px'}}
                  onClick={()=>openTaskModal(task.user_id, task)}>
                  <div style={{
                    background:tBg,border:`1.5px solid ${task.color}`,
                    borderRadius:'8px',padding:'4px 8px',cursor:'pointer',
                    boxShadow:`0 2px 8px ${task.color}25`,
                    display:'flex',alignItems:'center',gap:'5px'
                  }}>
                    <div style={{width:'6px',height:'6px',borderRadius:'50%',background:task.color,flexShrink:0}}/>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:'9px',fontWeight:'700',color:task.color,whiteSpace:'nowrap'}}>{task.task_time?.slice(0,5)} · {ini}</div>
                      <div style={{fontSize:'10px',fontWeight:'700',color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{task.title}</div>
                    </div>
                    <i className="ti ti-x" style={{fontSize:'10px',color:task.color,flexShrink:0,marginLeft:'2px'}} onClick={e=>{e.stopPropagation();removeTask(task.id)}}/>
                  </div>
                </div>
              )
            })}

            {/* Bouton + Tâche flottant */}
            <div style={{position:'sticky',bottom:'90px',right:'10px',float:'right',marginRight:'10px',zIndex:8}}>
              <button
                style={{background:'var(--accent)',border:'none',borderRadius:'20px',color:'#fff',fontSize:'12px',fontWeight:'700',padding:'8px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:'5px',boxShadow:'0 4px 16px rgba(26,26,46,.3)'}}
                onClick={()=>openTaskModal(employees[0]?.id||'')}>
                <i className="ti ti-flag" style={{fontSize:'14px'}}/>+ Tâche
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* ── LISTE EMPLOYÉS NON PLANIFIÉS ── */}
      {employees.filter(e=>!shifts.find(s=>s.user_id===e.id)).length > 0 && (
        <div style={{padding:'10px 14px',borderTop:'1px solid var(--border)',background:'var(--surface)'}}>
          <div style={{fontSize:'11px',fontWeight:'700',color:'var(--text2)',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'.05em'}}>Non planifiés</div>
          <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
            {employees.filter(e=>!shifts.find(s=>s.user_id===e.id)).map(e=>{
              const ini = ((e.full_name.trim().split(' ')[0]||'').substring(0,2)+(e.full_name.trim().split(' ')[1]||'').substring(0,1)).toUpperCase()
              return (
                <div key={e.id} onClick={()=>openShiftModal(e)}
                  style={{display:'flex',alignItems:'center',gap:'6px',background:'var(--bg)',border:'1.5px dashed var(--border)',borderRadius:'20px',padding:'5px 12px',cursor:'pointer',transition:'border-color .15s'}}
                  onMouseEnter={el=>el.currentTarget.style.borderColor='var(--accent)'}
                  onMouseLeave={el=>el.currentTarget.style.borderColor='var(--border)'}>
                  <div style={{width:'22px',height:'22px',borderRadius:'6px',background:e.color_bg||'#E6F1FB',color:e.color_fg||'#185FA5',fontSize:'9px',fontWeight:'800',display:'flex',alignItems:'center',justifyContent:'center'}}>
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

      {/* ══ MODAL SHIFT ══ */}
      {shiftModal && (
        <div className="modal-bg" onClick={()=>setShiftModal(null)}>
          <div className="ms" onClick={e=>e.stopPropagation()}>
            <div className="mh"/>
            <div style={{fontSize:'18px',fontWeight:'800',marginBottom:'4px'}}>
              {shifts.find(s=>s.user_id===shiftForm.userId)?'Modifier le shift':'Ajouter un shift'}
            </div>
            <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'16px'}}>{format(dateObj,'EEEE d MMMM',{locale:fr})}</div>
            <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
              <div className="iw"><div className="il">Employé</div>
                <select className="if" value={shiftForm.userId}
                  onChange={e=>setShiftForm(f=>({...f,userId:e.target.value,poste:emps.find(em=>em.id===e.target.value)?.poste||postes[0]?.name||''}))}
                  style={{cursor:'pointer'}}>
                  {employees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
              <div className="iw"><div className="il">Poste de travail</div>
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
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div className="il">Fin</div>
                    <label style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'11px',color:'var(--text2)',cursor:'pointer'}}>
                      <input type="checkbox" checked={shiftForm.hasEndTime} onChange={e=>setShiftForm(f=>({...f,hasEndTime:e.target.checked}))}/>
                      Fixée
                    </label>
                  </div>
                  <input className="if" type="time" value={shiftForm.endTime} onChange={e=>setShiftForm(f=>({...f,endTime:e.target.value}))}
                    disabled={!shiftForm.hasEndTime} style={{fontSize:'18px',fontWeight:'700',textAlign:'center',opacity:shiftForm.hasEndTime?1:.4}}/>
                </div>
              </div>
              {/* Aperçu durée */}
              {shiftForm.hasEndTime && (() => {
                const dur = timeToH(shiftForm.endTime) - timeToH(shiftForm.startTime)
                if (dur<=0) return null
                return (
                  <div style={{background:'var(--green-bg)',borderRadius:'var(--rs)',padding:'10px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:'13px',color:'#0A5E45',fontWeight:'600'}}>Durée du shift</span>
                    <span style={{fontSize:'18px',fontWeight:'800',color:'var(--green)'}}>{fmtDur(dur)}</span>
                  </div>
                )
              })()}
            </div>
            <button className="btn btn-p" style={{marginTop:'16px'}} onClick={saveShift}><i className="ti ti-check"/>Enregistrer</button>
            {shifts.find(s=>s.user_id===shiftForm.userId) && (
              <button className="btn btn-s" style={{marginTop:'8px',color:'var(--red)'}}
                onClick={()=>{removeShift(shifts.find(s=>s.user_id===shiftForm.userId).id);setShiftModal(null)}}>
                <i className="ti ti-trash"/>Supprimer ce shift
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
              {taskModal.task ? 'Modifier la tâche' : 'Ajouter une tâche'}
            </div>
            <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'16px'}}>
              {emps.find(e=>e.id===taskModal.userId)?.full_name} · {format(dateObj,'d MMMM',{locale:fr})}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
              <div className="iw"><div className="il">Heure</div>
                <input className="if" type="time" value={taskForm.time} onChange={e=>setTaskForm(f=>({...f,time:e.target.value}))} style={{fontSize:'20px',fontWeight:'700',textAlign:'center'}}/>
              </div>
              <div className="iw"><div className="il">Titre de la tâche</div>
                <input className="if" value={taskForm.title} onChange={e=>setTaskForm(f=>({...f,title:e.target.value}))} placeholder="Ex: Réception livraison, Réunion équipe…"/>
              </div>
              <div className="iw"><div className="il">Détails (optionnel)</div>
                <textarea className="if" rows="2" value={taskForm.description} onChange={e=>setTaskForm(f=>({...f,description:e.target.value}))} placeholder="Instructions spécifiques…"/>
              </div>
              <div className="iw">
                <div className="il">Couleur de la marque</div>
                <div style={{display:'flex',gap:'8px',marginTop:'4px'}}>
                  {TASK_COLORS.map(c=>(
                    <div key={c.value} onClick={()=>setTaskForm(f=>({...f,color:c.value}))}
                      style={{width:'32px',height:'32px',borderRadius:'50%',background:c.value,cursor:'pointer',
                        border:`3px solid ${taskForm.color===c.value?'white':'transparent'}`,
                        boxShadow:taskForm.color===c.value?`0 0 0 2px ${c.value}`:'none',transition:'all .15s'}}>
                    </div>
                  ))}
                </div>
              </div>
              {/* Aperçu */}
              <div style={{background:TASK_COLORS.find(c=>c.value===taskForm.color)?.bg||'#E6F1FB',border:`2px solid ${taskForm.color}`,borderRadius:'10px',padding:'10px 14px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                  <div style={{width:'8px',height:'8px',borderRadius:'50%',background:taskForm.color,flexShrink:0}}/>
                  <span style={{fontSize:'13px',fontWeight:'700',color:taskForm.color}}>{taskForm.time} — {taskForm.title||'Titre de la tâche'}</span>
                </div>
                {taskForm.description && <div style={{fontSize:'11px',color:taskForm.color,opacity:.8,marginTop:'4px'}}>{taskForm.description}</div>}
              </div>
            </div>
            <button className="btn btn-p" style={{marginTop:'16px'}} onClick={saveTask}><i className="ti ti-check"/>Enregistrer la tâche</button>
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
