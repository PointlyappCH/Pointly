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
    // Retry jusqu'à 3 fois si le profil n'est pas encore créé
    for (let i = 0; i < 3; i++) {
      const { data: prof, error } = await supabase
        .from('profiles')
        .select('*, companies(*)')
        .eq('id', userId)
        .maybeSingle()

      if (prof) {
        setProfile(prof)
        setCompany(prof.companies || null)
        return
      }
      // Attendre 1 seconde avant de réessayer
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        await loadProfile(session.user.id)
      } else {
        setProfile(null)
        setCompany(null)
      }
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

    const { data: co, error: coErr } = await supabase
      .from('companies')
      .insert({ name: companyName, sector, pause_mode: pauseMode })
      .select().single()
    if (coErr) throw coErr

    const { error: profErr } = await supabase
      .from('profiles')
      .upsert({
        id: authData.user.id,
        company_id: co.id,
        full_name: fullName,
        role: 'admin',
        poste: 'Administrateur',
      })
    if (profErr) throw profErr

    await loadProfile(authData.user.id)
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
      .upsert({
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

  // Refresh manuel du profil
  async function refreshProfile() {
    if (user) await loadProfile(user.id)
  }

  function mkIni(name=''){const p=name.trim().split(' ');return((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase()}
  const initials = profile
    ? mkIni(profile.full_name)
    : ''

  return (
    <AuthContext.Provider value={{
      user, profile, company, loading,
      signIn, signOut, registerCompany, addEmployee, updateEmployee, refreshProfile,
      isAdmin: profile?.role === 'admin',
      initials,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
