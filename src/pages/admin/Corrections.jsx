import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { format, parseISO, addDays, subDays, isToday, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function AdminCorrections() {
  const { profile, company } = useAuth()
  const [logs, setLogs]       = useState([])
  const [emps, setEmps]       = useState([])
  const [editLog, setEditLog] = useState(null)
  const [toast, setToast]     = useState('')
  const [form, setForm]       = useState({ punched_in:'', pause_start:'', pause_end:'', punched_out:'', remark:'' })
  const [cursor, setCursor]   = useState(new Date())
  const [mode, setMode]       = useState('day') // 'day' | 'employee'
  const [selEmpId, setSelEmpId] = useState('')
  const [empMonthCursor, setEmpMonthCursor] = useState(new Date())
  const [empLogs, setEmpLogs] = useState([])
  const [segModal, setSegModal] = useState(null) // { log, segments }

  const dateKey = format(cursor,'yyyy-MM-dd')

  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''),2800) }

  async function load() {
    if (!company) return
    // Logs du jour sélectionné (par défaut aujourd'hui) avec erreurs ou incomplets
    const { data: l } = await supabase.from('time_logs')
      .select('*, profiles!time_logs_user_id_fkey(full_name,color_bg,color_fg)')
      .eq('company_id', company.id)
      .eq('log_date', dateKey)
      .order('created_at')
    const { data: e } = await supabase.from('profiles').select('*')
      .eq('company_id', company.id).eq('role','employee').order('full_name')
    setLogs(l||[])
    setEmps(e||[])
  }

  useEffect(() => { load() }, [company, dateKey])

  async function loadEmployeeLogs() {
    if (!company || !selEmpId) { setEmpLogs([]); return }
    const start = format(startOfMonth(empMonthCursor),'yyyy-MM-dd')
    const end   = format(endOfMonth(empMonthCursor),'yyyy-MM-dd')
    const { data } = await supabase.from('time_logs')
      .select('*, profiles!time_logs_user_id_fkey(full_name,color_bg,color_fg)')
      .eq('company_id', company.id)
      .eq('user_id', selEmpId)
      .gte('log_date', start).lte('log_date', end)
      .order('log_date', { ascending: false })
    setEmpLogs(data||[])
  }

  useEffect(() => { if (mode==='employee') loadEmployeeLogs() }, [mode, selEmpId, empMonthCursor, company])

  async function openSegments(log) {
    const { data } = await supabase.from('shift_segments')
      .select('*').eq('time_log_id', log.id).order('started_at')
    setSegModal({ log, segments: data||[] })
  }

  // Ouvre l'édition pour un jour donné (existant ou non) depuis la vue par employé
  function openEditForDate(dateStr) {
    const emp = emps.find(e=>e.id===selEmpId)
    const existing = empLogs.find(l=>l.log_date===dateStr)
    if (existing) { openEdit(existing); return }
    setEditLog({ id: null, log_date: dateStr, user_id: selEmpId, profiles: emp })
    setForm({ punched_in:'', pause_start:'', pause_end:'', punched_out:'', remark:'' })
  }

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

  // Ouvre l'édition pour un employé qui n'a AUCUN pointage ce jour-là (oubli total)
  function openAddMissing(emp) {
    setEditLog({ id: null, log_date: dateKey, user_id: emp.id, profiles: emp })
    setForm({ punched_in:'', pause_start:'', pause_end:'', punched_out:'', remark:'' })
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

    // Remarque automatique pour tracer une saisie/correction manuelle
    const AUTO_TAG = 'Heures modifiées manuellement'
    let finalRemark = form.remark.trim()
    if (!finalRemark) finalRemark = AUTO_TAG
    else if (!finalRemark.includes(AUTO_TAG)) finalRemark = `${AUTO_TAG} — ${finalRemark}`

    const payload = {
      punched_in:  pi,
      pause_start: ps,
      pause_end:   pe,
      punched_out: po,
      net_hours:   net,
      remark:      finalRemark,
      is_modified: true,
      modified_by: profile.id,
      error_24h:   false,
    }

    const { error } = editLog.id
      ? await supabase.from('time_logs').update(payload).eq('id', editLog.id)
      : await supabase.from('time_logs').insert({
          ...payload,
          user_id: editLog.user_id,
          company_id: company.id,
          log_date: editLog.log_date,
        })

    if (error) { showToast('Erreur : '+error.message); return }
    setEditLog(null)
    load()
    if (mode==='employee') loadEmployeeLogs()
    showToast('Correction enregistrée ✅')
  }

  function mkIni(name=''){ const p=name.trim().split(' '); return((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase() }
  function fmtTime(ts){ if(!ts)return'—'; return format(parseISO(ts),'HH:mm') }
  function fmtNet(h){ if(!h&&h!==0)return'—'; const ih=Math.floor(h); const im=Math.round((h-ih)*60); return `${ih}h${String(im).padStart(2,'0')}` }

  const errors   = logs.filter(l=>l.error_24h || (!l.punched_out && l.punched_in))
  const modified = logs.filter(l=>l.is_modified)
  const normal   = logs.filter(l=>!l.error_24h && l.punched_out && !l.is_modified)
  const withLog  = new Set(logs.map(l=>l.user_id))
  const missing  = emps.filter(e=>!withLog.has(e.id))

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/admin" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <h1>Corrections d'heures</h1>
      </div>

      <div className="content">
        {/* Toggle mode */}
        <div style={{display:'flex',gap:'8px'}}>
          <span className={`chip ${mode==='day'?'c-on':'c-off'}`} onClick={()=>setMode('day')}>Vue du jour</span>
          <span className={`chip ${mode==='employee'?'c-on':'c-off'}`} onClick={()=>setMode('employee')}>Par employé</span>
        </div>

        {mode==='employee' ? (
          <>
            {/* Sélecteur employé */}
            <div className="card">
              <div className="card-title">Employé</div>
              <select className="if" value={selEmpId} onChange={e=>setSelEmpId(e.target.value)} style={{cursor:'pointer'}}>
                <option value="">— Choisir un employé —</option>
                {emps.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>

            {selEmpId && (
              <>
                {/* Navigation mois */}
                <div className="card" style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px'}}>
                  <i className="ti ti-chevron-left" style={{fontSize:'20px',cursor:'pointer',color:'var(--text2)'}} onClick={()=>setEmpMonthCursor(c=>subMonths(c,1))}/>
                  <span style={{fontSize:'14px',fontWeight:'700'}}>{format(empMonthCursor,'MMMM yyyy',{locale:fr})}</span>
                  <i className="ti ti-chevron-right" style={{fontSize:'20px',cursor:'pointer',color:'var(--text2)'}} onClick={()=>setEmpMonthCursor(c=>addMonths(c,1))}/>
                </div>

                {/* Bouton ajouter un jour précis */}
                <div className="card" style={{display:'flex',gap:'8px',alignItems:'center'}}>
                  <input type="date" className="if" style={{flex:1}} id="manualDateInput"
                    max={format(new Date(),'yyyy-MM-dd')}/>
                  <button className="btn btn-s btn-sm" onClick={()=>{
                    const val = document.getElementById('manualDateInput').value
                    if (val) openEditForDate(val)
                  }}>
                    <i className="ti ti-plus"/>Saisir
                  </button>
                </div>

                {/* Liste des logs du mois pour cet employé */}
                <div className="card">
                  <div className="card-title">
                    Historique — {format(empMonthCursor,'MMMM yyyy',{locale:fr})} ({empLogs.length})
                  </div>
                  {empLogs.length===0 && (
                    <div style={{fontSize:'13px',color:'var(--text3)',padding:'6px 0'}}>Aucun pointage ce mois pour cet employé</div>
                  )}
                  {empLogs.map(log => (
                    <div key={log.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                      <div style={{width:'44px',fontSize:'12px',fontWeight:'700',color:'var(--text2)'}}>{format(parseISO(log.log_date),'d MMM',{locale:fr})}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:'13px',fontWeight:'600'}}>
                          {fmtTime(log.punched_in)} → {fmtTime(log.punched_out)}
                          {log.pause_start&&log.pause_end&&` · pause ${fmtTime(log.pause_start)}–${fmtTime(log.pause_end)}`}
                        </div>
                        {log.remark && <div style={{fontSize:'11px',color:'var(--text3)',fontStyle:'italic',marginTop:'2px'}}>{log.remark}</div>}
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:'13px',fontWeight:'700',color:log.error_24h?'var(--red)':'var(--green)'}}>{fmtNet(log.net_hours)}</div>
                        {log.is_modified && <span className="badge bo" style={{fontSize:'9px'}}>Modifié</span>}
                      </div>
                      {company?.sectors_enabled && (
                        <button className="btn btn-s btn-sm" style={{fontSize:'11px'}} onClick={()=>openSegments(log)} title="Voir les secteurs">
                          <i className="ti ti-map-pin"/>
                        </button>
                      )}
                      <button className="btn btn-s btn-sm" style={{fontSize:'11px'}} onClick={()=>openEdit(log)}>
                        <i className="ti ti-pencil"/>
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <>
        {/* Navigation jour */}
        <div className="card" style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px'}}>
          <i className="ti ti-chevron-left" style={{fontSize:'20px',cursor:'pointer',color:'var(--text2)'}} onClick={()=>setCursor(c=>subDays(c,1))}/>
          <div style={{fontSize:'14px',fontWeight:'700',textAlign:'center'}}>
            {isToday(cursor) ? "Aujourd'hui" : format(cursor,'EEEE d MMMM',{locale:fr})}
            {!isToday(cursor) && <div style={{fontSize:'11px',color:'var(--text3)',fontWeight:'500'}}>{format(cursor,'d MMM yyyy',{locale:fr})}</div>}
          </div>
          <i className="ti ti-chevron-right" style={{fontSize:'20px',cursor:'pointer',color:'var(--text2)'}} onClick={()=>setCursor(c=>addDays(c,1))}/>
        </div>
        {!isToday(cursor) && (
          <div style={{textAlign:'center'}}>
            <span className="chip c-off" style={{fontSize:'12px'}} onClick={()=>setCursor(new Date())}>Revenir à aujourd'hui</span>
          </div>
        )}

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

        {/* Employés sans aucun pointage ce jour */}
        {missing.length > 0 && (
          <div className="card">
            <div className="card-title" style={{display:'flex',alignItems:'center',gap:'6px'}}>
              <span style={{width:'8px',height:'8px',borderRadius:'50%',background:'var(--text3)',display:'inline-block'}}/>
              Sans pointage ({missing.length})
            </div>
            {missing.map(emp => (
              <div key={emp.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                <div className="av" style={{width:'34px',height:'34px',fontSize:'11px',background:emp.color_bg||'#E6F1FB',color:emp.color_fg||'#185FA5'}}>{mkIni(emp.full_name)}</div>
                <div style={{flex:1,fontSize:'14px',fontWeight:'700'}}>{emp.full_name}</div>
                <button className="btn btn-s btn-sm" onClick={()=>openAddMissing(emp)}>
                  <i className="ti ti-plus"/>Saisir les heures
                </button>
              </div>
            ))}
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
                <div key={log.id} style={{display:'flex',alignItems:'center',gap:'10px',borderBottom:'1px solid var(--border)',background:'#FFFBF0',borderRadius:'var(--rs)',padding:'8px 10px',marginBottom:'4px'}}>
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
          </>
        )}
      </div>

      {/* MODAL DÉTAIL SECTEURS */}
      {segModal && (
        <div className="modal-bg" onClick={()=>setSegModal(null)}>
          <div className="ms" onClick={e=>e.stopPropagation()}>
            <div className="mh"/>
            <div style={{fontSize:'18px',fontWeight:'800',marginBottom:'4px'}}>
              Secteurs — {segModal.log.profiles?.full_name}
            </div>
            <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'16px'}}>
              {format(parseISO(segModal.log.log_date),'EEEE d MMMM yyyy',{locale:fr})}
            </div>

            {segModal.segments.length === 0 && (
              <div style={{fontSize:'13px',color:'var(--text3)',padding:'10px 0'}}>Aucun secteur enregistré pour ce jour.</div>
            )}

            {segModal.segments.map(seg => {
              const dur = seg.ended_at
                ? new Date(seg.ended_at).getTime() - new Date(seg.started_at).getTime()
                : 0
              return (
                <div key={seg.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                  <i className="ti ti-map-pin" style={{fontSize:'16px',color:'var(--blue)',flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'13px',fontWeight:'700'}}>{seg.sector}</div>
                    <div style={{fontSize:'11px',color:'var(--text3)'}}>
                      {format(parseISO(seg.started_at),'HH:mm')} → {seg.ended_at?format(parseISO(seg.ended_at),'HH:mm'):'en cours'}
                    </div>
                  </div>
                  <div style={{fontSize:'12px',fontWeight:'700',color:'var(--text2)'}}>{fmtNet(dur/3600000)}</div>
                </div>
              )
            })}

            {/* Total par secteur — pratique pour la facturation */}
            {segModal.segments.length > 0 && (() => {
              const totals = {}
              segModal.segments.forEach(seg => {
                if (!seg.ended_at) return
                const dur = new Date(seg.ended_at).getTime() - new Date(seg.started_at).getTime()
                totals[seg.sector] = (totals[seg.sector]||0) + dur
              })
              return (
                <div style={{marginTop:'12px',background:'var(--bg)',borderRadius:'var(--rs)',padding:'10px 14px'}}>
                  <div style={{fontSize:'12px',fontWeight:'700',color:'var(--text2)',marginBottom:'6px'}}>Total par secteur</div>
                  {Object.entries(totals).map(([sector,ms]) => (
                    <div key={sector} style={{display:'flex',justifyContent:'space-between',fontSize:'13px',padding:'3px 0'}}>
                      <span>{sector}</span>
                      <strong>{fmtNet(ms/3600000)}</strong>
                    </div>
                  ))}
                </div>
              )
            })()}

            <button className="btn btn-s" style={{marginTop:'16px'}} onClick={()=>setSegModal(null)}>Fermer</button>
          </div>
        </div>
      )}

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
