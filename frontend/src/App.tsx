import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Landing from './pages/Landing'
import Results from './pages/Results'
import Schools from './pages/Schools'
import Transcript from './pages/Transcript'

function RequireAuth({ children }: { children: React.ReactNode }) {
  return localStorage.getItem('access') ? <>{children}</> : <Navigate to="/" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/transcript" element={<RequireAuth><Transcript /></RequireAuth>} />
        <Route path="/schools" element={<RequireAuth><Schools /></RequireAuth>} />
        <Route path="/results" element={<RequireAuth><Results /></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  )
}
