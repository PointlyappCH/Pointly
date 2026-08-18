import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'

import Login              from './pages/Login'
import Register           from './pages/Register'
import AdminHome          from './pages/admin/Home'
import AdminPlanning      from './pages/admin/Planning'
import AdminDayView       from './pages/admin/DayView'
import AdminTeam          from './pages/admin/Team'
import AdminChat          from './pages/admin/Chat'
import AdminProfile       from './pages/admin/Profile'
import AdminCorrections   from './pages/admin/Corrections'
import AdminExport        from './pages/admin/Export'
import AdminExchanges     from './pages/admin/Exchanges'
import AdminSettings      from './pages/admin/Settings'
import AdminToday         from './pages/admin/Today'
import AdminStats         from './pages/admin/Stats'
import EmpHome            from './pages/employee/Home'
import EmpPlanning        from './pages/employee/Planning'
import EmpDayView         from './pages/employee/DayView'
import EmpDispo           from './pages/employee/Dispo'
import EmpChat            from './pages/employee/Chat'
import EmpProfile         from './pages/employee/Profile'
import EmpExchanges       from './pages/employee/Exchanges'

function ProtectedRoute({ children, requireAdmin, requireManager }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="loading-screen"><div className="spinner"/></div>
  if (!user)   return <Navigate to="/login" replace />
  // Admin seulement
  if (requireAdmin && profile?.role !== 'admin') return <Navigate to="/emp" replace />
  // Admin ou Modérateur
  if (requireManager && profile?.role !== 'admin' && profile?.role !== 'moderator') return <Navigate to="/emp" replace />
  return children
}

function RootRedirect() {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="loading-screen"><div className="spinner"/></div>
  if (!user)   return <Navigate to="/login" replace />
  if (profile?.role === 'admin' || profile?.role === 'moderator') return <Navigate to="/admin" replace />
  return <Navigate to="/emp" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"         element={<RootRedirect />} />
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Admin + Modérateur */}
          <Route path="/admin"             element={<ProtectedRoute requireManager><AdminHome /></ProtectedRoute>} />
          <Route path="/admin/planning"    element={<ProtectedRoute requireManager><AdminPlanning /></ProtectedRoute>} />
          <Route path="/admin/day"         element={<ProtectedRoute requireManager><AdminDayView /></ProtectedRoute>} />
          <Route path="/admin/team"        element={<ProtectedRoute requireManager><AdminTeam /></ProtectedRoute>} />
          <Route path="/admin/chat"        element={<ProtectedRoute requireManager><AdminChat /></ProtectedRoute>} />
          <Route path="/admin/profile"     element={<ProtectedRoute requireManager><AdminProfile /></ProtectedRoute>} />
          <Route path="/admin/corrections" element={<ProtectedRoute requireManager><AdminCorrections /></ProtectedRoute>} />
          <Route path="/admin/exchanges"   element={<ProtectedRoute requireManager><AdminExchanges /></ProtectedRoute>} />
          <Route path="/admin/settings"    element={<ProtectedRoute requireManager><AdminSettings /></ProtectedRoute>} />
          <Route path="/admin/today"       element={<ProtectedRoute requireManager><AdminToday /></ProtectedRoute>} />
          <Route path="/admin/stats"       element={<ProtectedRoute requireManager><AdminStats /></ProtectedRoute>} />

          {/* Admin SEULEMENT — export heures */}
          <Route path="/admin/export"      element={<ProtectedRoute requireAdmin><AdminExport /></ProtectedRoute>} />

          {/* Employé */}
          <Route path="/emp"              element={<ProtectedRoute><EmpHome /></ProtectedRoute>} />
          <Route path="/emp/planning"     element={<ProtectedRoute><EmpPlanning /></ProtectedRoute>} />
          <Route path="/emp/day"          element={<ProtectedRoute><EmpDayView /></ProtectedRoute>} />
          <Route path="/emp/dispo"        element={<ProtectedRoute><EmpDispo /></ProtectedRoute>} />
          <Route path="/emp/chat"         element={<ProtectedRoute><EmpChat /></ProtectedRoute>} />
          <Route path="/emp/profile"      element={<ProtectedRoute><EmpProfile /></ProtectedRoute>} />
          <Route path="/emp/exchanges"    element={<ProtectedRoute><EmpExchanges /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
