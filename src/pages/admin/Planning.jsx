import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isToday, getDay, startOfWeek, endOfWeek,
  addMonths, subMonths, addWeeks, subWeeks
} from 'date-fns'
import { fr } from 'date-fns/locale'

export default function AdminPlanning() {
  const { profile, company } = useAuth()
  const [view, setView]       = useState('month')
  const [cursor, setCursor]   = useState(new Date())
  const [shifts, setShifts]   = useState([])
  const [emps, setEmps]       = useState([])
  const [postes, setPostes]   = useState([])
  const [dispos, setDispos]   = useState([])
  const [notes, setNotes]     = useState([])
  const [selectedDay, setSelectedDay] = useState(null)
  const [modalNote, setModalNote]     = useState(null)
  const [toast, setToast]     = useState('')
  const [shiftForm, setShiftForm] = useState({ userId:'', poste:'', startTime:'08:00' })
  const [noteForm, setNoteForm]   = useState({ content:'', color:'normal' })

  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''),2800) }
  function mkIni(n=''){ const p=n.trim().split(' '); return((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase() }

  async function loadData() {
    if (!company) return
    let start, end
    if (view==='month'){ start=startOfMonth(cursor); end=endOfMonth(cursor) }
    else { start=startOfWeek(cursor,{weekStartsOn:1}); end=endOfWeek(cursor,{weekStartsOn:1}) }
    const fmt = d => format(d,'yyyy-MM-dd')

    const [{ data:s },{ data:d },{ data:n },{ data:e },{ data:p }] = await Promise.all([
      supabase.from('shifts').select('*, profiles(full_name,color_bg,color_fg)')
        .eq('company_id',company.id).gte('shift_date',fmt(start)).lte('shift_date',fmt(end)),
      supabase.from('dispos').select('*, profiles(full_name)')
        .gte('dispo_date',fmt(start)).lte('dispo_date',fmt(end)),
      supabase.from('day_notes').select('*')
        .eq('company_id',company.id).gte('note_date',fmt(start)).lte('note_date',fmt(end)),
      supabase.from('profiles').select('*')
        .eq('company_id',company.id).eq('role','employee').order('full_name'),
      supabase.from('postes').select('*')
        .eq('company_id',company.id).order('name'),
    ])
    setShifts(s||[]); setDispos(d||[]); setNotes(n||[]); setEmps(e||[]); setPostes(p||[])
    if (e?.length && !shiftForm.userId) setShiftForm(f=>({...f, userId:e[0].id, poste:e[0].poste||p?.[0]?.name||''}))
  }

  useEffect(() => { loadData() }, [company, cursor, view])

  function shiftsForDay(date){ const key=format(date,'yyyy-MM-dd'); return shifts.filter(s=>s.shift_date===key) }
  function noteForDay(date){ const key=format(date,'yyyy-MM-dd'); return notes.find(n=>n.note_date===key) }
  function disposForDay(date){ const key=format(date,'yyyy-MM-dd'); return dispos.filter(d=>d.dispo_date===key) }

  async function addShift() {
    if (!shiftForm.userId || !selectedDay) return
    const { error } = await supabase.from('shifts').insert({
      company_id: company.id, user_id: shiftForm.userId,
      shift_date: format(selectedDay,'yyyy-MM-dd'),
      poste: shiftForm.poste, start_time: shiftForm.startTime,
      created_by: profile.id,
    })
    if (error){ showToast('Erreur : '+error.message); return }
    loadData(); showToast('Shift ajouté ✅')
  }

  async function removeShift(shiftId) {
    await supabase.from('shifts').delete().eq('id', shiftId)
    loadData(); showToast('Shift supprimé')
  }

  async function saveNote() {
    if (!selectedDay || !noteForm.content.trim()) return
    const key = format(selectedDay,'yyyy-MM-dd')
    await supabase.from('day_notes').upsert({
      company_id:company.id, note_date:key,
      content:noteForm.content, color:noteForm.color, created_by:profile.id,
    },{ onConflict:'company_id,note_date' })
    loadData(); setModalNote(null); showToast('Note enregistrée ✅')
  }

  function openDay(date) {
    setSelectedDay(date)
    const n = noteForDay(date)
    setNoteForm({ content:n?.content||'', color:n?.color||'normal' })
    const planned = shiftsForDay(date).map(s=>s.user_id)
    const firstAvail = emps.find(e=>!planned.includes(e.id))
    if (firstAvail) setShiftForm(f=>({...f, userId:firstAvail.id, poste:firstAvail.poste||postes[0]?.name||''}))
  }

  // ── CALENDRIER MOIS ──
  function renderMonth() {
    const days = eachDayOfInterval({ start:startOfMonth(cursor), end:endOfMonth(cursor) })
    const pad  = (getDay(days[0])+6)%7
    return (
      <div className="card" style={{padding:'12px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px'}}>
          <i className="ti ti-chevron-left" style={{fontSize:'20px',cursor:'pointer',color:'var(--text2)'}} onClick={()=>setCursor(subMonths(cursor,1))}/>
          <span style={{fontSize:'15px',fontWeight:'700'}}>{format(cursor,'MMMM yyyy',{locale:fr})}</span>
          <i className="ti ti-chevron-right" style={{fontSize:'20px',cursor:'pointer',color:'var(--text2)'}} onClick={()=>setCursor(addMonths(cursor,1))}/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'2px',marginBottom:'3px'}}>
          {['L','M','M','J','V','S','D'].map((d,i)=>(
            <div key={i} style={{textAlign:'center',fontSize:'11px',fontWeight:'600',color:'var(--text3)',padding:'3px 0'}}>{d}</div>
          ))}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'2px'}}>
          {Array(pad).fill(null).map((_,i)=><div key={'p'+i}/>)}
          {days.map(day=>{
            const dayShifts = shiftsForDay(day)
            const note = noteForDay(day)
            const today = isToday(day)
            const isSel = selectedDay && format(day,'yyyy-MM-dd')===format(selectedDay,'yyyy-MM-dd')
            return (
              <div key={day.toISOString()} onClick={()=>window.location.href='/admin/day?date='+format(day,'yyyy-MM-dd')}
                style={{minHeight:'48px',borderRadius:'8px',cursor:'pointer',padding:'3px',
                  background:isSel?'var(--blue-bg)':today?'rgba(24,95,165,.08)':note?.color==='red'?'var(--red-bg)':note?'var(--blue-bg)':'transparent',
                  border:`1.5px solid ${isSel?'var(--accent)':today?'var(--blue)':'var(--border)'}`,
                  transition:'all .1s'}}>
                <div style={{fontSize:'12px',fontWeight:today?'800':'600',width:'24px',height:'24px',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',background:today?'var(--accent)':undefined,color:today?'#fff':'var(--text)',margin:'0 auto'}}>
                  {format(day,'d')}
                </div>
                <div style={{display:'flex',gap:'1px',justifyContent:'center',flexWrap:'wrap',marginTop:'2px'}}>
                  {dayShifts.slice(0,4).map(s=>(
                    <span key={s.id} style={{width:'5px',height:'5px',borderRadius:'50%',background:s.profiles?.color_fg||'var(--accent)',display:'inline-block'}}/>
                  ))}
                  {dayShifts.length>4 && <span style={{fontSize:'8px',color:'var(--text3)'}}>+{dayShifts.length-4}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── SEMAINE ──
  function renderWeek() {
    const weekStart = startOfWeek(cursor,{weekStartsOn:1})
    const days = eachDayOfInterval({ start:weekStart, end:endOfWeek(cursor,{weekStartsOn:1}) })
    return (
      <div className="card" style={{padding:'0',overflow:'hidden'}}>
        <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <i className="ti ti-chevron-left" style={{fontSize:'20px',cursor:'pointer',color:'var(--text2)'}} onClick={()=>setCursor(subWeeks(cursor,1))}/>
          <span style={{fontSize:'15px',fontWeight:'700'}}>{format(weekStart,'d MMM',{locale:fr})} – {format(days[6],'d MMM yyyy',{locale:fr})}</span>
          <i className="ti ti-chevron-right" style={{fontSize:'20px',cursor:'pointer',color:'var(--text2)'}} onClick={()=>setCursor(addWeeks(cursor,1))}/>
        </div>
        {days.map(day=>{
          const dayShifts = shiftsForDay(day)
          const note = noteForDay(day)
          const today = isToday(day)
          return (
            <div key={day.toISOString()} style={{display:'flex',borderBottom:'1px solid var(--border)',background:today?'var(--blue-bg)':undefined}}>
              <div style={{width:'48px',flexShrink:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'8px 4px',borderRight:'1px solid var(--border)'}}>
                <div style={{fontSize:'11px',color:'var(--text3)',fontWeight:'600'}}>{format(day,'EEE',{locale:fr}).toUpperCase()}</div>
                <div style={{width:'28px',height:'28px',borderRadius:'50%',background:today?'var(--accent)':undefined,color:today?'#fff':'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',fontWeight:'800',marginTop:'2px'}}>
                  {format(day,'d')}
                </div>
              </div>
              <div style={{flex:1,padding:'8px 10px',display:'flex',flexDirection:'column',gap:'4px'}}>
                {note && <div style={{fontSize:'11px',padding:'2px 8px',borderRadius:'10px',display:'inline-block',background:note.color==='red'?'var(--red-bg)':'var(--blue-bg)',color:note.color==='red'?'var(--red)':'var(--blue)'}}>{note.content}</div>}
                {dayShifts.map(s=>(
                  <div key={s.id} style={{display:'flex',alignItems:'center',gap:'6px'}}>
                    <span style={{width:'8px',height:'8px',borderRadius:'50%',background:s.profiles?.color_fg||'var(--accent)',display:'inline-block',flexShrink:0}}/>
                    <span style={{fontSize:'13px',fontWeight:'600'}}>{mkIni(s.profiles?.full_name)}</span>
                    <span style={{fontSize:'11px',color:'var(--text2)'}}>{s.poste} · {s.start_time?.slice(0,5)||'—'}</span>
                    <i className="ti ti-x" style={{fontSize:'13px',color:'var(--text3)',cursor:'pointer',marginLeft:'auto'}} onClick={()=>removeShift(s.id)}/>
                  </div>
                ))}
                {dayShifts.length===0 && <div style={{fontSize:'12px',color:'var(--text3)'}}>Aucun shift</div>}
              </div>
              <div style={{display:'flex',flexDirection:'column',justifyContent:'center',padding:'8px'}}>
                <button style={{background:'none',border:'none',cursor:'pointer',color:'var(--accent)',fontSize:'20px',padding:'4px'}} onClick={()=>window.location.href='/admin/day?date='+format(day,'yyyy-MM-dd')}>
                  <i className="ti ti-plus"/>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── PANNEAU JOUR ──
  function renderDayPanel() {
    if (!selectedDay) return null
    const dayShifts = shiftsForDay(selectedDay)
    const planned   = dayShifts.map(s=>s.user_id)
    const available = emps.filter(e=>!planned.includes(e.id))
    const dispos_day = disposForDay(selectedDay)

    return (
      <div className="card">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px'}}>
          <div style={{fontSize:'15px',fontWeight:'700'}}>{format(selectedDay,'EEEE d MMMM',{locale:fr})}</div>
          <div style={{display:'flex',gap:'8px'}}>
            <button className="btn btn-s btn-sm" onClick={()=>setModalNote({date:selectedDay})}><i className="ti ti-pencil"/>Note</button>
            <i className="ti ti-x" style={{fontSize:'20px',cursor:'pointer',color:'var(--text3)'}} onClick={()=>setSelectedDay(null)}/>
          </div>
        </div>

        {/* Note du jour */}
        {noteForDay(selectedDay) && (
          <div style={{background:noteForDay(selectedDay)?.color==='red'?'var(--red-bg)':'var(--blue-bg)',borderRadius:'var(--rs)',padding:'10px 14px',fontSize:'13px',color:noteForDay(selectedDay)?.color==='red'?'var(--red)':'var(--blue)',marginBottom:'10px',display:'flex',alignItems:'center',gap:'8px'}}>
            <i className={`ti ${noteForDay(selectedDay)?.color==='red'?'ti-alert-circle':'ti-info-circle'}`}/>
            {noteForDay(selectedDay)?.content}
          </div>
        )}

        {/* Shifts planifiés */}
        <div className="card-title">Shifts planifiés ({dayShifts.length})</div>
        {dayShifts.length===0 && <div style={{fontSize:'13px',color:'var(--text3)',marginBottom:'10px'}}>Aucun shift planifié</div>}
        {dayShifts.map(s=>(
          <div key={s.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
            <div className="av" style={{width:'32px',height:'32px',fontSize:'11px',fontWeight:'700',background:s.profiles?.color_bg||'#E6F1FB',color:s.profiles?.color_fg||'#185FA5'}}>{mkIni(s.profiles?.full_name)}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:'13px',fontWeight:'700'}}>{s.profiles?.full_name}</div>
              <div style={{fontSize:'12px',color:'var(--text2)'}}>{s.poste} · {s.start_time?.slice(0,5)||'—'}</div>
            </div>
            <button className="btn btn-s btn-sm" style={{color:'var(--red)',fontSize:'12px'}} onClick={()=>removeShift(s.id)}><i className="ti ti-trash"/></button>
          </div>
        ))}

        {/* Ajouter un shift */}
        {available.length > 0 && (
          <>
            <div className="card-title" style={{marginTop:'14px'}}>Ajouter un shift</div>
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              <select className="if" value={shiftForm.userId}
                onChange={e=>setShiftForm(f=>({...f,userId:e.target.value,poste:emps.find(em=>em.id===e.target.value)?.poste||postes[0]?.name||''}))}
                style={{cursor:'pointer'}}>
                {available.map(e=><option key={e.id} value={e.id}>{e.full_name} — {e.poste||'—'}</option>)}
              </select>
              {/* Sélecteur de poste depuis la liste des postes créés */}
              <select className="if" value={shiftForm.poste} onChange={e=>setShiftForm(f=>({...f,poste:e.target.value}))} style={{cursor:'pointer'}}>
                {postes.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
                {postes.length===0 && <option>— Créez des postes dans Équipe</option>}
              </select>
              <input className="if" type="time" value={shiftForm.startTime} onChange={e=>setShiftForm(f=>({...f,startTime:e.target.value}))} style={{fontSize:'18px',fontWeight:'700',textAlign:'center'}}/>
              <button className="btn btn-p" onClick={addShift}><i className="ti ti-plus"/>Planifier ce shift</button>
            </div>
          </>
        )}
        {available.length===0 && emps.length>0 && <div style={{fontSize:'13px',color:'var(--text3)',marginTop:'8px'}}>Tous les employés sont déjà planifiés.</div>}
        {emps.length===0 && <div style={{fontSize:'13px',color:'var(--text3)',marginTop:'8px'}}><Link to="/admin/team" style={{color:'var(--accent)'}}>Ajoutez d'abord des employés →</Link></div>}

        {/* Dispos */}
        {dispos_day.length > 0 && (
          <>
            <div className="card-title" style={{marginTop:'14px'}}>Disponibilités</div>
            {dispos_day.map(d=>{
              const emp = emps.find(e=>e.id===d.user_id)
              const colors = {g:['var(--green-bg)','#0A5E45','Disponible'],o:['var(--orange-bg)','#7A4500','Peut faire'],r:['var(--red-bg)','#8B1F1F','Indispo']}
              const [bg,fg,lbl] = colors[d.status]||['var(--bg)','var(--text2)','—']
              return (
                <div key={d.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'6px 0',borderBottom:'1px solid var(--border)'}}>
                  {emp && <div className="av" style={{width:'28px',height:'28px',fontSize:'10px',fontWeight:'700',background:emp.color_bg||'#E6F1FB',color:emp.color_fg||'#185FA5'}}>{mkIni(emp.full_name)}</div>}
                  <div style={{flex:1,fontSize:'13px'}}>{emp?.full_name||'—'}</div>
                  <span className="badge" style={{background:bg,color:fg}}>{lbl}</span>
                  {!planned.includes(d.user_id) && (
                    <button className="btn btn-s btn-sm" style={{fontSize:'11px'}}
                      onClick={()=>setShiftForm(f=>({...f,userId:d.user_id,poste:emps.find(e=>e.id===d.user_id)?.poste||postes[0]?.name||''}))}>
                      <i className="ti ti-plus"/>Planifier
                    </button>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/admin" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <h1>Planning</h1>
      </div>
      <div className="content">
        <div style={{display:'flex',gap:'8px'}}>
          <span className={`chip ${view==='month'?'c-on':'c-off'}`} onClick={()=>setView('month')}>Mois</span>
          <span className={`chip ${view==='week'?'c-on':'c-off'}`} onClick={()=>setView('week')}>Semaine</span>
        </div>
        {view==='month' ? renderMonth() : renderWeek()}
        {selectedDay && renderDayPanel()}
      </div>

      {/* Modal note */}
      {modalNote && (
        <div className="modal-bg" onClick={()=>setModalNote(null)}>
          <div className="ms" onClick={e=>e.stopPropagation()}>
            <div className="mh"/>
            <div style={{fontSize:'18px',fontWeight:'800',marginBottom:'4px'}}>Note du jour</div>
            <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'16px'}}>{format(modalNote.date,'EEEE d MMMM',{locale:fr})}</div>
            <textarea className="if" rows="2" style={{marginBottom:'12px'}} value={noteForm.content} onChange={e=>setNoteForm(f=>({...f,content:e.target.value}))} placeholder="Ex: Livraison 14h, réunion équipe…"/>
            <div style={{display:'flex',gap:'8px',marginBottom:'16px'}}>
              {[['normal','Normal'],['red','⚠️ Important']].map(([k,lbl])=>(
                <div key={k} onClick={()=>setNoteForm(f=>({...f,color:k}))}
                  style={{flex:1,padding:'10px',borderRadius:'var(--rs)',border:`2px solid ${noteForm.color===k?k==='red'?'var(--red)':'var(--accent)':'var(--border)'}`,fontSize:'13px',fontWeight:'700',textAlign:'center',cursor:'pointer',color:k==='red'?'var(--red)':'var(--text)'}}>
                  {lbl}
                </div>
              ))}
            </div>
            <button className="btn btn-p" onClick={saveNote}><i className="ti ti-check"/>Enregistrer</button>
            <button className="btn btn-s" style={{marginTop:'8px'}} onClick={()=>setModalNote(null)}>Annuler</button>
          </div>
        </div>
      )}

      <div className="nav">
        <Link to="/admin" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-layout-dashboard"/>Accueil</div></Link>
        <div className="nav-item active"><i className="ti ti-calendar"/>Planning</div>
        <Link to="/admin/team" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-users"/>Équipe</div></Link>
        <Link to="/admin/chat" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-message-2"/>Chat</div></Link>
        <Link to="/admin/profile" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-user-circle"/>Profil</div></Link>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
