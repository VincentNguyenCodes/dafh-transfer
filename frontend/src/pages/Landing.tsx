import axios from 'axios'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Landing() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'register') {
        await axios.post('/api/auth/register/', form)
      }
      const { data } = await axios.post('/api/auth/login/', {
        username: form.username,
        password: form.password,
      })
      localStorage.setItem('access', data.access)
      localStorage.setItem('refresh', data.refresh)
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: Record<string, string[]> } })?.response?.data
      setError(msg ? Object.values(msg).flat().join(' ') : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-indigo-600 flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3">
            <img src="/src/assets/logo.png" alt="DAFH Transfer" className="w-12 h-12 object-contain bg-white rounded-xl p-1" />
            <span className="text-white font-semibold text-lg">DAFH Transfer</span>
          </div>
        </div>
        <div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Plan your transfer.<br />Reach your goals.
          </h1>
          <p className="text-indigo-200 text-lg leading-relaxed">
            See exactly which De Anza and Foothill classes you still need to transfer to your target schools and majors.
          </p>
        </div>
        <div className="flex gap-6">
          {['UCSD', 'UCLA', 'USC', 'UCSB', 'UCI'].map((school) => (
            <span key={school} className="text-indigo-300 text-sm font-medium">{school}</span>
          ))}
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2 mb-4">
              <img src="/src/assets/logo.png" alt="DAFH Transfer" className="w-8 h-8 object-contain" />
              <span className="text-gray-900 font-semibold text-lg">DAFH Transfer</span>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="text-gray-500 text-sm mb-8">
            {mode === 'login'
              ? 'Log in to continue your transfer plan.'
              : 'Start planning your transfer today.'}
          </p>

          <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === 'login'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === 'register'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                placeholder="your_username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </div>
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="you@example.com"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                placeholder="••••••••"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 transition-colors shadow-md"
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
