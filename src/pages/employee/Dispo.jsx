import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isToday, getDay, addMonths, subMonths
} from 'date-fns'
import { fr } from 'date-fns/locale'

export default function EmpDispo() {
  const { profile } = useAuth()
  const [cursor, setCursor]   = useState(new Date())
  const [dispos, setDispos]   = useState({}) // { 'yyyy-MM-dd': {id,status,remark} }
  const [remarkDay, setRemarkDay] = useState(null)
  const [remarkText, setRemarkText] = useState('')
  const [lastTap, setLastTap] = useState({})
  const [toast, setToast]     = useState('')
  const [saving, setSaving]   = useState(false)

  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''),2800) }

  async function loadDispos() {
    if (!profile) return
    const start = format(startOfMonth(cursor),'yyyy-MM-dd')
    const end   = format(endOfMonth(cursor),'yyyy-MM-dd')
    const { data } = await supabase.from('dispos').select('*')
      .eq('user_id', profile.id).gte('dispo_date', start).lte('dispo_date', end)
    const map = {}
    ;(data||[]).forEach(d => { map[d.dispo_date] = d })
    setDispos(map)
  }

  useEffect(() => { loadDispos() }, [profile, cursor])

  const cycle = ['', 'g', 'o', 'r']
  const dispoBg  = { g:'#E1F5EE', o:'#FAEEDA', r:'#FCEBEB' }
  const dispoCol = { g:'var(--green)', o:'var(--orange)', r:'var(--red)' }

  async function handleTap(date) {
    const key = format(date, 'yyyy-MM-dd')
    const now = Date.now()
    if (lastTap[key] && now - lastTap[key] < 400) {
      // double tap → remarque
      setLastTap(lt => ({...lt, [key]: 0}))
      setRemarkDay(key)
      setRemarkText(dispos[key]?.remark || '')
      return
    }
    setLastTap(lt => ({...lt, [key]: now}))

    // Cycle status
    const cur = dispos[key]?.status || ''
    const idx = cycle.indexOf(cur)
    const next = cycle[(idx+1) % cycle.length]
    const existing = dispos[key]

    if (next === '') {
      // Supprimer
      if (existing?.id) await supabase.from('dispos').delete().eq('id', existing.id)
      setDispos(d => { const n={...d}; delete n[key]; return n })
    } else {
      const { data, error } = await supabase.from('dispos').upsert({
        id: existing?.id,
        user_id: profile.id,
        dispo_date: key,
        status: next,
        remark: existing?.remark || null,
      }, { onConflict: 'user_id,dispo_date' }).select().single()
      if (!error && data) setDispos(d => ({...d, [key]: data}))
    }
  }

  async function saveRemark() {
    if (!remarkDay) return
    const existing = dispos[remarkDay]
    const { data } = await supabase.from('dispos').upsert({
      id: existing?.id,
      user_id: profile.id,
      dispo_date: remarkDay,
      status: existing?.status || 'g',
      remark: remarkText.trim() || null,
    }, { onConflict: 'user_id,dispo_date' }).select().single()
    if (data) setDispos(d => ({...d, [remarkDay]: data}))
    setRemarkDay(null)
    showToast('Remarque enregistrée ✅')
  }

  async function saveAll() {
    setSaving(true)
    showToast('Disponibilités sauvegardées ✅')
    setSaving(false)
  }

  const days = eachDayOfInterval({ start:startOfMonth(cursor), end:endOfMonth(cursor) })
  const pad  = (getDay(days[0])+6)%7

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/emp" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <h1>Mes disponibilités</h1>
      </div>

      <div className="content">
        {/* Légende */}
        <div className="card" style={{padding:'10px 14px'}}>
          <div style={{display:'flex',gap:'12px',flexWrap:'wrap',fontSize:'12px',fontWeight:'600'}}>
            {[['#1D9E75','Disponible'],['#EF9F27','Peut faire'],['#E24B4A','Indispo']].map(([c,l])=>(
              <span key={l} style={{display:'flex',alignItems:'center',gap:'5px'}}>
                <span style={{width:'11px',height:'11px',borderRadius:'50%',background:c,display:'inline-block'}}/>
                {l}
              </span>
            ))}
          </div>
          <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'6px'}}>Tap = changer · Double tap rapide = remarque perso</div>
        </div>

        {/* Calendrier */}
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
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'3px'}}>
            {Array(pad).fill(null).map((_,i)=><div key={'p'+i}/>)}
            {days.map(day=>{
              const key = format(day,'yyyy-MM-dd')
              const dispo = dispos[key]
              const today = isToday(day)
              const bg = dispo ? dispoBg[dispo.status]||'transparent' : 'transparent'
              return (
                <div key={key}
                  onClick={()=>handleTap(day)}
                  style={{minHeight:'42px',borderRadius:'8px',cursor:'pointer',padding:'3px',
                    background:bg,
                    border:`1px solid ${today?'var(--accent)':'var(--border)'}`,
                    transition:'background .1s',userSelect:'none'}}>
                  <div style={{fontSize:'12px',fontWeight:today?'800':'600',width:'22px',height:'22px',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',background:today?'var(--accent)':undefined,color:today?'#fff':'var(--text)'}}>
                    {format(day,'d')}
                  </div>
                  {dispo?.remark && (
                    <div style={{fontSize:'9px',color:dispoCol[dispo.status]||'var(--text3)',textAlign:'center',marginTop:'1px'}}>✎</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Panneau remarque */}
        {remarkDay && (
          <div className="card" style={{border:'2px solid var(--accent)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
              <div style={{fontSize:'15px',fontWeight:'700'}}>Remarque — {remarkDay}</div>
              <i className="ti ti-x" style={{cursor:'pointer',color:'var(--text2)',fontSize:'20px'}} onClick={()=>setRemarkDay(null)}/>
            </div>
            <textarea className="if" rows="2" placeholder="Ex: disponible seulement jusqu'à 14h…" value={remarkText} onChange={e=>setRemarkText(e.target.value)}/>
            <button className="btn btn-p" style={{marginTop:'10px'}} onClick={saveRemark}>
              <i className="ti ti-check"/>Enregistrer
            </button>
          </div>
        )}

        <button className="btn btn-p" onClick={saveAll} disabled={saving}>
          <i className="ti ti-check"/>{saving?'Sauvegarde…':'Sauvegarder'}
        </button>
      </div>

      <div className="nav">
        <Link to="/emp" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-layout-dashboard"/>Accueil</div></Link>
        <Link to="/emp/planning" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-calendar"/>Planning</div></Link>
        <div className="nav-item active"><i className="ti ti-adjustments"/>Dispos</div>
        <Link to="/emp/chat" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-message-2"/>Chat</div></Link>
        <Link to="/emp/profile" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-user-circle"/>Profil</div></Link>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
