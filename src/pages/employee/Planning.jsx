import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  const navigate = useNavigate()
  const [view, setView]       = useState('month')
  const [cursor, setCursor]   = useState(new Date())
  const [shifts, setShifts]   = useState([])
  const [notes, setNotes]     = useState([])
  const [dispos, setDispos]   = useState([])
  const [dayDetail, setDayDetail] = useState(null)
  const [loading, setLoading] = useState(false)

  function mkIni(n=''){ const p=n.trim().split(' '); return((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase() }

  async function loadData() {
    if (!profile?.id) return
    setLoading(true)
    let start, end
    if (view==='month'){ start=startOfMonth(cursor); end=endOfMonth(cursor) }
    else { start=startOfWeek(cursor,{weekStartsOn:1}); end=endOfWeek(cursor,{weekStartsOn:1}) }
    const fmt = d => format(d,'yyyy-MM-dd')

    // Requête 1 : MES shifts uniquement par user_id (le plus fiable)
    const { data: myShifts, error: e1 } = await supabase
      .from('shifts')
      .select('*, profiles!shifts_user_id_fkey(full_name,color_bg,color_fg,poste)')
      .eq('user_id', profile.id)
      .gte('shift_date', fmt(start))
      .lte('shift_date', fmt(end))

    if (e1) console.error('myShifts error:', e1)

    // Requête 2 : Shifts de l'équipe (pour voir les collègues)
    let teamShifts = []
    if (company?.id) {
      const { data: ts } = await supabase
        .from('shifts')
        .select('*, profiles!shifts_user_id_fkey(full_name,color_bg,color_fg,poste)')
        .eq('company_id', company.id)
        .gte('shift_date', fmt(start))
        .lte('shift_date', fmt(end))
      teamShifts = ts || []
    }

    // Fusionner sans doublons
    const all = [...teamShifts]
    ;(myShifts||[]).forEach(s => {
      if (!all.find(x=>x.id===s.id)) all.push(s)
    })

    // Notes
    let notes = []
    if (company?.id) {
      const { data: n } = await supabase.from('day_notes').select('*')
        .eq('company_id', company.id)
        .gte('note_date', fmt(start)).lte('note_date', fmt(end))
      notes = n || []
    }

    // Mes dispos
    const { data: d } = await supabase.from('dispos').select('*')
      .eq('user_id', profile.id)
      .gte('dispo_date', fmt(start)).lte('dispo_date', fmt(end))

    setShifts(all)
    setNotes(notes)
    setDispos(d||[])
    setLoading(false)
  }

  useEffect(() => {
    if (!profile?.id) return
    loadData()
    const ch = supabase.channel('emp-planning-'+profile.id)
      .on('postgres_changes', { event:'*', schema:'public', table:'shifts' }, () => {
        loadData()
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [profile?.id, company?.id, cursor, view])

  // ── helpers ──
  function myShiftsForDay(date) {
    const key = format(date,'yyyy-MM-dd')
    return shifts.filter(s => s.shift_date === key && s.user_id === profile?.id)
  }
  function allShiftsForDay(date) {
    const key = format(date,'yyyy-MM-dd')
    return shifts.filter(s => s.shift_date === key)
  }
  function dispoForDay(date) {
    const key = format(date,'yyyy-MM-dd')
    return dispos.find(d => d.dispo_date === key)
  }
  function noteForDay(date) {
    const key = format(date,'yyyy-MM-dd')
    return notes.find(n => n.note_date === key)
  }

  function openDayDetail(date) {
    setDayDetail({ date, shifts: allShiftsForDay(date) })
  }

  const dispoBg = { g:'#E1F5EE', o:'#FAEEDA', r:'#FCEBEB' }

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
            const mine    = myShiftsForDay(day)
            const dispo   = dispoForDay(day)
            const note    = noteForDay(day)
            const today   = isToday(day)
            const hasMine = mine.length > 0
            return (
              <div key={day.toISOString()} onClick={()=>openDayDetail(day)}
                style={{minHeight:'44px',borderRadius:'8px',cursor:'pointer',padding:'3px',
                  background: hasMine ? 'var(--blue-bg)' : dispo ? (dispoBg[dispo.status]||'transparent') : 'transparent',
                  border:`1px solid ${today?'var(--accent)':'var(--border)'}`,transition:'background .1s'}}>
                <div style={{fontSize:'12px',fontWeight:today?'800':'600',width:'22px',height:'22px',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',background:today?'var(--accent)':undefined,color:today?'#fff':'var(--text)'}}>
                  {format(day,'d')}
                </div>
                {hasMine && <div style={{width:'5px',height:'5px',borderRadius:'50%',background:'var(--accent)',margin:'1px auto 0'}}/>}
                {note && !hasMine && <div style={{width:'5px',height:'5px',borderRadius:'50%',background:note.color==='red'?'var(--red)':'var(--blue)',margin:'1px auto 0'}}/>}
              </div>
            )
          })}
        </div>
        <div style={{display:'flex',gap:'8px',flexWrap:'wrap',fontSize:'11px',color:'var(--text2)',marginTop:'10px'}}>
          <span style={{display:'flex',alignItems:'center',gap:'4px'}}><span style={{width:'8px',height:'8px',borderRadius:'50%',background:'var(--accent)',display:'inline-block'}}/> Votre shift</span>
          <span style={{display:'flex',alignItems:'center',gap:'4px'}}><span style={{width:'8px',height:'8px',background:'#E1F5EE',border:'1px solid #9FE1CB',borderRadius:'50%',display:'inline-block'}}/> Dispo</span>
        </div>
        {loading && <div style={{textAlign:'center',fontSize:'12px',color:'var(--text3)',marginTop:'8px'}}>Chargement…</div>}
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
          const allS  = allShiftsForDay(day)
          const mine  = myShiftsForDay(day)
          const note  = noteForDay(day)
          const today = isToday(day)
          return (
            <div key={day.toISOString()} style={{display:'flex',borderBottom:'1px solid var(--border)',background:today?'var(--blue-bg)':undefined,cursor:'pointer'}} onClick={()=>openDayDetail(day)}>
              <div style={{width:'48px',flexShrink:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'10px 4px',borderRight:'1px solid var(--border)'}}>
                <div style={{fontSize:'11px',color:'var(--text3)',fontWeight:'600'}}>{format(day,'EEE',{locale:fr}).toUpperCase()}</div>
                <div style={{width:'28px',height:'28px',borderRadius:'50%',background:today?'var(--accent)':undefined,color:today?'#fff':'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',fontWeight:'800',marginTop:'2px'}}>
                  {format(day,'d')}
                </div>
              </div>
              <div style={{flex:1,padding:'8px 10px',display:'flex',flexDirection:'column',gap:'4px'}}>
                {note && <div style={{fontSize:'11px',padding:'2px 8px',borderRadius:'10px',display:'inline-block',background:note.color==='red'?'var(--red-bg)':'var(--blue-bg)',color:note.color==='red'?'var(--red)':'var(--blue)'}}>{note.content}</div>}
                {mine.map(s=>(
                  <div key={s.id} style={{display:'flex',alignItems:'center',gap:'6px'}}>
                    <span style={{width:'8px',height:'8px',borderRadius:'50%',background:'var(--accent)',display:'inline-block',flexShrink:0}}/>
                    <span style={{fontSize:'13px',fontWeight:'800',color:'var(--accent)'}}>Vous</span>
                    <span style={{fontSize:'11px',color:'var(--text2)'}}>{s.poste} · {s.start_time?.slice(0,5)||'—'}</span>
                  </div>
                ))}
                {allS.filter(s=>s.user_id!==profile?.id).map(s=>(
                  <div key={s.id} style={{display:'flex',alignItems:'center',gap:'6px'}}>
                    <span style={{width:'8px',height:'8px',borderRadius:'50%',background:s.profiles?.color_fg||'var(--text3)',display:'inline-block',flexShrink:0}}/>
                    <span style={{fontSize:'13px',color:'var(--text2)',fontWeight:'600'}}>{mkIni(s.profiles?.full_name||'')}</span>
                    <span style={{fontSize:'11px',color:'var(--text3)'}}>{s.poste}</span>
                  </div>
                ))}
                {allS.length===0 && <div style={{fontSize:'12px',color:'var(--text3)'}}>Aucun shift</div>}
              </div>
              <div style={{display:'flex',alignItems:'center',padding:'8px'}}>
                <i className="ti ti-chevron-right" style={{color:'var(--text3)',fontSize:'16px'}}/>
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
        <button style={{background:'none',border:'none',cursor:'pointer',color:'var(--text2)',fontSize:'20px',padding:'4px'}} onClick={loadData} title="Actualiser">
          <i className="ti ti-refresh"/>
        </button>
      </div>

      <div className="content">
        <div style={{display:'flex',gap:'8px'}}>
          <span className={`chip ${view==='month'?'c-on':'c-off'}`} onClick={()=>setView('month')}>Mois</span>
          <span className={`chip ${view==='week'?'c-on':'c-off'}`} onClick={()=>setView('week')}>Semaine</span>
        </div>

        {view==='month' ? renderMonth() : renderWeek()}
      </div>

      {/* Modal détail du jour */}
      {dayDetail && (
        <div className="modal-bg" onClick={()=>setDayDetail(null)}>
          <div className="ms" onClick={e=>e.stopPropagation()}>
            <div className="mh"/>
            <div style={{fontSize:'18px',fontWeight:'800',marginBottom:'4px'}}>
              {format(dayDetail.date,'EEEE d MMMM',{locale:fr})}
            </div>

            {/* Note du jour */}
            {noteForDay(dayDetail.date) && (
              <div style={{background:noteForDay(dayDetail.date)?.color==='red'?'var(--red-bg)':'var(--blue-bg)',borderRadius:'var(--rs)',padding:'10px 14px',marginBottom:'12px',fontSize:'13px',color:noteForDay(dayDetail.date)?.color==='red'?'var(--red)':'var(--blue)',display:'flex',gap:'6px',alignItems:'center'}}>
                <i className="ti ti-info-circle"/>
                {noteForDay(dayDetail.date)?.content}
              </div>
            )}

            {/* Mon shift */}
            {dayDetail.shifts.filter(s=>s.user_id===profile?.id).length > 0 ? (
              <>
                <div style={{fontSize:'11px',fontWeight:'700',color:'var(--text2)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'8px'}}>Votre shift</div>
                {dayDetail.shifts.filter(s=>s.user_id===profile?.id).map(s=>(
                  <div key={s.id} style={{background:'var(--green-bg)',borderRadius:'var(--rs)',padding:'12px 14px',display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px'}}>
                    <i className="ti ti-star" style={{color:'var(--green)',fontSize:'18px'}}/>
                    <div>
                      <div style={{fontSize:'14px',fontWeight:'800',color:'#0A5E45'}}>{s.poste}</div>
                      <div style={{fontSize:'13px',color:'#0A5E45'}}>
                        {s.start_time?.slice(0,5)||'—'} → {s.end_time?.slice(0,5)||'fin au dépointage'}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div style={{background:'var(--bg)',borderRadius:'var(--rs)',padding:'12px',fontSize:'13px',color:'var(--text3)',textAlign:'center',marginBottom:'12px'}}>
                Pas de shift planifié pour vous ce jour
              </div>
            )}

            {/* Équipe */}
            {dayDetail.shifts.filter(s=>s.user_id!==profile?.id).length > 0 && (
              <>
                <div style={{fontSize:'11px',fontWeight:'700',color:'var(--text2)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'8px'}}>Équipe ce jour</div>
                {dayDetail.shifts.filter(s=>s.user_id!==profile?.id).map(s=>(
                  <div key={s.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                    <div className="av" style={{width:'32px',height:'32px',fontSize:'11px',fontWeight:'700',background:s.profiles?.color_bg||'#E6F1FB',color:s.profiles?.color_fg||'#185FA5'}}>{mkIni(s.profiles?.full_name||'')}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'13px',fontWeight:'700'}}>{s.profiles?.full_name}</div>
                      <div style={{fontSize:'12px',color:'var(--text2)'}}>{s.poste} · {s.start_time?.slice(0,5)||'—'}</div>
                    </div>
                  </div>
                ))}
              </>
            )}

            <div style={{display:'flex',gap:'8px',marginTop:'16px'}}>
              <button className="btn btn-p" style={{flex:1}} onClick={()=>{ navigate(`/emp/day?date=${format(dayDetail.date,'yyyy-MM-dd')}`); setDayDetail(null) }}>
                <i className="ti ti-timeline"/>Vue timeline
              </button>
              <button className="btn btn-s btn-sm" onClick={()=>setDayDetail(null)}>Fermer</button>
            </div>
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
