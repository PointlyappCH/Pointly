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

export default function EmpPlanning() {
  const { profile, company } = useAuth()
  const [view, setView]     = useState('month')
  const [cursor, setCursor] = useState(new Date())
  const [shifts, setShifts] = useState([])
  const [notes, setNotes]   = useState([])
  const [dispos, setDispos] = useState([])
  const [dayDetail, setDayDetail] = useState(null) // { date, shifts }

  function mkIni(name=''){ const p=name.trim().split(' '); return((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase() }

  async function loadData() {
    if (!profile || !company) return
    let start, end
    if (view==='month'){ start=startOfMonth(cursor); end=endOfMonth(cursor) }
    else { start=startOfWeek(cursor,{weekStartsOn:1}); end=endOfWeek(cursor,{weekStartsOn:1}) }
    const fmt = d => format(d,'yyyy-MM-dd')

    // Tous les shifts de la période (pour voir qui travaille)
    const { data: s } = await supabase.from('shifts')
      .select('*, profiles(full_name,color_bg,color_fg,poste)')
      .eq('company_id', company.id)
      .gte('shift_date', fmt(start)).lte('shift_date', fmt(end))

    // Notes du jour
    const { data: n } = await supabase.from('day_notes').select('*')
      .eq('company_id', company.id)
      .gte('note_date', fmt(start)).lte('note_date', fmt(end))

    // Mes dispos
    const { data: d } = await supabase.from('dispos').select('*')
      .eq('user_id', profile.id)
      .gte('dispo_date', fmt(start)).lte('dispo_date', fmt(end))

    setShifts(s||[])
    setNotes(n||[])
    setDispos(d||[])
  }

  useEffect(() => { loadData() }, [profile, company, cursor, view])

  function myShiftsForDay(date) {
    const key = format(date,'yyyy-MM-dd')
    return shifts.filter(s=>s.shift_date===key && s.user_id===profile?.id)
  }
  function allShiftsForDay(date) {
    const key = format(date,'yyyy-MM-dd')
    return shifts.filter(s=>s.shift_date===key)
  }
  function dispoForDay(date) {
    const key = format(date,'yyyy-MM-dd')
    return dispos.find(d=>d.dispo_date===key)
  }
  function noteForDay(date) {
    const key = format(date,'yyyy-MM-dd')
    return notes.find(n=>n.note_date===key)
  }

  const dispoBg = { g:'#E1F5EE', o:'#FAEEDA', r:'#FCEBEB' }

  function openDayDetail(date) {
    setDayDetail({ date, shifts: allShiftsForDay(date) })
  }

  // ── VUE MOIS ──
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
            const mine   = myShiftsForDay(day)
            const dispo  = dispoForDay(day)
            const note   = noteForDay(day)
            const today  = isToday(day)
            const hasMine = mine.length > 0
            return (
              <div key={day.toISOString()}
                onClick={()=>window.location.href='/emp/day?date='+format(day,'yyyy-MM-dd')}
                style={{minHeight:'44px',borderRadius:'8px',cursor:'pointer',padding:'3px',
                  background: hasMine ? 'var(--blue-bg)' : dispo ? dispoBg[dispo.status]||'transparent' : 'transparent',
                  border:`1px solid ${today?'var(--accent)':'var(--border)'}`,
                  transition:'background .1s'}}>
                <div style={{fontSize:'12px',fontWeight:today?'800':'600',width:'22px',height:'22px',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',background:today?'var(--accent)':undefined,color:today?'#fff':'var(--text)'}}>
                  {format(day,'d')}
                </div>
                {hasMine && <div style={{width:'5px',height:'5px',borderRadius:'50%',background:'var(--accent)',margin:'1px auto 0'}}/>}
                {note && !hasMine && <div style={{width:'5px',height:'5px',borderRadius:'50%',background:note.color==='red'?'var(--red)':'var(--blue)',margin:'1px auto 0'}}/>}
              </div>
            )
          })}
        </div>
        <div style={{display:'flex',gap:'10px',flexWrap:'wrap',fontSize:'11px',color:'var(--text2)',marginTop:'10px'}}>
          <span style={{display:'flex',alignItems:'center',gap:'4px'}}><span style={{width:'8px',height:'8px',borderRadius:'50%',background:'var(--accent)',display:'inline-block'}}/> Votre shift</span>
          <span style={{display:'flex',alignItems:'center',gap:'4px'}}><span style={{width:'8px',height:'8px',background:'#E1F5EE',border:'1px solid #9FE1CB',borderRadius:'50%',display:'inline-block'}}/> Dispo</span>
          <span style={{display:'flex',alignItems:'center',gap:'4px'}}><span style={{width:'8px',height:'8px',background:'#FAEEDA',border:'1px solid #F5C98A',borderRadius:'50%',display:'inline-block'}}/> Peut faire</span>
          <span style={{display:'flex',alignItems:'center',gap:'4px'}}><span style={{width:'8px',height:'8px',background:'#FCEBEB',border:'1px solid #F4AAAA',borderRadius:'50%',display:'inline-block'}}/> Indispo</span>
        </div>
        <div style={{marginTop:'6px',fontSize:'11px',color:'var(--text3)'}}>Cliquez un jour pour voir l'équipe</div>
      </div>
    )
  }

  // ── VUE SEMAINE ──
  function renderWeek() {
    const weekStart = startOfWeek(cursor,{weekStartsOn:1})
    const days = eachDayOfInterval({ start:weekStart, end:endOfWeek(cursor,{weekStartsOn:1}) })

    return (
      <div className="card" style={{padding:'0',overflow:'hidden'}}>
        <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <i className="ti ti-chevron-left" style={{fontSize:'20px',cursor:'pointer',color:'var(--text2)'}} onClick={()=>setCursor(subWeeks(cursor,1))}/>
          <span style={{fontSize:'15px',fontWeight:'700'}}>
            {format(weekStart,'d MMM',{locale:fr})} – {format(days[6],'d MMM yyyy',{locale:fr})}
          </span>
          <i className="ti ti-chevron-right" style={{fontSize:'20px',cursor:'pointer',color:'var(--text2)'}} onClick={()=>setCursor(addWeeks(cursor,1))}/>
        </div>
        {days.map(day=>{
          const allS = allShiftsForDay(day)
          const mine = myShiftsForDay(day)
          const note = noteForDay(day)
          const today = isToday(day)
          return (
            <div key={day.toISOString()} style={{display:'flex',borderBottom:'1px solid var(--border)',background:today?'var(--blue-bg)':undefined,cursor:'pointer'}} onClick={()=>window.location.href='/emp/day?date='+format(day,'yyyy-MM-dd')}>
              <div style={{width:'48px',flexShrink:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'10px 4px',borderRight:'1px solid var(--border)'}}>
                <div style={{fontSize:'11px',color:'var(--text3)',fontWeight:'600'}}>{format(day,'EEE',{locale:fr}).toUpperCase()}</div>
                <div style={{width:'28px',height:'28px',borderRadius:'50%',background:today?'var(--accent)':undefined,color:today?'#fff':'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',fontWeight:'800',marginTop:'2px'}}>
                  {format(day,'d')}
                </div>
              </div>
              <div style={{flex:1,padding:'8px 10px',display:'flex',flexDirection:'column',gap:'4px'}}>
                {note && <div style={{fontSize:'11px',padding:'2px 8px',borderRadius:'10px',display:'inline-block',background:note.color==='red'?'var(--red-bg)':'var(--blue-bg)',color:note.color==='red'?'var(--red)':'var(--blue)'}}>{note.content}</div>}
                {mine.length>0 && mine.map(s=>(
                  <div key={s.id} style={{display:'flex',alignItems:'center',gap:'6px'}}>
                    <span style={{width:'8px',height:'8px',borderRadius:'50%',background:'var(--accent)',display:'inline-block',flexShrink:0}}/>
                    <span style={{fontSize:'13px',fontWeight:'800',color:'var(--accent)'}}>Vous</span>
                    <span style={{fontSize:'11px',color:'var(--text2)'}}>{s.poste} · {s.start_time?.slice(0,5)||'—'}</span>
                  </div>
                ))}
                {allS.filter(s=>s.user_id!==profile?.id).map(s=>(
                  <div key={s.id} style={{display:'flex',alignItems:'center',gap:'6px'}}>
                    <span style={{width:'8px',height:'8px',borderRadius:'50%',background:s.profiles?.color_fg||'var(--text3)',display:'inline-block',flexShrink:0}}/>
                    <span style={{fontSize:'13px',color:'var(--text2)'}}>{mkIni(s.profiles?.full_name)}</span>
                    <span style={{fontSize:'11px',color:'var(--text3)'}}>{s.poste}</span>
                  </div>
                ))}
                {allS.length===0 && <div style={{fontSize:'12px',color:'var(--text3)'}}>Aucun shift</div>}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/emp" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <h1>Mon planning</h1>
      </div>

      <div className="content">
        <div style={{display:'flex',gap:'8px'}}>
          <span className={`chip ${view==='month'?'c-on':'c-off'}`} onClick={()=>setView('month')}>Mois</span>
          <span className={`chip ${view==='week'?'c-on':'c-off'}`} onClick={()=>setView('week')}>Semaine</span>
        </div>

        {view==='month' ? renderMonth() : renderWeek()}
      </div>

      {/* MODAL : qui travaille ce jour */}
      {dayDetail && (
        <div className="modal-bg" onClick={()=>setDayDetail(null)}>
          <div className="ms" onClick={e=>e.stopPropagation()}>
            <div className="mh"/>
            <div style={{fontSize:'18px',fontWeight:'800',marginBottom:'4px'}}>
              {format(dayDetail.date,'EEEE d MMMM',{locale:fr})}
            </div>

            {/* Mon shift */}
            {dayDetail.shifts.filter(s=>s.user_id===profile?.id).map(s=>(
              <div key={s.id} style={{background:'var(--green-bg)',borderRadius:'var(--rs)',padding:'10px 14px',display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px'}}>
                <i className="ti ti-star" style={{color:'var(--green)'}}/>
                <span style={{fontSize:'13px',fontWeight:'700',color:'#0A5E45'}}>Votre shift : {s.start_time?.slice(0,5)||'—'} → ? · {s.poste}</span>
              </div>
            ))}

            {/* Équipe */}
            <div style={{fontSize:'11px',fontWeight:'700',color:'var(--text2)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'8px'}}>Équipe ce jour</div>
            {dayDetail.shifts.filter(s=>s.user_id!==profile?.id).length===0 && (
              <div style={{fontSize:'13px',color:'var(--text3)',padding:'6px 0'}}>Personne d'autre planifié</div>
            )}
            {dayDetail.shifts.filter(s=>s.user_id!==profile?.id).map(s=>(
              <div key={s.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <div className="av" style={{width:'32px',height:'32px',fontSize:'11px',background:s.profiles?.color_bg||'#E6F1FB',color:s.profiles?.color_fg||'#185FA5'}}>{mkIni(s.profiles?.full_name)}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:'13px',fontWeight:'700'}}>{s.profiles?.full_name}</div>
                  <div style={{fontSize:'12px',color:'var(--text2)'}}>{s.poste} · {s.start_time?.slice(0,5)||'—'}</div>
                </div>
              </div>
            ))}
            {dayDetail.shifts.length===0 && (
              <div style={{fontSize:'13px',color:'var(--text3)'}}>Aucun shift planifié ce jour</div>
            )}
            <button className="btn btn-s" style={{marginTop:'16px'}} onClick={()=>setDayDetail(null)}>Fermer</button>
          </div>
        </div>
      )}

      <div className="nav">
        <Link to="/emp" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-layout-dashboard"/>Accueil</div></Link>
        <div className="nav-item active"><i className="ti ti-calendar"/>Planning</div>
        <Link to="/emp/dispo" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-adjustments"/>Dispos</div></Link>
        <Link to="/emp/chat" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-message-2"/>Chat</div></Link>
        <Link to="/emp/profile" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-user-circle"/>Profil</div></Link>
      </div>
    </div>
  )
}
