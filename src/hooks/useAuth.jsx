import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [company, setCompany] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId) {
    if (!userId) return
    for (let i = 0; i < 3; i++) {
      const { data: prof } = await supabase
        .from('profiles').select('*, companies(*)')
        .eq('id', userId).maybeSingle()
      if (prof) {
        setProfile(prof)
        setCompany(prof.companies || null)
        return
      }
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id).finally(()=>setLoading(false))
      else setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) await loadProfile(session.user.id)
      else { setProfile(null); setCompany(null) }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (data.user) await loadProfile(data.user.id)
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null); setProfile(null); setCompany(null)
  }

  async function registerCompany({ companyName, fullName, email, password, sector, pauseMode }) {
    const { data: authData, error: authErr } = await supabase.auth.signUp({ email, password })
    if (authErr) throw authErr
    const { data: co, error: coErr } = await supabase.from('companies')
      .insert({ name: companyName, sector, pause_mode: pauseMode }).select().single()
    if (coErr) throw coErr
    const { error: profErr } = await supabase.from('profiles').upsert({
      id: authData.user.id, company_id: co.id, full_name: fullName,
      email, role: 'admin', poste: 'Administrateur',
    })
    if (profErr) throw profErr
    await loadProfile(authData.user.id)
    return authData
  }

  async function addEmployee({ fullName, email, password, poste, contract, hDue, vacDroit, cycle, role='employee' }) {
    if (!company) throw new Error('Pas de société')
    // Passe par une fonction serveur : créer le compte depuis le navigateur
    // écraserait la session de l'admin connecté.
    const { data, error } = await supabase.functions.invoke('create-employee', {
      body: { fullName, email, password, poste, contract, hDue, vacDroit, cycle, role },
    })

    let errMsg = null
    if (data?.error) errMsg = data.error
    else if (error) {
      try {
        const ctx = await error.context?.json?.()
        errMsg = ctx?.error || error.message
      } catch { errMsg = error.message }
    }
    if (errMsg) throw new Error(errMsg)

    return data
  }

  async function updateEmployee(profileId, updates) {
    const { error } = await supabase.from('profiles').update(updates).eq('id', profileId)
    if (error) throw error
  }

  async function refreshProfile() {
    if (user) await loadProfile(user.id)
  }

  function mkIni(name='') {
    const p = name.trim().split(' ')
    return ((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase()
  }

  const isAdmin     = profile?.role === 'admin'
  const isModerator = profile?.role === 'moderator'
  const isEmployee  = profile?.role === 'employee'
  const canManage   = isAdmin || isModerator  // peut gérer planning, équipe, etc.
  const canExport   = isAdmin                 // SEUL l'admin peut exporter les heures

  return (
    <AuthContext.Provider value={{
      user, profile, company, loading,
      signIn, signOut, registerCompany, addEmployee, updateEmployee, refreshProfile,
      isAdmin, isModerator, isEmployee, canManage, canExport,
      initials: profile ? mkIni(profile.full_name) : '',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
