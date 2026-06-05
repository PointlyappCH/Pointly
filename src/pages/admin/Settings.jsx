import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

export default function AdminSettings() {
  const { profile, company } = useAuth()
  const [toast, setToast]   = useState('')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '', sector: 'Restauration', pause_mode: 'managed', brand_color: '#1A1A2E'
  })
  const [postes, setPostes] = useState([])
  const [newPoste, setNewPoste] = useState('')

  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''),2800) }
  function set(k){ return e => setForm(f=>({...f,[k]:e.target.value})) }

  useEffect(() => {
    if (company) {
      setForm({
        name:        company.name       || '',
        sector:      company.sector     || 'Restauration',
        pause_mode:  company.pause_mode || 'managed',
        brand_color: company.brand_color|| '#1A1A2E',
      })
    }
    loadPostes()
  }, [company])

  async function loadPostes() {
    if (!company) return
    const { data } = await supabase.from('postes')
      .select('*').eq('company_id', company.id).order('name')
    setPostes(data || [])
  }

  async function saveCompany() {
    if (!company) return
    setLoading(true)
    const { error } = await supabase.from('companies')
      .update({ name: form.name, sector: form.sector, pause_mode: form.pause_mode, brand_color: form.brand_color })
      .eq('id', company.id)
    setLoading(false)
    if (error) { showToast('Erreur : '+error.message); return }
    // Appliquer la couleur
    document.documentElement.style.setProperty('--accent', form.brand_color)
    showToast('Réglages sauvegardés ✅')
  }

  async function addPoste() {
    if (!newPoste.trim() || !company) return
    await supabase.from('postes').insert({ company_id: company.id, name: newPoste.trim() })
    setNewPoste('')
    loadPostes()
    showToast('Poste ajouté ✅')
  }

  async function deletePoste(id) {
    await supabase.from('postes').delete().eq('id', id)
    loadPostes()
  }

  const sectors = ['Restauration','Commerce','Loisirs','Hôtellerie','Santé','Autre PME']
  const colors  = ['#1A1A2E','#185FA5','#0F6E56','#993556','#534AB7','#854F0B','#1D9E75','#E24B4A']

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/admin" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <h1>Réglages</h1>
        <button className="btn btn-sm btn-p" onClick={saveCompany} disabled={loading}>
          {loading ? '…' : 'Sauver'}
        </button>
      </div>

      <div className="content">

        {/* Infos entreprise */}
        <div className="card">
          <div className="card-title">Entreprise</div>
          <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
            <div className="iw"><div className="il">Nom de l'entreprise</div>
              <input className="if" value={form.name} onChange={set('name')} placeholder="Café du Lac"/>
            </div>
            <div className="iw"><div className="il">Secteur</div>
              <select className="if" value={form.sector} onChange={set('sector')} style={{cursor:'pointer'}}>
                {sectors.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Couleur de marque */}
        <div className="card">
          <div className="card-title">Couleur de marque</div>
          <div style={{display:'flex',gap:'10px',flexWrap:'wrap',marginBottom:'10px'}}>
            {colors.map(c=>(
              <div key={c} onClick={()=>setForm(f=>({...f,brand_color:c}))}
                style={{width:'34px',height:'34px',borderRadius:'50%',background:c,cursor:'pointer',
                  border:`3px solid ${form.brand_color===c?'white':'transparent'}`,
                  boxShadow:form.brand_color===c?`0 0 0 2px ${c}`:'none',transition:'all .15s'}}>
              </div>
            ))}
          </div>
          <div className="iw"><div className="il">Ou entrez une couleur hex</div>
            <input className="if" value={form.brand_color} onChange={set('brand_color')} placeholder="#1A1A2E"/>
          </div>
          <div style={{marginTop:'10px',padding:'12px',borderRadius:'var(--rs)',background:form.brand_color,color:'#fff',fontSize:'13px',fontWeight:'700',textAlign:'center'}}>
            Aperçu — {form.name||'Mon Entreprise'}
          </div>
        </div>

        {/* Pause repas */}
        <div className="card">
          <div className="card-title">Pause repas</div>
          {[
            {k:'managed',title:'Gérée par l\'employé',sub:'Bouton pause visible sur l\'app'},
            {k:'fixed',  title:'Durée fixe automatique',sub:'30 min déduits automatiquement'},
          ].map(o=>(
            <div key={o.k} onClick={()=>setForm(f=>({...f,pause_mode:o.k}))}
              style={{border:`2px solid ${form.pause_mode===o.k?'var(--accent)':'var(--border)'}`,borderRadius:'var(--rs)',padding:'12px',cursor:'pointer',marginBottom:'8px',transition:'border-color .15s'}}>
              <div style={{fontSize:'14px',fontWeight:'700'}}>{o.title}</div>
              <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>{o.sub}</div>
            </div>
          ))}
        </div>

        {/* Postes de travail */}
        <div className="card">
          <div className="card-title">Postes de travail</div>
          <div style={{display:'flex',gap:'8px',marginBottom:'12px'}}>
            <input className="if" style={{flex:1}} placeholder="Ex: 🍳 Cuisinier" value={newPoste} onChange={e=>setNewPoste(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addPoste()}/>
            <button className="btn btn-p btn-sm" onClick={addPoste}><i className="ti ti-plus"/>Ajouter</button>
          </div>
          {postes.length===0 && <div style={{fontSize:'13px',color:'var(--text3)'}}>Aucun poste — ajoutez les postes de votre équipe</div>}
          {postes.map(p=>(
            <div key={p.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
              <span style={{flex:1,fontSize:'14px',fontWeight:'500'}}>{p.name}</span>
              <button style={{background:'none',border:'none',cursor:'pointer',color:'var(--red)',fontSize:'18px'}} onClick={()=>deletePoste(p.id)}>
                <i className="ti ti-trash"/>
              </button>
            </div>
          ))}
        </div>

        <button className="btn btn-p" onClick={saveCompany} disabled={loading}>
          <i className="ti ti-check"/>{loading?'Sauvegarde…':'Sauvegarder les réglages'}
        </button>
      </div>

      <div className="nav">
        <Link to="/admin" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-layout-dashboard"/>Accueil</div></Link>
        <Link to="/admin/planning" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-calendar"/>Planning</div></Link>
        <Link to="/admin/team" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-users"/>Équipe</div></Link>
        <Link to="/admin/chat" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-message-2"/>Chat</div></Link>
        <div className="nav-item active"><i className="ti ti-settings"/>Réglages</div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
