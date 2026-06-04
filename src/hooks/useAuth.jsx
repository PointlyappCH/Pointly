import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [company, setCompany] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('*, companies(*)')
      .eq('id', userId)
      .single()
    if (prof) {
      setProfile(prof)
      setCompany(prof.companies)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else { setProfile(null); setCompany(null) }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null); setProfile(null); setCompany(null)
  }

  async function registerCompany({ companyName, fullName, email, password, sector, pauseMode }) {
    // 1. Créer le compte auth
    const { data: authData, error: authErr } = await supabase.auth.signUp({ email, password })
    if (authErr) throw authErr

    // 2. Créer l'entreprise
    const { data: co, error: coErr } = await supabase
      .from('companies')
      .insert({ name: companyName, sector, pause_mode: pauseMode })
      .select().single()
    if (coErr) throw coErr

    // 3. Créer le profil admin
    const { error: profErr } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        company_id: co.id,
        full_name: fullName,
        role: 'admin',
        poste: 'Administrateur',
      })
    if (profErr) throw profErr
    return authData
  }

  async function addEmployee({ fullName, email, password, poste, contract, hDue, vacDroit, cycle }) {
    if (!company) throw new Error('Pas de société')
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } }
    })
    if (authErr) throw authErr
    const colors = [
      ['#E6F1FB','#185FA5'],['#E1F5EE','#0A5E45'],['#FAEEDA','#7A4500'],
      ['#EEEDFE','#534AB7'],['#FCEBEB','#8B1F1F'],['#FFF0E6','#8B4500'],
    ]
    const c = colors[Math.floor(Math.random() * colors.length)]
    const { error: profErr } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        company_id: company.id,
        full_name: fullName,
        role: 'employee',
        poste, contract,
        h_due: hDue,
        vac_droit: vacDroit,
        vac_pris: 0,
        cycle,
        color_bg: c[0],
        color_fg: c[1],
      })
    if (profErr) throw profErr
    return authData
  }

  async function updateEmployee(profileId, updates) {
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profileId)
    if (error) throw error
  }

  return (
    <AuthContext.Provider value={{
      user, profile, company, loading,
      signIn, signOut, registerCompany, addEmployee, updateEmployee,
      isAdmin: profile?.role === 'admin',
      initials: profile ? (profile.full_name.split(' ').map((p,i)=>i<2?p[0]:'').join('').toUpperCase()) : '',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
