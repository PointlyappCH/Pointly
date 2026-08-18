import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

export default function AdminTeam() {
  const { company, addEmployee, updateEmployee } = useAuth()
  const [emps, setEmps]       = useState([])
  const [postes, setPostes]   = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [editEmp, setEditEmp] = useState(null)
  const [resetEmp, setResetEmp] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [newPwd, setNewPwd]   = useState('')
  const [inviteEmp, setInviteEmp] = useState(null)
  const [toast, setToast]     = useState('')
  const [err, setErr]         = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab]         = useState('team')
  const [newPoste, setNewPoste] = useState('')

  const appUrl = window.location.origin
  const emptyForm = { name:'', email:'', pwd:'', poste:'', contract:'fixe', hDue:169, vacDroit:20, vacPris:0, cycle:'1-1', role:'employee' }
  const [form, setForm] = useState(emptyForm)

  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''),2800) }
  function set(k){ return e => setForm(f=>({...f,[k]:e.target.value})) }
  function mkIni(n=''){ const p=n.trim().split(' '); return((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase() }
  function cycleLbl(c){ return({'1-1':'1er→1er','25-25':'25→25','15-15':'15→15','20-20':'20→20','10-10':'10→10'}[c]||'1er→1er') }

  async function loadAll() {
    if (!company) return
    const [{ data:e },{ data:p }] = await Promise.all([
      supabase.from('profiles').select('*').eq('company_id', company.id).eq('role','employee').order('full_name'),
      supabase.from('postes').select('*').eq('company_id', company.id).order('name'),
    ])
    setEmps(e||[]); setPostes(p||[])
  }

  useEffect(() => { loadAll() }, [company])

  async function handleAdd(e) {
    e.preventDefault(); setErr(''); setLoading(true)
    try {
      await addEmployee({ fullName:form.name, email:form.email, password:form.pwd,
        poste:form.poste||postes[0]?.name||'Employé', contract:form.contract,
        hDue:Number(form.hDue), vacDroit:Number(form.vacDroit), cycle:form.cycle, role:form.role||'employee' })
      // Ouvrir le modal d'invitation
      setInviteEmp({ name:form.name, email:form.email, pwd:form.pwd })
      setShowAdd(false); setForm(emptyForm); loadAll()
    } catch(e){ setErr(e.message) }
    finally{ setLoading(false) }
  }

  async function handleEdit(e) {
    e.preventDefault(); setErr(''); setLoading(true)
    try {
      await updateEmployee(editEmp.id, {
        full_name: form.name, poste: form.poste,
        contract: form.contract, h_due: Number(form.hDue),
        vac_droit: Number(form.vacDroit), vac_pris: Number(form.vacPris), cycle: form.cycle,
      })
      showToast('Mis à jour ✅'); setEditEmp(null); loadAll()
    } catch(e){ setErr(e.message) }
    finally{ setLoading(false) }
  }

  async function resetPassword() {
    if (!newPwd || newPwd.length < 6) { showToast('Minimum 6 caractères'); return }
    if (!resetEmp) return
    setLoading(true)
    const { data, error } = await supabase.functions.invoke('reset-employee-password', {
      body: { targetUserId: resetEmp.id, newPassword: newPwd },
    })
    if (error || data?.error) {
      showToast('Erreur : ' + (data?.error || error.message))
      setLoading(false)
      return
    }
    setInviteEmp({ name:resetEmp.full_name, email:resetEmp.email, pwd:newPwd })
    setResetEmp(null); setNewPwd('')
    showToast('Mot de passe réinitialisé ✅')
    setLoading(false)
  }

  function openEdit(e) {
    setEditEmp(e)
    setForm({ name:e.full_name, email:e.email, pwd:'', poste:e.poste||'', contract:e.contract||'fixe',
      hDue:e.h_due||169, vacDroit:e.vac_droit||20, vacPris:e.vac_pris||0, cycle:e.cycle||'1-1' })
    setErr('')
  }

  async function deleteEmployee() {
    if (!confirmDelete) return
    setLoading(true)
    const uid = confirmDelete.id
    try {
      // Supprimer toutes les données liées
      await Promise.all([
        supabase.from('shifts').delete().eq('user_id', uid),
        supabase.from('time_logs').delete().eq('user_id', uid),
        supabase.from('dispos').delete().eq('user_id', uid),
        supabase.from('shift_tasks').delete().eq('user_id', uid),
        supabase.from('exchanges').delete().eq('requester_id', uid),
        supabase.from('exchanges').delete().eq('target_id', uid),
        supabase.from('chat_messages').delete().eq('user_id', uid),
      ])
      // Supprimer le profil
      await supabase.from('profiles').delete().eq('id', uid)
      setConfirmDelete(null)
      loadAll()
      showToast(confirmDelete.full_name+' supprimé ✅')
    } catch(e) {
      showToast('Erreur : '+e.message)
    }
    setLoading(false)
  }

  async function addPoste() {
    if (!newPoste.trim() || !company) return
    await supabase.from('postes').insert({ company_id: company.id, name: newPoste.trim() })
    setNewPoste(''); loadAll(); showToast('Poste ajouté ✅')
  }

  async function deletePoste(id) {
    await supabase.from('postes').delete().eq('id', id)
    loadAll()
  }

  async function assignPoste(empId, posteName) {
    await supabase.from('profiles').update({ poste: posteName }).eq('id', empId)
    loadAll(); showToast('Poste assigné ✅')
  }

  function buildInviteLink(email, pwd) {
    return `${appUrl}/login?email=${encodeURIComponent(email)}&hint=${encodeURIComponent(pwd)}`
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(()=>showToast('Copié ! 📋'))
  }

  function copyCredentials(emp) {
    copyToClipboard(`Bonjour ${emp.name} 👋\n\nVoici ton accès à Pointly :\n🔗 App : ${appUrl}\n📧 Email : ${emp.email}\n🔑 Mot de passe : ${emp.pwd}\n\nConnecte-toi et commence à pointer !`)
  }

  // Inline form fields — pas de sous-composant pour éviter le re-render à chaque frappe
  function renderFormFields(isEdit) {
    return (
      <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
        <div className="iw">
          <div className="il">Nom complet</div>
          <input className="if" value={form.name} onChange={set('name')} required placeholder="Marc Lacroix"/>
        </div>
        {!isEdit && <>
          <div className="iw">
            <div className="il">Email</div>
            <input className="if" type="email" value={form.email} onChange={set('email')} required placeholder="marc@email.com"/>
          </div>
          <div className="iw">
            <div className="il">Mot de passe provisoire</div>
            <input className="if" type="text" value={form.pwd} onChange={set('pwd')} required placeholder="Ex: Pointly2025"/>
          </div>
          <div className="iw">
            <div className="il">Rôle</div>
            <select className="if" value={form.role||'employee'} onChange={set('role')} style={{cursor:'pointer'}}>
              <option value="employee">Employé</option>
              <option value="moderator">Modérateur — accès planning + équipe, sans export heures</option>
            </select>
          </div>
        </>}
        <div className="iw">
          <div className="il">Poste</div>
          <select className="if" value={form.poste} onChange={set('poste')} style={{cursor:'pointer'}}>
            {postes.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
            {postes.length===0 && <option>— Créez d'abord des postes</option>}
          </select>
        </div>
        <div className="iw">
          <div className="il">Type de contrat</div>
          <select className="if" value={form.contract} onChange={set('contract')} style={{cursor:'pointer'}}>
            <option value="fixe">Employé fixe</option>
            <option value="heure">À l'heure</option>
          </select>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
          <div className="iw">
            <div className="il">Heures / mois</div>
            <input className="if" type="number" value={form.hDue} onChange={set('hDue')} min="1" max="300"/>
          </div>
          <div className="iw">
            <div className="il">Vacances / an</div>
            <input className="if" type="number" value={form.vacDroit} onChange={set('vacDroit')} min="0" max="60"/>
          </div>
        </div>
        {isEdit && (
          <div className="iw">
            <div className="il">Vacances pris</div>
            <input className="if" type="number" value={form.vacPris} onChange={set('vacPris')} min="0" max="60"/>
          </div>
        )}
        <div className="iw">
          <div className="il">Cycle de calcul</div>
          <select className="if" value={form.cycle} onChange={set('cycle')} style={{cursor:'pointer'}}>
            <option value="1-1">Du 1er au 1er</option>
            <option value="25-25">Du 25 au 25</option>
            <option value="15-15">Du 15 au 15</option>
            <option value="20-20">Du 20 au 20</option>
            <option value="10-10">Du 10 au 10</option>
          </select>
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/admin" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <h1>Équipe & Postes</h1>
        {tab==='team' && <button className="btn btn-sm btn-p" onClick={()=>{setShowAdd(true);setEditEmp(null);setErr('');setForm(emptyForm)}}><i className="ti ti-plus"/>Ajouter</button>}
        {tab==='postes' && <button className="btn btn-sm btn-p" onClick={()=>document.getElementById('new-poste-input').focus()}><i className="ti ti-plus"/>Nouveau</button>}
      </div>

      <div style={{background:'var(--surface)',borderBottom:'1px solid var(--border)',display:'flex'}}>
        <div className={`tab ${tab==='team'?'active':''}`} onClick={()=>setTab('team')}><i className="ti ti-users"/>Équipe ({emps.length})</div>
        <div className={`tab ${tab==='postes'?'active':''}`} onClick={()=>setTab('postes')}><i className="ti ti-briefcase"/>Postes ({postes.length})</div>
      </div>

      <div className="content">
        {/* ── TAB ÉQUIPE ── */}
        {tab==='team' && <>
          {emps.length===0 && (
            <div style={{background:'var(--blue-bg)',borderRadius:'var(--rs)',padding:'12px 14px',fontSize:'13px',color:'var(--blue)'}}>
              💡 Ajoutez vos employés. Après création, vous pouvez leur envoyer un lien d'invitation.
            </div>
          )}
          {emps.map(e=>(
            <div key={e.id} className="card" style={{padding:'14px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'10px'}}>
                <div className="av" style={{width:'42px',height:'42px',fontSize:'13px',fontWeight:'700',background:e.color_bg||'#E6F1FB',color:e.color_fg||'#185FA5'}}>
                  {mkIni(e.full_name)}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:'15px',fontWeight:'700'}}>{e.full_name}</div>
                  <div style={{fontSize:'12px',color:'var(--text2)'}}>{e.email}</div>
                </div>
                <button className="btn btn-s btn-sm" onClick={()=>openEdit(e)}><i className="ti ti-pencil"/></button>
              </div>

              <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'10px'}}>
                <span className="badge bk">{e.poste||'—'}</span>
                <span className="badge bb">{e.h_due||169}h/mois</span>
                <span className="badge" style={{background:'var(--orange-bg)',color:'#7A4500'}}>{(e.vac_droit||20)-(e.vac_pris||0)} j vac.</span>
                <span className="badge" style={{background:'#F0F0F8',color:'#555'}}>{cycleLbl(e.cycle)}</span>
              </div>

              {/* Assigner poste rapide */}
              {postes.length > 0 && (
                <div style={{marginBottom:'10px'}}>
                  <div style={{fontSize:'11px',fontWeight:'600',color:'var(--text2)',marginBottom:'5px'}}>Poste :</div>
                  <div style={{display:'flex',gap:'5px',flexWrap:'wrap'}}>
                    {postes.map(p=>(
                      <div key={p.id} onClick={()=>assignPoste(e.id,p.name)}
                        style={{padding:'3px 10px',borderRadius:'20px',fontSize:'11px',fontWeight:'600',cursor:'pointer',
                          border:`1.5px solid ${e.poste===p.name?'var(--accent)':'var(--border)'}`,
                          background:e.poste===p.name?'var(--blue-bg)':'transparent',
                          color:e.poste===p.name?'var(--accent)':'var(--text2)',transition:'all .15s'}}>
                        {p.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions invitation + reset + supprimer */}
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                <button className="btn btn-sm btn-p" style={{flex:1,fontSize:'12px'}}
                  onClick={()=>copyCredentials({name:e.full_name.split(' ')[0],email:e.email,pwd:'voir mot de passe'})}>
                  <i className="ti ti-share"/>Inviter
                </button>
                <button className="btn btn-sm btn-s" style={{flex:1,fontSize:'12px'}}
                  onClick={()=>{setResetEmp(e);setNewPwd('')}}>
                  <i className="ti ti-key"/>Réinitialiser
                </button>
                <button className="btn btn-sm btn-s" style={{fontSize:'12px'}}
                  onClick={()=>{navigator.clipboard.writeText(`${appUrl}/login`);showToast('Lien copié ! 📋')}}>
                  <i className="ti ti-link"/>Lien
                </button>
                <button className="btn btn-sm btn-s" style={{fontSize:'12px',color:'var(--red)',borderColor:'var(--red-bg)'}}
                  onClick={()=>setConfirmDelete(e)}>
                  <i className="ti ti-trash"/>
                </button>
              </div>
            </div>
          ))}
        </>}

        {/* ── TAB POSTES ── */}
        {tab==='postes' && <>
          <div className="card">
            <div style={{display:'flex',gap:'8px',marginBottom:'14px'}}>
              <input id="new-poste-input" className="if" style={{flex:1}} placeholder="Ex: 🍳 Cuisinier…"
                value={newPoste} onChange={e=>setNewPoste(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addPoste()}/>
              <button className="btn btn-p btn-sm" onClick={addPoste}><i className="ti ti-plus"/>Ajouter</button>
            </div>
            {postes.length===0 && <div style={{fontSize:'13px',color:'var(--text3)'}}>Aucun poste créé.</div>}
            {postes.map(p=>(
              <div key={p.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                <div style={{flex:1,fontSize:'14px',fontWeight:'600'}}>{p.name}</div>
                <span className="badge bb" style={{fontSize:'11px'}}>{emps.filter(e=>e.poste===p.name).length} emp.</span>
                <button style={{background:'none',border:'none',cursor:'pointer',color:'var(--red)',fontSize:'20px',padding:'4px'}} onClick={()=>deletePoste(p.id)}>
                  <i className="ti ti-trash"/>
                </button>
              </div>
            ))}
          </div>
          {postes.length > 0 && (
            <div className="card">
              <div className="card-title">Par poste</div>
              {postes.map(p=>{
                const assigned = emps.filter(e=>e.poste===p.name)
                return (
                  <div key={p.id} style={{marginBottom:'12px'}}>
                    <div style={{fontSize:'13px',fontWeight:'700',marginBottom:'6px'}}>{p.name}</div>
                    {assigned.length===0
                      ? <div style={{fontSize:'12px',color:'var(--text3)'}}>Personne assigné</div>
                      : <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                          {assigned.map(e=>(
                            <div key={e.id} style={{display:'flex',alignItems:'center',gap:'6px',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'20px',padding:'4px 10px'}}>
                              <div className="av" style={{width:'22px',height:'22px',fontSize:'8px',fontWeight:'700',background:e.color_bg||'#E6F1FB',color:e.color_fg||'#185FA5'}}>{mkIni(e.full_name)}</div>
                              <span style={{fontSize:'12px',fontWeight:'600'}}>{e.full_name.split(' ')[0]}</span>
                            </div>
                          ))}
                        </div>
                    }
                  </div>
                )
              })}
            </div>
          )}
        </>}
      </div>

      {/* ── MODAL AJOUT ── */}
      {showAdd && (
        <div className="modal-bg" onClick={()=>setShowAdd(false)}>
          <div className="ms" onClick={e=>e.stopPropagation()}>
            <div className="mh"/>
            <div style={{fontSize:'18px',fontWeight:'800',marginBottom:'4px'}}>Ajouter un employé</div>
            <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'16px'}}>Un lien d'invitation sera généré après création</div>
            {err && <div className="err-bar" style={{marginBottom:'12px'}}>{err}</div>}
            <form onSubmit={handleAdd}>
              {renderFormFields(false)}
              <button className="btn btn-p" type="submit" style={{marginTop:'16px'}} disabled={loading}>
                {loading?'Ajout…':<><i className="ti ti-user-plus"/>Ajouter et générer invitation</>}
              </button>
              <button className="btn btn-s" type="button" style={{marginTop:'8px'}} onClick={()=>setShowAdd(false)}>Annuler</button>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL EDIT ── */}
      {editEmp && (
        <div className="modal-bg" onClick={()=>setEditEmp(null)}>
          <div className="ms" onClick={e=>e.stopPropagation()}>
            <div className="mh"/>
            <div style={{fontSize:'18px',fontWeight:'800',marginBottom:'4px'}}>Modifier {editEmp.full_name}</div>
            {err && <div className="err-bar" style={{marginBottom:'12px'}}>{err}</div>}
            <form onSubmit={handleEdit}>
              {renderFormFields(true)}
              <button className="btn btn-p" type="submit" style={{marginTop:'16px'}} disabled={loading}>
                {loading?'…':<><i className="ti ti-check"/>Enregistrer</>}
              </button>
              <button className="btn btn-s" type="button" style={{marginTop:'8px'}} onClick={()=>setEditEmp(null)}>Annuler</button>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL INVITATION ── */}
      {inviteEmp && (
        <div className="modal-bg" onClick={()=>setInviteEmp(null)}>
          <div className="ms" onClick={e=>e.stopPropagation()}>
            <div className="mh"/>
            <div style={{fontSize:'18px',fontWeight:'800',marginBottom:'4px'}}>🎉 {inviteEmp.name} ajouté(e) !</div>
            <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'16px'}}>Envoyez ces accès par WhatsApp, SMS ou email</div>

            {/* Card identifiants */}
            <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--rs)',padding:'14px',marginBottom:'14px'}}>
              <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:'12px',color:'var(--text2)',fontWeight:'600'}}>🔗 Lien app</span>
                  <span style={{fontSize:'12px',fontWeight:'700',color:'var(--blue)'}}>{appUrl}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:'12px',color:'var(--text2)',fontWeight:'600'}}>📧 Email</span>
                  <span style={{fontSize:'12px',fontWeight:'700'}}>{inviteEmp.email}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:'12px',color:'var(--text2)',fontWeight:'600'}}>🔑 Mot de passe</span>
                  <span style={{fontSize:'13px',fontWeight:'800',background:'var(--blue-bg)',color:'var(--blue)',padding:'2px 10px',borderRadius:'8px'}}>{inviteEmp.pwd}</span>
                </div>
              </div>
            </div>

            {/* Message WhatsApp prêt à envoyer */}
            <div style={{background:'#E8F5E9',border:'1px solid #81C784',borderRadius:'var(--rs)',padding:'12px',marginBottom:'14px',fontSize:'12px',color:'#1B5E20',lineHeight:'1.6',whiteSpace:'pre-wrap'}}>
{`Bonjour ${inviteEmp.name} 👋

Tu peux maintenant accéder à Pointly, notre app de planning et pointage.

🔗 ${appUrl}
📧 ${inviteEmp.email}
🔑 ${inviteEmp.pwd}

Connecte-toi et change ton mot de passe dans ton profil !`}
            </div>

            <button className="btn btn-p" onClick={()=>copyCredentials(inviteEmp)}>
              <i className="ti ti-copy"/>Copier le message
            </button>
            <button className="btn btn-s" style={{marginTop:'8px',background:'#25D366',color:'#fff',border:'none'}}
              onClick={()=>{
                const msg = encodeURIComponent(`Bonjour ${inviteEmp.name} 👋\n\nAccès Pointly :\n🔗 ${appUrl}\n📧 ${inviteEmp.email}\n🔑 ${inviteEmp.pwd}`)
                window.open(`https://wa.me/?text=${msg}`)
              }}>
              <i className="ti ti-brand-whatsapp"/>Envoyer sur WhatsApp
            </button>
            <button className="btn btn-s" style={{marginTop:'8px'}} onClick={()=>setInviteEmp(null)}>Fermer</button>
          </div>
        </div>
      )}

      {/* ── MODAL RESET MOT DE PASSE ── */}
      {resetEmp && (
        <div className="modal-bg" onClick={()=>setResetEmp(null)}>
          <div className="ms" onClick={e=>e.stopPropagation()}>
            <div className="mh"/>
            <div style={{fontSize:'18px',fontWeight:'800',marginBottom:'4px'}}>Réinitialiser le mot de passe</div>
            <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'16px'}}>{resetEmp.full_name} · {resetEmp.email}</div>
            <div className="iw" style={{marginBottom:'16px'}}>
              <div className="il">Nouveau mot de passe</div>
              <input className="if" type="text" value={newPwd} onChange={e=>setNewPwd(e.target.value)}
                placeholder="Ex: Pointly2025" style={{fontSize:'18px',fontWeight:'700',letterSpacing:'1px'}}/>
              <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'4px'}}>Minimum 6 caractères · L'employé devra le changer dans son profil</div>
            </div>
            <button className="btn btn-p" onClick={resetPassword} disabled={loading||newPwd.length<6}>
              <i className="ti ti-key"/>Générer le nouveau mot de passe
            </button>
            <button className="btn btn-s" style={{marginTop:'8px'}} onClick={()=>setResetEmp(null)}>Annuler</button>
          </div>
        </div>
      )}

      {/* ── MODAL SUPPRESSION ── */}
      {confirmDelete && (
        <div className="modal-bg" onClick={()=>setConfirmDelete(null)}>
          <div className="ms" onClick={e=>e.stopPropagation()}>
            <div className="mh"/>
            <div style={{textAlign:'center',padding:'8px 0 16px'}}>
              <div style={{width:'56px',height:'56px',borderRadius:'50%',background:'var(--red-bg)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}>
                <i className="ti ti-trash" style={{fontSize:'26px',color:'var(--red)'}}/>
              </div>
              <div style={{fontSize:'18px',fontWeight:'800',marginBottom:'6px'}}>
                Supprimer {confirmDelete.full_name} ?
              </div>
              <div style={{fontSize:'13px',color:'var(--text2)',lineHeight:'1.6'}}>
                Cette action est <strong>irréversible</strong>.<br/>
                Tous ses shifts, pointages et données seront supprimés.
              </div>
            </div>
            <div style={{background:'var(--red-bg)',border:'1px solid var(--red)',borderRadius:'var(--rs)',padding:'10px 14px',fontSize:'12px',color:'#8B1F1F',marginBottom:'16px'}}>
              ⚠️ Note : Le compte de connexion reste dans Supabase Auth. Pour le supprimer complètement, allez dans Supabase → Authentication → Users.
            </div>
            <button className="btn btn-r" onClick={deleteEmployee} disabled={loading}>
              {loading ? 'Suppression…' : <><i className="ti ti-trash"/>Oui, supprimer définitivement</>}
            </button>
            <button className="btn btn-s" style={{marginTop:'8px'}} onClick={()=>setConfirmDelete(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="nav">
        <Link to="/admin" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-layout-dashboard"/>Accueil</div></Link>
        <Link to="/admin/planning" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-calendar"/>Planning</div></Link>
        <div className="nav-item active"><i className="ti ti-users"/>Équipe</div>
        <Link to="/admin/chat" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-message-2"/>Chat</div></Link>
        <Link to="/admin/profile" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-user-circle"/>Profil</div></Link>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
