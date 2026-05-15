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
    <div className="min-h-screen flex bg-white">
      <div className="hidden lg:flex lg:w-5/12 flex-col justify-between p-14 border-r border-gray-100">
        <div className="flex items-center gap-2.5">
          <img src="/src/assets/logo.png" alt="DAFH" className="w-7 h-7 object-contain" />
          <span className="text-sm font-semibold text-gray-900 tracking-tight">DAFH Transfer</span>
        </div>

        <div>
          <p className="text-[11px] font-mono text-gray-400 uppercase tracking-[0.15em] mb-6">De Anza · Foothill</p>
          <h1 className="text-5xl font-bold text-gray-900 leading-[1.1] tracking-tight mb-6">
            Know exactly<br />what you need<br />to transfer.
          </h1>
          <p className="text-sm text-gray-400 leading-relaxed max-w-[260px]">
            Live articulation data from ASSIST.org matched against your transcript.
          </p>
        </div>

        <div className="space-y-1">
          {['UC San Diego', 'UC Los Angeles', 'UC Santa Barbara', 'UC Irvine', 'USC'].map((s) => (
            <p key={s} className="text-xs text-gray-300 font-medium">{s}</p>
          ))}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-[#f9f9f9]">
        <div className="w-full max-w-xs animate-fade-up">
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <img src="/src/assets/logo.png" alt="DAFH" className="w-6 h-6 object-contain" />
            <span className="text-sm font-semibold text-gray-900">DAFH Transfer</span>
          </div>

          <div className="flex gap-5 mb-8 border-b border-gray-200">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`pb-3 text-sm font-medium transition-colors duration-150 border-b-2 -mb-px ${
                  mode === m ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {m === 'login' ? 'Log in' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Username</label>
              <input
                className="w-full bg-white border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-indigo-400 transition-colors duration-150 rounded-lg"
                placeholder="your_username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </div>
            {mode === 'register' && (
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Email</label>
                <input
                  className="w-full bg-white border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-indigo-400 transition-colors duration-150 rounded-lg"
                  placeholder="you@example.com"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            )}
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Password</label>
              <input
                className="w-full bg-white border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-indigo-400 transition-colors duration-150 rounded-lg"
                placeholder="••••••••"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>

            {error && <p className="text-red-500 text-xs animate-shake">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2.5 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 rounded-lg"
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
