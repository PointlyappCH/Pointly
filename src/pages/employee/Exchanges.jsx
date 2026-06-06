import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function EmpExchanges() {
  const { profile, company } = useAuth()
  const [received, setReceived] = useState([])
  const [sent, setSent]         = useState([])
  const [myShifts, setMyShifts] = useState([])
  const [colleagues, setColleagues] = useState([])
  const [showNew, setShowNew]   = useState(false)
  const [toast, setToast]       = useState('')
  const [form, setForm] = useState({ myShiftId:'', targetId:'', message:'' })

  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''),2800) }
  function mkIni(n=''){ const p=n.trim().split(' '); return((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase() }
  function fmtDate(d){ try{ return format(parseISO(d),'EEE d MMM',{locale:fr}) }catch(e){ return d } }

  async function load() {
    if (!profile || !company) return
    const today = format(new Date(),'yyyy-MM-dd')
    const [{ data:r },{ data:s },{ data:ms },{ data:c }] = await Promise.all([
      supabase.from('exchanges')
        .select('*, requester:profiles!exchanges_requester_id_fkey(full_name,color_bg,color_fg)')
        .eq('company_id', company.id).eq('target_id', profile.id)
        .order('created_at', { ascending: false }),
      supabase.from('exchanges')
        .select('*, target:profiles!exchanges_target_id_fkey(full_name,color_bg,color_fg)')
        .eq('company_id', company.id).eq('requester_id', profile.id)
        .order('created_at', { ascending: false }),
      supabase.from('shifts').select('*')
        .eq('user_id', profile.id).gte('shift_date', today).order('shift_date').limit(14),
      supabase.from('profiles').select('*')
        .eq('company_id', company.id).eq('role','employee').neq('id', profile.id),
    ])
    setReceived(r||[]); setSent(s||[])
    setMyShifts(ms||[]); setColleagues(c||[])
    if (ms?.length) setForm(f=>({...f, myShiftId: ms[0].id}))
    if (c?.length)  setForm(f=>({...f, targetId:  c[0].id}))
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('emp-exchanges-'+profile?.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'exchanges'},load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [profile, company])

  async function sendRequest() {
    if (!form.myShiftId || !form.targetId) { showToast('Sélectionnez un shift et un collègue'); return }
    const myShift = myShifts.find(s=>s.id===form.myShiftId)
    if (!myShift) return
    const { error } = await supabase.from('exchanges').insert({
      company_id:     company.id, requester_id: profile.id,
      target_id:      form.targetId,
      requester_date: myShift.shift_date,
      target_date:    myShift.shift_date,
      message:        form.message||null, status:'pending',
    })
    if (error){ showToast('Erreur : '+error.message); return }
    setShowNew(false); setForm(f=>({...f, message:''}))
    load(); showToast('Demande envoyée ✅')
  }

  async function respond(id, status) {
    await supabase.from('exchanges').update({ status }).eq('id', id)
    load(); showToast(status==='accepted'?'Échange accepté ✅':'Échange refusé')
  }

  const pendingCount = received.filter(e=>e.status==='pending').length

  function StatusBadge({ status }) {
    if (status==='pending')  return <span className="badge bo">En attente</span>
    if (status==='accepted') return <span className="badge bg">Accepté ✓</span>
    if (status==='refused')  return <span className="badge br">Refusé</span>
    return null
  }

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/emp" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <h1>Échanges</h1>
        <button className="btn btn-sm btn-p" onClick={()=>setShowNew(true)}>
          <i className="ti ti-plus"/>Demander
        </button>
      </div>

      <div className="content">
        {pendingCount > 0 && (
          <div style={{background:'var(--orange-bg)',border:'1.5px solid var(--orange)',borderRadius:'var(--rs)',padding:'12px 14px',display:'flex',gap:'10px',alignItems:'center'}}>
            <i className="ti ti-bell-ringing" style={{fontSize:'20px',color:'var(--orange)',flexShrink:0}}/>
            <div style={{flex:1,fontSize:'13px',color:'#7A4500',fontWeight:'700'}}>
              {pendingCount} demande{pendingCount>1?'s':''} d'échange en attente de votre réponse
            </div>
          </div>
        )}

        {/* Reçues */}
        <div className="card">
          <div className="card-title">Demandes reçues ({received.length})</div>
          {received.length===0 && <div style={{fontSize:'13px',color:'var(--text3)',padding:'6px 0'}}>Aucune demande reçue</div>}
          {received.map(ex=>{
            const req = ex.requester
            return (
              <div key={ex.id} style={{border:`1px solid ${ex.status==='pending'?'var(--orange)':ex.status==='accepted'?'var(--green)':'var(--border)'}`,borderRadius:'var(--rs)',padding:'12px',marginBottom:'8px',background:ex.status==='pending'?'#FFFBF0':ex.status==='accepted'?'#F0FBF7':'transparent',opacity:ex.status==='refused'?.6:1}}>
                <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
                  <div className="av" style={{width:'32px',height:'32px',fontSize:'11px',fontWeight:'700',background:req?.color_bg||'#E6F1FB',color:req?.color_fg||'#185FA5'}}>{mkIni(req?.full_name)}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'14px',fontWeight:'700'}}>{req?.full_name}</div>
                    <div style={{fontSize:'12px',color:'var(--text2)'}}>{fmtDate(ex.requester_date)}</div>
                  </div>
                  <StatusBadge status={ex.status}/>
                </div>
                {ex.message && <div style={{fontSize:'12px',color:'var(--text2)',fontStyle:'italic',marginBottom:'10px'}}>"{ex.message}"</div>}
                {ex.status==='pending' && (
                  <div style={{display:'flex',gap:'8px'}}>
                    <button className="btn btn-g btn-sm" style={{flex:1}} onClick={()=>respond(ex.id,'accepted')}><i className="ti ti-check"/>Accepter</button>
                    <button className="btn btn-s btn-sm" style={{flex:1}} onClick={()=>respond(ex.id,'refused')}><i className="ti ti-x"/>Refuser</button>
                  </div>
                )}
                {ex.status==='accepted' && !ex.admin_approved && (
                  <div style={{fontSize:'12px',color:'var(--orange)',fontWeight:'600'}}>⏳ En attente de validation admin</div>
                )}
                {ex.admin_approved && (
                  <div style={{fontSize:'12px',color:'var(--green)',fontWeight:'600'}}>✓ Validé par l'admin</div>
                )}
              </div>
            )
          })}
        </div>

        {/* Envoyées */}
        <div className="card">
          <div className="card-title">Mes demandes envoyées ({sent.length})</div>
          {sent.length===0 && <div style={{fontSize:'13px',color:'var(--text3)',padding:'6px 0'}}>Aucune demande envoyée</div>}
          {sent.map(ex=>{
            const tgt = ex.target
            return (
              <div key={ex.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                <div className="av" style={{width:'32px',height:'32px',fontSize:'11px',fontWeight:'700',background:tgt?.color_bg||'#E6F1FB',color:tgt?.color_fg||'#185FA5'}}>{mkIni(tgt?.full_name)}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:'13px',fontWeight:'700'}}>{tgt?.full_name}</div>
                  <div style={{fontSize:'12px',color:'var(--text2)'}}>{fmtDate(ex.requester_date)}</div>
                  {ex.message && <div style={{fontSize:'11px',color:'var(--text3)',fontStyle:'italic'}}>"{ex.message}"</div>}
                </div>
                <div style={{textAlign:'right'}}>
                  <StatusBadge status={ex.status}/>
                  {ex.admin_approved && <div style={{fontSize:'10px',color:'var(--green)',fontWeight:'600',marginTop:'2px'}}>Admin ✓</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* MODAL NOUVELLE DEMANDE */}
      {showNew && (
        <div className="modal-bg" onClick={()=>setShowNew(false)}>
          <div className="ms" onClick={e=>e.stopPropagation()}>
            <div className="mh"/>
            <div style={{fontSize:'18px',fontWeight:'800',marginBottom:'4px'}}>Demander un échange</div>
            <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'16px'}}>Choisissez votre shift à donner et le collègue</div>
            <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
              <div className="iw">
                <div className="il">Mon shift à donner</div>
                {myShifts.length===0
                  ? <div style={{fontSize:'13px',color:'var(--text3)',padding:'8px',background:'var(--bg)',borderRadius:'var(--rs)'}}>Aucun shift à venir planifié</div>
                  : <select className="if" value={form.myShiftId} onChange={e=>setForm(f=>({...f,myShiftId:e.target.value}))} style={{cursor:'pointer'}}>
                      {myShifts.map(s=><option key={s.id} value={s.id}>{format(parseISO(s.shift_date),'EEE d MMM',{locale:fr})} · {s.poste} · {s.start_time?.slice(0,5)}</option>)}
                    </select>
                }
              </div>
              <div className="iw">
                <div className="il">Avec quel collègue ?</div>
                {colleagues.length===0
                  ? <div style={{fontSize:'13px',color:'var(--text3)'}}>Aucun collègue trouvé</div>
                  : <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                      {colleagues.map(c=>(
                        <div key={c.id} onClick={()=>setForm(f=>({...f,targetId:c.id}))}
                          style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',borderRadius:'var(--rs)',border:`2px solid ${form.targetId===c.id?'var(--accent)':'var(--border)'}`,cursor:'pointer',transition:'border-color .15s'}}>
                          <div className="av" style={{width:'32px',height:'32px',fontSize:'11px',fontWeight:'700',background:c.color_bg||'#E6F1FB',color:c.color_fg||'#185FA5'}}>{mkIni(c.full_name)}</div>
                          <div style={{flex:1}}>
                            <div style={{fontSize:'13px',fontWeight:'700'}}>{c.full_name}</div>
                            <div style={{fontSize:'11px',color:'var(--text2)'}}>{c.poste}</div>
                          </div>
                          {form.targetId===c.id && <i className="ti ti-check" style={{color:'var(--accent)',fontSize:'18px'}}/>}
                        </div>
                      ))}
                    </div>
                }
              </div>
              <div className="iw">
                <div className="il">Message (optionnel)</div>
                <textarea className="if" rows="2" placeholder="Ex: j'ai un RDV ce jour-là…" value={form.message} onChange={e=>setForm(f=>({...f,message:e.target.value}))}/>
              </div>
            </div>
            <button className="btn btn-p" style={{marginTop:'16px'}} onClick={sendRequest} disabled={myShifts.length===0||colleagues.length===0}>
              <i className="ti ti-send"/>Envoyer la demande
            </button>
            <button className="btn btn-s" style={{marginTop:'8px'}} onClick={()=>setShowNew(false)}>Annuler</button>
          </div>
        </div>
      )}

      <div className="nav">
        <Link to="/emp" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-layout-dashboard"/>Accueil</div></Link>
        <Link to="/emp/planning" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-calendar"/>Planning</div></Link>
        <Link to="/emp/dispo" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-adjustments"/>Dispos</div></Link>
        <Link to="/emp/chat" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-message-2"/>Chat</div></Link>
        <div className="nav-item active" style={{position:'relative'}}>
          <i className="ti ti-arrows-exchange"/>Échanges
          {received.filter(e=>e.status==='pending').length>0 && (
            <span className="nav-badge">{received.filter(e=>e.status==='pending').length}</span>
          )}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
