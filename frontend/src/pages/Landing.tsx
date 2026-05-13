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
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #7e1528 0%, #a51e35 45%, #c83a50 100%)' }}>
        <div className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '28px 28px' }} />
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #f0c872 0%, transparent 70%)' }} />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #f0c872 0%, transparent 70%)' }} />

        <div className="relative">
          <div className="flex items-center gap-3">
            <img src="/src/assets/logo.png" alt="DAFH Transfer" className="w-11 h-11 object-contain bg-white/15 rounded-xl p-1.5 backdrop-blur-sm" />
            <span className="text-white font-semibold text-lg tracking-tight">DAFH Transfer</span>
          </div>
        </div>

        <div className="relative">
          <p className="text-indigo-200 text-xs font-semibold uppercase tracking-widest mb-4">Transfer Planner</p>
          <h1 className="text-4xl font-bold text-white leading-[1.15] tracking-tight mb-5">
            Plan your transfer.<br />Reach your goals.
          </h1>
          <p className="text-white/60 text-base leading-relaxed max-w-xs">
            See exactly which De Anza and Foothill classes you still need to transfer to your target schools and majors.
          </p>
        </div>

        <div className="relative flex gap-4 flex-wrap">
          {['UCSD', 'UCLA', 'USC', 'UCSB', 'UCI', 'UCB'].map((school) => (
            <span key={school} className="text-white/40 text-xs font-semibold tracking-wide">{school}</span>
          ))}
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden flex items-center gap-2">
            <img src="/src/assets/logo.png" alt="DAFH Transfer" className="w-8 h-8 object-contain" />
            <span className="text-gray-900 font-semibold text-base tracking-tight">DAFH Transfer</span>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-1">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="text-gray-400 text-sm mb-8">
            {mode === 'login'
              ? 'Log in to continue your transfer plan.'
              : 'Start planning your transfer today.'}
          </p>

          <div className="flex gap-1 mb-7 bg-gray-100 p-1 rounded-xl">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 text-sm font-medium rounded-[10px] transition-all duration-200 ${
                  mode === m
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {m === 'login' ? 'Log In' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Username</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all duration-150"
                placeholder="your_username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </div>
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email</label>
                <input
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all duration-150"
                  placeholder="you@example.com"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Password</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all duration-150"
                placeholder="••••••••"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                <p className="text-red-500 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white rounded-xl py-3.5 text-sm font-semibold hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 mt-2"
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
