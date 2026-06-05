import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function AdminExchanges() {
  const { profile, company } = useAuth()
  const [exchanges, setExchanges] = useState([])
  const [toast, setToast] = useState('')

  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''),2800) }
  function mkIni(n=''){ const p=n.trim().split(' '); return((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase() }
  function fmtDate(d){ return format(parseISO(d),'EEE d MMM',{locale:fr}) }

  async function load() {
    if (!company) return
    const { data } = await supabase.from('exchanges')
      .select('*, requester:profiles!exchanges_requester_id_fkey(full_name,color_bg,color_fg), target:profiles!exchanges_target_id_fkey(full_name,color_bg,color_fg)')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
    setExchanges(data||[])
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('admin-exchanges')
      .on('postgres_changes',{event:'*',schema:'public',table:'exchanges'},load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [company])

  async function approve(id) {
    await supabase.from('exchanges').update({ admin_approved: true }).eq('id', id)
    load(); showToast('Échange validé ✅')
  }
  async function reject(id) {
    await supabase.from('exchanges').update({ status:'refused', admin_approved: false }).eq('id', id)
    load(); showToast('Échange refusé')
  }

  const pending  = exchanges.filter(e=>e.status==='accepted'&&!e.admin_approved)
  const approved = exchanges.filter(e=>e.admin_approved)
  const others   = exchanges.filter(e=>e.status!=='accepted'||!e.admin_approved&&e.status==='refused')

  const statusBadge = (ex) => {
    if (ex.admin_approved) return <span className="badge bg">Validé ✓</span>
    if (ex.status==='refused') return <span className="badge br">Refusé</span>
    if (ex.status==='accepted') return <span className="badge bo">À valider</span>
    return <span className="badge bk">En attente</span>
  }

  function ExchangeCard({ ex, showActions }) {
    const req = ex.requester; const tgt = ex.target
    return (
      <div style={{
        border:`1px solid ${ex.admin_approved?'var(--green)':ex.status==='refused'?'var(--red)':ex.status==='accepted'?'var(--orange)':'var(--border)'}`,
        borderRadius:'var(--rs)',padding:'12px',marginBottom:'8px',
        background:ex.admin_approved?'#F0FBF7':ex.status==='accepted'?'#FFFBF0':'transparent',
        opacity:ex.status==='refused'?.6:1
      }}>
        <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'8px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'-4px'}}>
            <div className="av" style={{width:'28px',height:'28px',fontSize:'10px',background:req?.color_bg||'#E6F1FB',color:req?.color_fg||'#185FA5',zIndex:2}}>{mkIni(req?.full_name)}</div>
            <div className="av" style={{width:'28px',height:'28px',fontSize:'10px',background:tgt?.color_bg||'#E6F1FB',color:tgt?.color_fg||'#185FA5',marginLeft:'-8px'}}>{mkIni(tgt?.full_name)}</div>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:'13px',fontWeight:'700'}}>{req?.full_name?.split(' ')[0]} ⇄ {tgt?.full_name?.split(' ')[0]}</div>
            <div style={{fontSize:'11px',color:'var(--text2)'}}>{fmtDate(ex.requester_date)}</div>
          </div>
          {statusBadge(ex)}
        </div>
        {ex.message && <div style={{fontSize:'12px',color:'var(--text2)',fontStyle:'italic',marginBottom:'8px'}}>"{ex.message}"</div>}
        {showActions && (
          <div style={{display:'flex',gap:'8px'}}>
            <button className="btn btn-g btn-sm" style={{flex:1}} onClick={()=>approve(ex.id)}>
              <i className="ti ti-check"/>Valider l'échange
            </button>
            <button className="btn btn-r btn-sm" style={{flex:1}} onClick={()=>reject(ex.id)}>
              <i className="ti ti-x"/>Refuser
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/admin" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <h1>Échanges d'horaires</h1>
        {pending.length>0 && <span className="badge bo">{pending.length} à valider</span>}
      </div>

      <div className="content">
        {pending.length>0 && (
          <>
            <div style={{background:'var(--orange-bg)',border:'1px solid var(--orange)',borderRadius:'var(--rs)',padding:'10px 14px',display:'flex',alignItems:'center',gap:'8px'}}>
              <i className="ti ti-clock" style={{color:'var(--orange)',fontSize:'18px'}}/>
              <span style={{fontSize:'13px',color:'#7A4500',fontWeight:'600'}}>{pending.length} échange{pending.length>1?'s':''} accepté{pending.length>1?'s':''} — en attente de votre validation</span>
            </div>
            <div className="card">
              <div className="card-title" style={{display:'flex',alignItems:'center',gap:'6px'}}>
                <span style={{width:'8px',height:'8px',borderRadius:'50%',background:'var(--orange)',display:'inline-block'}}/>
                À valider ({pending.length})
              </div>
              {pending.map(ex=><ExchangeCard key={ex.id} ex={ex} showActions={true}/>)}
            </div>
          </>
        )}

        {approved.length>0 && (
          <div className="card">
            <div className="card-title" style={{display:'flex',alignItems:'center',gap:'6px'}}>
              <span style={{width:'8px',height:'8px',borderRadius:'50%',background:'var(--green)',display:'inline-block'}}/>
              Validés ({approved.length})
            </div>
            {approved.map(ex=><ExchangeCard key={ex.id} ex={ex} showActions={false}/>)}
          </div>
        )}

        <div className="card">
          <div className="card-title" style={{display:'flex',alignItems:'center',gap:'6px'}}>
            <span style={{width:'8px',height:'8px',borderRadius:'50%',background:'var(--text3)',display:'inline-block'}}/>
            Toutes les demandes ({exchanges.length})
          </div>
          {exchanges.length===0 && <div style={{fontSize:'13px',color:'var(--text3)',padding:'6px 0'}}>Aucun échange demandé pour l'instant</div>}
          {exchanges.map(ex=><ExchangeCard key={ex.id} ex={ex} showActions={ex.status==='accepted'&&!ex.admin_approved}/>)}
        </div>
      </div>

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
