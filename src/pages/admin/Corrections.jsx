import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function AdminCorrections() {
  const { profile, company } = useAuth()
  const [logs, setLogs]       = useState([])
  const [emps, setEmps]       = useState([])
  const [editLog, setEditLog] = useState(null)
  const [toast, setToast]     = useState('')
  const [form, setForm]       = useState({ punched_in:'', pause_start:'', pause_end:'', punched_out:'', remark:'' })

  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''),2800) }

  async function load() {
    if (!company) return
    const today = format(new Date(),'yyyy-MM-dd')
    // Logs du jour avec erreurs ou incomplets
    const { data: l } = await supabase.from('time_logs')
      .select('*, profiles(full_name,color_bg,color_fg)')
      .eq('company_id', company.id)
      .eq('log_date', today)
      .order('created_at')
    const { data: e } = await supabase.from('profiles').select('*')
      .eq('company_id', company.id).eq('role','employee').order('full_name')
    setLogs(l||[])
    setEmps(e||[])
  }

  useEffect(() => { load() }, [company])

  function openEdit(log) {
    setEditLog(log)
    function toTime(ts) {
      if (!ts) return ''
      return format(parseISO(ts), 'HH:mm')
    }
    setForm({
      punched_in:   toTime(log.punched_in),
      pause_start:  toTime(log.pause_start),
      pause_end:    toTime(log.pause_end),
      punched_out:  toTime(log.punched_out),
      remark:       log.remark||'',
    })
  }

  function toISO(timeStr, baseDate) {
    if (!timeStr) return null
    const [h,m] = timeStr.split(':')
    const d = new Date(baseDate)
    d.setHours(parseInt(h), parseInt(m), 0, 0)
    return d.toISOString()
  }

  async function saveCorrection() {
    if (!editLog) return
    const base = editLog.log_date
    const pi   = toISO(form.punched_in,  base)
    const ps   = toISO(form.pause_start, base)
    const pe   = toISO(form.pause_end,   base)
    const po   = toISO(form.punched_out, base)

    // Calcul heures nettes
    let net = null
    if (pi && po) {
      const brut  = (new Date(po) - new Date(pi)) / 3600000
      const pause = (ps && pe) ? (new Date(pe) - new Date(ps)) / 3600000 : 0
      net = Math.max(0, brut - pause)
    }

    const { error } = await supabase.from('time_logs').update({
      punched_in:  pi,
      pause_start: ps,
      pause_end:   pe,
      punched_out: po,
      net_hours:   net,
      remark:      form.remark||null,
      is_modified: true,
      modified_by: profile.id,
      error_24h:   false,
    }).eq('id', editLog.id)

    if (error) { showToast('Erreur : '+error.message); return }
    setEditLog(null)
    load()
    showToast('Correction enregistrée ✅')
  }

  function mkIni(name=''){ const p=name.trim().split(' '); return((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase() }
  function fmtTime(ts){ if(!ts)return'—'; return format(parseISO(ts),'HH:mm') }
  function fmtNet(h){ if(!h&&h!==0)return'—'; const ih=Math.floor(h); const im=Math.round((h-ih)*60); return `${ih}h${String(im).padStart(2,'0')}` }

  const errors   = logs.filter(l=>l.error_24h || (!l.punched_out && l.punched_in))
  const modified = logs.filter(l=>l.is_modified)
  const normal   = logs.filter(l=>!l.error_24h && l.punched_out && !l.is_modified)

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/admin" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <h1>Corrections d'heures</h1>
        <div style={{fontSize:'12px',color:'var(--text2)',fontWeight:'600'}}>{format(new Date(),'d MMM',{locale:fr})}</div>
      </div>

      <div className="content">
        {/* ALERTES */}
        {errors.length > 0 && (
          <div style={{background:'var(--red-bg)',border:'1px solid var(--red)',borderRadius:'var(--rs)',padding:'10px 14px',display:'flex',alignItems:'center',gap:'8px'}}>
            <i className="ti ti-alert-circle" style={{color:'var(--red)',fontSize:'18px',flexShrink:0}}/>
            <span style={{fontSize:'13px',color:'#8B1F1F',fontWeight:'600'}}>{errors.length} correction{errors.length>1?'s':''} nécessaire{errors.length>1?'s':''}</span>
          </div>
        )}

        {/* À corriger */}
        {errors.length > 0 && (
          <div className="card">
            <div className="card-title" style={{display:'flex',alignItems:'center',gap:'6px'}}>
              <span style={{width:'8px',height:'8px',borderRadius:'50%',background:'var(--red)',display:'inline-block'}}/>
              À corriger ({errors.length})
            </div>
            {errors.map(log => {
              const p = log.profiles
              return (
                <div key={log.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                  <div className="av" style={{width:'34px',height:'34px',fontSize:'11px',background:p?.color_bg||'#FCEBEB',color:p?.color_fg||'#8B1F1F'}}>{mkIni(p?.full_name)}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'14px',fontWeight:'700'}}>{p?.full_name}</div>
                    <div style={{fontSize:'12px',color:'var(--text2)'}}>
                      {log.error_24h ? '⚠️ Oubli de dépointage (>24h)' : `Pointé ${fmtTime(log.punched_in)} · dépointage manquant`}
                    </div>
                  </div>
                  <button className="btn btn-r btn-sm" onClick={()=>openEdit(log)}>
                    <i className="ti ti-pencil"/>Corriger
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Logs normaux */}
        {normal.length > 0 && (
          <div className="card">
            <div className="card-title" style={{display:'flex',alignItems:'center',gap:'6px'}}>
              <span style={{width:'8px',height:'8px',borderRadius:'50%',background:'var(--green)',display:'inline-block'}}/>
              Terminés ({normal.length})
            </div>
            {normal.map(log => {
              const p = log.profiles
              return (
                <div key={log.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                  <div className="av" style={{width:'34px',height:'34px',fontSize:'11px',background:p?.color_bg||'#E6F1FB',color:p?.color_fg||'#185FA5'}}>{mkIni(p?.full_name)}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'14px',fontWeight:'700'}}>{p?.full_name}</div>
                    <div style={{fontSize:'12px',color:'var(--text2)'}}>
                      {fmtTime(log.punched_in)} → {fmtTime(log.punched_out)}
                      {log.pause_start&&log.pause_end&&` · pause ${fmtTime(log.pause_start)}–${fmtTime(log.pause_end)}`}
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:'14px',fontWeight:'700',color:'var(--green)'}}>{fmtNet(log.net_hours)}</div>
                    <button className="btn btn-s btn-sm" style={{marginTop:'4px',fontSize:'11px'}} onClick={()=>openEdit(log)}>
                      <i className="ti ti-pencil"/>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Modifiés */}
        {modified.length > 0 && (
          <div className="card">
            <div className="card-title" style={{display:'flex',alignItems:'center',gap:'6px'}}>
              <span style={{width:'8px',height:'8px',borderRadius:'50%',background:'var(--orange)',display:'inline-block'}}/>
              Modifiés manuellement ({modified.length})
            </div>
            {modified.map(log => {
              const p = log.profiles
              return (
                <div key={log.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 0',borderBottom:'1px solid var(--border)',background:'#FFFBF0',borderRadius:'var(--rs)',padding:'8px 10px',marginBottom:'4px'}}>
                  <div className="av" style={{width:'34px',height:'34px',fontSize:'11px',background:p?.color_bg||'#FAEEDA',color:p?.color_fg||'#7A4500'}}>{mkIni(p?.full_name)}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'14px',fontWeight:'700'}}>{p?.full_name}</div>
                    <div style={{fontSize:'12px',color:'var(--text2)'}}>
                      {fmtTime(log.punched_in)} → {fmtTime(log.punched_out)} · {fmtNet(log.net_hours)}
                    </div>
                    {log.remark && <div style={{fontSize:'11px',color:'#7A4500',fontStyle:'italic',marginTop:'2px'}}>{log.remark}</div>}
                  </div>
                  <span className="badge bo" style={{fontSize:'10px'}}>Modifié</span>
                </div>
              )
            })}
          </div>
        )}

        {logs.length === 0 && (
          <div className="card" style={{textAlign:'center',padding:'24px'}}>
            <i className="ti ti-clock-check" style={{fontSize:'32px',color:'var(--text3)',display:'block',marginBottom:'8px'}}/>
            <div style={{fontSize:'14px',color:'var(--text2)'}}>Aucun pointage aujourd'hui</div>
          </div>
        )}
      </div>

      {/* MODAL CORRECTION */}
      {editLog && (
        <div className="modal-bg" onClick={()=>setEditLog(null)}>
          <div className="ms" onClick={e=>e.stopPropagation()}>
            <div className="mh"/>
            <div style={{fontSize:'18px',fontWeight:'800',marginBottom:'4px'}}>
              Corriger — {editLog.profiles?.full_name}
            </div>
            <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'16px'}}>
              {format(parseISO(editLog.log_date),'EEEE d MMMM yyyy',{locale:fr})}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
              <div className="iw">
                <div className="il">Arrivée</div>
                <input className="if" type="time" value={form.punched_in} onChange={e=>setForm(f=>({...f,punched_in:e.target.value}))} style={{fontSize:'18px',fontWeight:'700',textAlign:'center'}}/>
              </div>
              <div className="iw">
                <div className="il">Départ</div>
                <input className="if" type="time" value={form.punched_out} onChange={e=>setForm(f=>({...f,punched_out:e.target.value}))} style={{fontSize:'18px',fontWeight:'700',textAlign:'center'}}/>
              </div>
              <div className="iw">
                <div className="il">Début pause</div>
                <input className="if" type="time" value={form.pause_start} onChange={e=>setForm(f=>({...f,pause_start:e.target.value}))}/>
              </div>
              <div className="iw">
                <div className="il">Fin pause</div>
                <input className="if" type="time" value={form.pause_end} onChange={e=>setForm(f=>({...f,pause_end:e.target.value}))}/>
              </div>
            </div>
            {/* Aperçu calcul */}
            {form.punched_in && form.punched_out && (() => {
              const pi = new Date(`2000-01-01T${form.punched_in}`)
              const po = new Date(`2000-01-01T${form.punched_out}`)
              const brut = (po-pi)/3600000
              let pause = 0
              if (form.pause_start && form.pause_end) {
                const ps = new Date(`2000-01-01T${form.pause_start}`)
                const pe = new Date(`2000-01-01T${form.pause_end}`)
                pause = (pe-ps)/3600000
              }
              const net = Math.max(0, brut-pause)
              const ih=Math.floor(net); const im=Math.round((net-ih)*60)
              return (
                <div style={{background:'var(--green-bg)',borderRadius:'var(--rs)',padding:'10px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                  <span style={{fontSize:'13px',color:'#0A5E45',fontWeight:'600'}}>Heures nettes calculées</span>
                  <span style={{fontSize:'18px',fontWeight:'800',color:'var(--green)'}}>{ih}h{String(im).padStart(2,'0')}</span>
                </div>
              )
            })()}
            <div className="iw" style={{marginBottom:'16px'}}>
              <div className="il">Remarque (visible dans l'export)</div>
              <textarea className="if" rows="2" value={form.remark} onChange={e=>setForm(f=>({...f,remark:e.target.value}))} placeholder="Ex: oubli de dépointage, maladie…"/>
            </div>
            <button className="btn btn-p" onClick={saveCorrection}><i className="ti ti-check"/>Enregistrer la correction</button>
            <button className="btn btn-s" style={{marginTop:'8px'}} onClick={()=>setEditLog(null)}>Annuler</button>
          </div>
        </div>
      )}

      <div className="nav">
        <Link to="/admin" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-layout-dashboard"/>Accueil</div></Link>
        <Link to="/admin/planning" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-calendar"/>Planning</div></Link>
        <Link to="/admin/team" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-users"/>Équipe</div></Link>
        <Link to="/admin/chat" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-message-2"/>Chat</div></Link>
        <Link to="/admin/profile" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-user-circle"/>Profil</div></Link>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
