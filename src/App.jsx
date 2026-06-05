import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'

import Login          from './pages/Login'
import Register       from './pages/Register'
import AdminHome      from './pages/admin/Home'
import AdminPlanning  from './pages/admin/Planning'
import AdminTeam      from './pages/admin/Team'
import AdminChat      from './pages/admin/Chat'
import AdminProfile   from './pages/admin/Profile'
import AdminCorrections from './pages/admin/Corrections'
import AdminExport    from './pages/admin/Export'
import EmpHome        from './pages/employee/Home'
import EmpPlanning    from './pages/employee/Planning'
import EmpDispo       from './pages/employee/Dispo'
import EmpChat        from './pages/employee/Chat'
import EmpProfile     from './pages/employee/Profile'

function ProtectedRoute({ children, requireAdmin }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="loading-screen"><div className="spinner"/></div>
  if (!user) return <Navigate to="/login" replace />
  if (requireAdmin && profile?.role !== 'admin') return <Navigate to="/emp" replace />
  return children
}

function RootRedirect() {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="loading-screen"><div className="spinner"/></div>
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={profile?.role === 'admin' ? '/admin' : '/emp'} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"         element={<RootRedirect />} />
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Admin */}
          <Route path="/admin"              element={<ProtectedRoute requireAdmin><AdminHome /></ProtectedRoute>} />
          <Route path="/admin/planning"     element={<ProtectedRoute requireAdmin><AdminPlanning /></ProtectedRoute>} />
          <Route path="/admin/team"         element={<ProtectedRoute requireAdmin><AdminTeam /></ProtectedRoute>} />
          <Route path="/admin/chat"         element={<ProtectedRoute requireAdmin><AdminChat /></ProtectedRoute>} />
          <Route path="/admin/profile"      element={<ProtectedRoute requireAdmin><AdminProfile /></ProtectedRoute>} />
          <Route path="/admin/corrections"  element={<ProtectedRoute requireAdmin><AdminCorrections /></ProtectedRoute>} />
          <Route path="/admin/export"       element={<ProtectedRoute requireAdmin><AdminExport /></ProtectedRoute>} />

          {/* Employé */}
          <Route path="/emp"          element={<ProtectedRoute><EmpHome /></ProtectedRoute>} />
          <Route path="/emp/planning" element={<ProtectedRoute><EmpPlanning /></ProtectedRoute>} />
          <Route path="/emp/dispo"    element={<ProtectedRoute><EmpDispo /></ProtectedRoute>} />
          <Route path="/emp/chat"     element={<ProtectedRoute><EmpChat /></ProtectedRoute>} />
          <Route path="/emp/profile"  element={<ProtectedRoute><EmpProfile /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
