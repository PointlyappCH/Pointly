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

export default function EmpDayView() {
  const { profile, company } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const dateParam = searchParams.get('date') || format(new Date(), 'yyyy-MM-dd')

  const [shift,   setShift]   = useState(null)
  const [log,     setLog]     = useState(null)
  const [tasks,   setTasks]   = useState([])
  const [teamShifts, setTeamShifts] = useState([])
  const [note,    setNote]    = useState(null)
  const [now,     setNow]     = useState(new Date())

  function mkIni(n=''){ const p=n.trim().split(' '); return((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase() }
  function timeToH(t){ if(!t)return null; const[h,m]=t.split(':'); return parseInt(h)+parseInt(m)/60 }
  function hToY(h){ return (h - HOUR_START) * HOUR_PX }
  function fmtDur(h){ const ih=Math.floor(h); const im=Math.round((h%1)*60); return `${ih}h${String(im).padStart(2,'0')}` }

  async function load() {
    if (!profile || !company) return
    const [{ data:s },{ data:l },{ data:t },{ data:n },{ data:ts }] = await Promise.all([
      supabase.from('shifts').select('*, profiles(full_name,color_bg,color_fg)')
        .eq('user_id', profile.id).eq('shift_date', dateParam).maybeSingle(),
      supabase.from('time_logs').select('*')
        .eq('user_id', profile.id).eq('log_date', dateParam).maybeSingle(),
      supabase.from('shift_tasks').select('*')
        .eq('user_id', profile.id).eq('task_date', dateParam).order('task_time'),
      supabase.from('day_notes').select('*')
        .eq('company_id', company.id).eq('note_date', dateParam).maybeSingle(),
      supabase.from('shifts').select('*, profiles(full_name,color_bg,color_fg)')
        .eq('company_id', company.id).eq('shift_date', dateParam)
        .neq('user_id', profile.id),
    ])
    setShift(s); setLog(l); setTasks(t||[]); setNote(n); setTeamShifts(ts||[])
  }

  useEffect(() => {
    load()
    const iv = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(iv)
  }, [profile, company, dateParam])

  const isCurrentDay = isToday(parseISO(dateParam))
  const nowH = now.getHours()+now.getMinutes()/60
  const dateObj = parseISO(dateParam)
  const prevDay = format(subDays(dateObj,1),'yyyy-MM-dd')
  const nextDay = format(addDays(dateObj,1),'yyyy-MM-dd')

  const startH = shift ? timeToH(shift.start_time?.slice(0,5)) : null
  const endH   = shift?.end_time ? timeToH(shift.end_time.slice(0,5)) : null
  const dur    = startH !== null && endH !== null ? endH - startH : null

  // Heures réelles pointées
  const realStart = log?.punched_in ? new Date(log.punched_in).getHours()+new Date(log.punched_in).getMinutes()/60 : null
  const realEnd   = log?.punched_out ? new Date(log.punched_out).getHours()+new Date(log.punched_out).getMinutes()/60 : (isCurrentDay && log?.punched_in ? nowH : null)

  const TASK_COLORS = ['#185FA5','#0A5E45','#7A4500','#534AB7','#8B1F1F','#854F0B','#1D9E75']
  const TASK_BGS   = ['#E6F1FB','#E1F5EE','#FAEEDA','#EEEDFE','#FCEBEB','#FFF0E6','#E1F5EE']

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/emp/planning" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <div style={{display:'flex',alignItems:'center',gap:'8px',flex:1}}>
          <i className="ti ti-chevron-left" style={{fontSize:'18px',cursor:'pointer',color:'var(--text2)'}} onClick={()=>navigate(`/emp/day?date=${prevDay}`)}/>
          <h1 style={{flex:1,textAlign:'center',fontSize:'15px'}}>{format(dateObj,'EEE d MMM',{locale:fr})}</h1>
          <i className="ti ti-chevron-right" style={{fontSize:'18px',cursor:'pointer',color:'var(--text2)'}} onClick={()=>navigate(`/emp/day?date=${nextDay}`)}/>
        </div>
      </div>

      {/* Note du jour */}
      {note && (
        <div style={{padding:'8px 14px',background:note.color==='red'?'var(--red-bg)':'var(--blue-bg)',borderBottom:'1px solid var(--border)',flexShrink:0}}>
          <div style={{fontSize:'13px',color:note.color==='red'?'var(--red)':'var(--blue)',fontWeight:'600',display:'flex',gap:'6px',alignItems:'center'}}>
            <i className={`ti ${note.color==='red'?'ti-alert-circle':'ti-info-circle'}`}/>
            {note.content}
          </div>
        </div>
      )}

      {/* Info shift */}
      {shift && (
        <div style={{padding:'10px 14px',background:'var(--surface)',borderBottom:'1px solid var(--border)',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <div style={{flex:1}}>
              <div style={{fontSize:'14px',fontWeight:'700'}}>Votre shift — {shift.poste}</div>
              <div style={{fontSize:'12px',color:'var(--text2)'}}>
                {shift.start_time?.slice(0,5)} → {shift.end_time?.slice(0,5)||'?'}
                {dur && ` · ${fmtDur(dur)}`}
              </div>
            </div>
            {log?.punched_in && !log?.punched_out && (
              <span className="badge bg" style={{animation:'pulse-green 2s infinite'}}>En cours</span>
            )}
            {log?.punched_out && <span className="badge bg">Terminé</span>}
            {!log?.punched_in && <span className="badge bk">Non pointé</span>}
          </div>
        </div>
      )}

      <div style={{flex:1,overflowY:'auto',paddingBottom:'80px'}}>

        {/* ══ TIMELINE ══ */}
        <div style={{display:'flex',minHeight:`${(HOUR_END-HOUR_START+1)*HOUR_PX}px`}}>

          {/* Heures */}
          <div style={{width:'46px',flexShrink:0,background:'var(--surface)',borderRight:'1px solid var(--border)'}}>
            {HOURS.map(h=>(
              <div key={h} style={{height:`${HOUR_PX}px`,display:'flex',alignItems:'flex-start',justifyContent:'flex-end',paddingRight:'6px',paddingTop:'4px'}}>
                <span style={{fontSize:'10px',fontWeight:'600',color:h===Math.floor(nowH)&&isCurrentDay?'var(--red)':'var(--text3)'}}>
                  {String(h).padStart(2,'0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Timeline principale */}
          <div style={{flex:1,position:'relative'}}>
            {/* Lignes */}
            {HOURS.map(h=>(
              <div key={h} style={{position:'absolute',top:`${(h-HOUR_START)*HOUR_PX}px`,left:0,right:0,borderTop:`1px solid ${h%2===0?'var(--border)':'rgba(0,0,0,.04)'}`,pointerEvents:'none'}}/>
            ))}
            {HOURS.map(h=>(
              <div key={h+'h'} style={{position:'absolute',top:`${(h-HOUR_START)*HOUR_PX+HOUR_PX/2}px`,left:0,right:0,borderTop:'1px dashed rgba(0,0,0,.04)',pointerEvents:'none'}}/>
            ))}

            {/* Ligne NOW */}
            {isCurrentDay && nowH>=HOUR_START && nowH<=HOUR_END && (
              <div style={{position:'absolute',top:`${hToY(nowH)}px`,left:0,right:0,zIndex:5,pointerEvents:'none',display:'flex',alignItems:'center'}}>
                <div style={{width:'9px',height:'9px',borderRadius:'50%',background:'var(--red)',flexShrink:0,marginLeft:'-4px'}}/>
                <div style={{flex:1,height:'2px',background:'var(--red)',opacity:.7}}/>
                <span style={{fontSize:'10px',fontWeight:'700',color:'var(--red)',paddingRight:'6px',paddingLeft:'3px',background:'var(--bg)'}}>{format(now,'HH:mm')}</span>
              </div>
            )}

            {/* Bloc shift planifié */}
            {shift && startH !== null && (
              <div style={{position:'absolute',
                top:`${hToY(Math.max(startH,HOUR_START))}px`,
                left:'8px',right:'8px',
                height:`${Math.max(hToY(endH||Math.min(nowH+1,HOUR_END))-hToY(Math.max(startH,HOUR_START)),32)}px`,
                background:'var(--blue-bg)',border:'2px solid var(--blue)',borderRadius:'12px',overflow:'hidden',zIndex:2}}>
                <div style={{padding:'8px 10px'}}>
                  <div style={{fontSize:'13px',fontWeight:'700',color:'var(--blue)'}}>{shift.poste}</div>
                  <div style={{fontSize:'11px',color:'var(--blue)',opacity:.8}}>
                    {shift.start_time?.slice(0,5)} → {shift.end_time?.slice(0,5)||'fin au dépointage'}
                  </div>
                </div>
                {/* Barre progression réelle */}
                {realStart !== null && realEnd !== null && (
                  <div style={{position:'absolute',top:0,left:0,
                    width:`${Math.min(100,((realEnd-Math.max(realStart,startH))/(endH||2))*100)}%`,
                    height:'4px',background:'var(--green)',borderRadius:'0 4px 0 0'}}/>
                )}
              </div>
            )}

            {/* Bloc heures réellement travaillées */}
            {realStart !== null && realEnd !== null && (
              <div style={{position:'absolute',
                top:`${hToY(Math.max(realStart,HOUR_START))}px`,
                left:'8px',right:'8px',
                height:`${Math.max(hToY(realEnd)-hToY(Math.max(realStart,HOUR_START)),4)}px`,
                background:'rgba(29,158,117,.12)',border:'2px solid var(--green)',borderRadius:'10px',zIndex:3,pointerEvents:'none'}}>
                {(realEnd-realStart)*HOUR_PX > 28 && (
                  <div style={{padding:'4px 8px',fontSize:'11px',fontWeight:'700',color:'var(--green)'}}>
                    {format(new Date(log.punched_in),'HH:mm')} → {log.punched_out?format(new Date(log.punched_out),'HH:mm'):'en cours'}
                  </div>
                )}
              </div>
            )}

            {/* ── TÂCHES ── */}
            {tasks.map((task, ti) => {
              const tH  = timeToH(task.task_time?.slice(0,5))
              const tY  = tH ? hToY(tH) : 0
              const idx = TASK_COLORS.indexOf(task.color)
              const bg  = idx>=0 ? TASK_BGS[idx] : '#E6F1FB'
              return (
                <div key={task.id} style={{position:'absolute',top:`${tY}px`,left:'8px',right:'8px',zIndex:6}}>
                  {/* Ligne pointillée */}
                  <div style={{position:'absolute',top:'50%',left:'-8px',width:'8px',height:'2px',background:task.color,opacity:.4}}/>
                  <div style={{background:bg,border:`2px solid ${task.color}`,borderRadius:'10px',padding:'8px 12px',boxShadow:'0 2px 12px rgba(0,0,0,.08)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                      <div style={{width:'8px',height:'8px',borderRadius:'50%',background:task.color,flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:'12px',fontWeight:'700',color:task.color}}>{task.task_time?.slice(0,5)}</div>
                        <div style={{fontSize:'13px',fontWeight:'800',color:'var(--text)',marginTop:'1px'}}>{task.title}</div>
                        {task.description && <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px',lineHeight:'1.4'}}>{task.description}</div>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Aucun shift */}
            {!shift && (
              <div style={{position:'absolute',top:'30%',left:'50%',transform:'translateX(-50%)',textAlign:'center'}}>
                <i className="ti ti-calendar-off" style={{fontSize:'28px',color:'var(--text3)',display:'block',marginBottom:'8px'}}/>
                <div style={{fontSize:'13px',color:'var(--text3)'}}>Pas de shift planifié ce jour</div>
              </div>
            )}
          </div>
        </div>

        {/* Collègues ce jour */}
        {teamShifts.length > 0 && (
          <div style={{padding:'12px 14px',borderTop:'1px solid var(--border)'}}>
            <div style={{fontSize:'11px',fontWeight:'700',color:'var(--text2)',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'.05em'}}>Équipe ce jour</div>
            <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
              {teamShifts.map(s=>(
                <div key={s.id} style={{display:'flex',alignItems:'center',gap:'6px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'20px',padding:'5px 12px'}}>
                  <div className="av" style={{width:'22px',height:'22px',fontSize:'8px',fontWeight:'700',background:s.profiles?.color_bg||'#E6F1FB',color:s.profiles?.color_fg||'#185FA5'}}>
                    {mkIni(s.profiles?.full_name||'')}
                  </div>
                  <div>
                    <div style={{fontSize:'11px',fontWeight:'700'}}>{s.profiles?.full_name?.split(' ')[0]}</div>
                    <div style={{fontSize:'10px',color:'var(--text2)'}}>{s.poste} · {s.start_time?.slice(0,5)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="nav">
        <Link to="/emp" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-layout-dashboard"/>Accueil</div></Link>
        <Link to="/emp/planning" style={{textDecoration:'none',flex:1}}><div className="nav-item active"><i className="ti ti-calendar"/>Planning</div></Link>
        <Link to="/emp/dispo" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-adjustments"/>Dispos</div></Link>
        <Link to="/emp/chat" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-message-2"/>Chat</div></Link>
        <Link to="/emp/profile" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-user-circle"/>Profil</div></Link>
      </div>
    </div>
  )
}
