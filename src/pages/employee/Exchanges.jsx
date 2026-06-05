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
  function fmtDate(d){ return format(parseISO(d),'EEE d MMM',{locale:fr}) }

  async function load() {
    if (!profile || !company) return
    // Échanges reçus (je suis la cible)
    const { data: r } = await supabase.from('exchanges')
      .select('*, requester:profiles!exchanges_requester_id_fkey(full_name,color_bg,color_fg), target:profiles!exchanges_target_id_fkey(full_name)')
      .eq('company_id', company.id).eq('target_id', profile.id)
      .order('created_at', { ascending: false })

    // Échanges envoyés (je suis le demandeur)
    const { data: s } = await supabase.from('exchanges')
      .select('*, requester:profiles!exchanges_requester_id_fkey(full_name), target:profiles!exchanges_target_id_fkey(full_name,color_bg,color_fg)')
      .eq('company_id', company.id).eq('requester_id', profile.id)
      .order('created_at', { ascending: false })

    // Mes shifts à venir
    const today = format(new Date(),'yyyy-MM-dd')
    const { data: ms } = await supabase.from('shifts').select('*')
      .eq('user_id', profile.id).gte('shift_date', today).order('shift_date').limit(10)

    // Collègues
    const { data: c } = await supabase.from('profiles').select('*')
      .eq('company_id', company.id).eq('role','employee').neq('id', profile.id)

    setReceived(r||[])
    setSent(s||[])
    setMyShifts(ms||[])
    setColleagues(c||[])
    if (ms?.length) setForm(f=>({...f, myShiftId: ms[0].id}))
    if (c?.length)  setForm(f=>({...f, targetId: c[0].id}))
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('exchanges-'+profile?.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'exchanges'},load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [profile, company])

  async function sendRequest() {
    if (!form.myShiftId || !form.targetId) { showToast('Sélectionnez un shift et un collègue'); return }
    const myShift = myShifts.find(s=>s.id===form.myShiftId)
    if (!myShift) return
    const { error } = await supabase.from('exchanges').insert({
      company_id:     company.id,
      requester_id:   profile.id,
      target_id:      form.targetId,
      requester_date: myShift.shift_date,
      target_date:    myShift.shift_date, // l'admin ajustera si besoin
      message:        form.message||null,
      status:         'pending',
    })
    if (error) { showToast('Erreur : '+error.message); return }
    setShowNew(false)
    setForm(f=>({...f, message:''}))
    load()
    showToast('Demande envoyée ✅')
  }

  async function respond(exchangeId, status) {
    await supabase.from('exchanges').update({ status }).eq('id', exchangeId)
    load()
    showToast(status==='accepted' ? 'Échange accepté ✅ — admin notifié' : 'Échange refusé')
  }

  const pendingCount = received.filter(e=>e.status==='pending').length

  const statusBadge = (status) => {
    if (status==='pending')  return <span className="badge bo">En attente</span>
    if (status==='accepted') return <span className="badge bg">Accepté ✓</span>
    if (status==='refused')  return <span className="badge br">Refusé</span>
    return null
  }

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/emp" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <h1>Échanges d'horaires</h1>
        <button className="btn btn-sm btn-p" onClick={()=>setShowNew(true)}>
          <i className="ti ti-plus"/>Demander
        </button>
      </div>

      <div className="content">
        <div style={{fontSize:'13px',color:'var(--text2)',lineHeight:'1.5'}}>
          Proposez un échange de shift avec un collègue. L'admin doit valider avant que l'échange soit officiel.
        </div>

        {/* Reçues */}
        <div className="card">
          <div className="card-title" style={{display:'flex',alignItems:'center',gap:'6px'}}>
            <span style={{width:'8px',height:'8px',borderRadius:'50%',background:'var(--orange)',display:'inline-block'}}/>
            Demandes reçues ({received.length})
            {pendingCount>0 && <span className="badge bo" style={{marginLeft:'4px'}}>{pendingCount}</span>}
          </div>

          {received.length===0 && <div style={{fontSize:'13px',color:'var(--text3)',padding:'6px 0'}}>Aucune demande reçue</div>}

          {received.map(ex => {
            const req = ex.requester
            return (
              <div key={ex.id} style={{
                border:`1px solid ${ex.status==='pending'?'var(--orange)':ex.status==='accepted'?'var(--green)':'var(--red)'}`,
                borderRadius:'var(--rs)',padding:'12px',marginBottom:'8px',
                background:ex.status==='pending'?'#FFFBF0':ex.status==='accepted'?'#F0FBF7':'#FEF5F5',
                opacity:ex.status==='refused'?.7:1
              }}>
                <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
                  <div className="av" style={{width:'30px',height:'30px',fontSize:'10px',background:req?.color_bg||'#E6F1FB',color:req?.color_fg||'#185FA5'}}>
                    {mkIni(req?.full_name)}
                  </div>
                  <div style={{flex:1,fontSize:'14px',fontWeight:'700'}}>{req?.full_name}</div>
                  {statusBadge(ex.status)}
                </div>
                <div style={{background:'var(--surface)',borderRadius:'var(--rs)',padding:'10px',marginBottom:'8px',fontSize:'12px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
                    <span style={{color:'var(--text2)'}}>Il/elle vous donne</span>
                    <span style={{fontWeight:'700'}}>{fmtDate(ex.requester_date)}</span>
                  </div>
                  <div style={{height:'1px',background:'var(--border)',margin:'6px 0'}}/>
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <span style={{color:'var(--text2)'}}>En échange de votre</span>
                    <span style={{fontWeight:'700'}}>{fmtDate(ex.target_date)}</span>
                  </div>
                </div>
                {ex.message && (
                  <div style={{fontSize:'12px',color:'var(--text2)',fontStyle:'italic',marginBottom:'10px'}}>
                    "{ex.message}"
                  </div>
                )}
                {ex.status==='pending' && (
                  <div style={{display:'flex',gap:'8px'}}>
                    <button className="btn btn-g btn-sm" style={{flex:1}} onClick={()=>respond(ex.id,'accepted')}>
                      <i className="ti ti-check"/>Accepter
                    </button>
                    <button className="btn btn-s btn-sm" style={{flex:1}} onClick={()=>respond(ex.id,'refused')}>
                      <i className="ti ti-x"/>Refuser
                    </button>
                  </div>
                )}
                {ex.status==='accepted' && (
                  <div style={{fontSize:'12px',color:'var(--green)',fontWeight:'600'}}>✓ Échange accepté — en attente de validation admin</div>
                )}
              </div>
            )
          })}
        </div>

        {/* Envoyées */}
        <div className="card">
          <div className="card-title" style={{display:'flex',alignItems:'center',gap:'6px'}}>
            <span style={{width:'8px',height:'8px',borderRadius:'50%',background:'var(--blue)',display:'inline-block'}}/>
            Mes demandes envoyées ({sent.length})
          </div>
          {sent.length===0 && <div style={{fontSize:'13px',color:'var(--text3)',padding:'6px 0'}}>Aucune demande envoyée</div>}
          {sent.map(ex => {
            const tgt = ex.target
            return (
              <div key={ex.id} style={{
                border:`1px solid ${ex.status==='pending'?'var(--border)':ex.status==='accepted'?'var(--green)':'var(--red)'}`,
                borderRadius:'var(--rs)',padding:'12px',marginBottom:'8px',
                background:ex.status==='accepted'?'#F0FBF7':ex.status==='refused'?'#FEF5F5':'transparent',
                opacity:ex.status==='refused'?.7:1
              }}>
                <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'}}>
                  <div className="av" style={{width:'30px',height:'30px',fontSize:'10px',background:tgt?.color_bg||'#E6F1FB',color:tgt?.color_fg||'#185FA5'}}>
                    {mkIni(tgt?.full_name)}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'13px',fontWeight:'700'}}>{tgt?.full_name}</div>
                    <div style={{fontSize:'12px',color:'var(--text2)'}}>
                      {fmtDate(ex.requester_date)}
                    </div>
                  </div>
                  {statusBadge(ex.status)}
                </div>
                {ex.message && <div style={{fontSize:'11px',color:'var(--text2)',fontStyle:'italic'}}>"{ex.message}"</div>}
                {ex.admin_approved && <div style={{fontSize:'11px',color:'var(--green)',fontWeight:'600',marginTop:'4px'}}>✓ Validé par l'admin</div>}
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
            <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'16px'}}>
              Choisissez votre shift à échanger et le collègue
            </div>

            <div className="iw" style={{marginBottom:'10px'}}>
              <div className="il">Mon shift à donner</div>
              {myShifts.length===0
                ? <div style={{fontSize:'13px',color:'var(--text3)'}}>Aucun shift à venir planifié</div>
                : <select className="if" value={form.myShiftId} onChange={e=>setForm(f=>({...f,myShiftId:e.target.value}))} style={{cursor:'pointer'}}>
                    {myShifts.map(s=>(
                      <option key={s.id} value={s.id}>
                        {format(parseISO(s.shift_date),'EEE d MMM',{locale:fr})} · {s.poste} · {s.start_time?.slice(0,5)}
                      </option>
                    ))}
                  </select>
              }
            </div>

            <div className="iw" style={{marginBottom:'10px'}}>
              <div className="il">Avec qui ?</div>
              {colleagues.length===0
                ? <div style={{fontSize:'13px',color:'var(--text3)'}}>Aucun collègue trouvé</div>
                : <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                    {colleagues.map(c=>(
                      <div key={c.id}
                        onClick={()=>setForm(f=>({...f,targetId:c.id}))}
                        style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',borderRadius:'var(--rs)',border:`2px solid ${form.targetId===c.id?'var(--accent)':'var(--border)'}`,cursor:'pointer',transition:'border-color .15s'}}>
                        <div className="av" style={{width:'30px',height:'30px',fontSize:'10px',background:c.color_bg||'#E6F1FB',color:c.color_fg||'#185FA5'}}>{mkIni(c.full_name)}</div>
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

            <div className="iw" style={{marginBottom:'16px'}}>
              <div className="il">Message (optionnel)</div>
              <textarea className="if" rows="2" placeholder="Ex: j'ai un RDV ce jour-là…"
                value={form.message} onChange={e=>setForm(f=>({...f,message:e.target.value}))}/>
            </div>

            <button className="btn btn-p" onClick={sendRequest}
              disabled={myShifts.length===0||colleagues.length===0}>
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
          {pendingCount>0 && <span className="nav-badge">{pendingCount}</span>}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
