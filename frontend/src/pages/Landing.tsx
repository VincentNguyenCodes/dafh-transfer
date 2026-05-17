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
    <div className="min-h-screen flex flex-col bg-white">
      <div className="h-[3px] gradient-brand w-full shrink-0" />
      <div className="flex flex-1">
      <div className="hidden lg:flex lg:w-5/12 flex-col p-14 border-r border-gray-100 bg-[#faf9f7]">
        <div className="flex items-center gap-2.5">
          <img src="/src/assets/logo.png" alt="DAFH" className="w-7 h-7 object-contain" />
          <span className="text-sm font-semibold text-gray-900 tracking-tight">DAFH Transfer</span>
        </div>

        <div className="flex-1 flex flex-col justify-center mt-16">
          <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-[0.15em] mb-5">De Anza · Foothill</p>
          <h1 className="text-4xl font-bold text-gray-900 leading-[1.15] tracking-tight mb-5">
            Know exactly<br />what you need<br />to transfer.
          </h1>
          <p className="text-sm text-gray-400 leading-relaxed max-w-[260px] mb-12">
            Live articulation data from ASSIST.org, matched against your transcript in seconds.
          </p>

          <div className="space-y-7">
            {[
              { num: '01', label: 'Paste your transcript', desc: 'We automatically parse De Anza and Foothill courses' },
              { num: '02', label: 'Choose target schools', desc: 'Pick UC, CSU, or private universities and your major' },
              { num: '03', label: 'See your gap', desc: 'Know exactly which classes you still need to take' },
            ].map((step) => (
              <div key={step.num} className="flex items-start gap-4">
                <span className="text-[11px] font-mono font-bold text-indigo-400 mt-0.5 w-6 shrink-0">{step.num}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-800 tracking-tight">{step.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-gray-300 font-medium tracking-wide mt-10">Powered by ASSIST.org articulation data</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-white min-h-0">
        <div className="w-full max-w-xs animate-fade-up">
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <img src="/src/assets/logo.png" alt="DAFH" className="w-6 h-6 object-contain" />
            <span className="text-sm font-semibold text-gray-900">DAFH Transfer</span>
          </div>

          <h2 className="text-xl font-bold text-gray-900 tracking-tight mb-1">
            {mode === 'login' ? 'Welcome back' : 'Get started'}
          </h2>
          <p className="text-sm text-gray-400 mb-7">
            {mode === 'login' ? 'Log in to see your transfer plan.' : 'Start planning your transfer today.'}
          </p>

          <div className="flex gap-1 mb-7 p-1 bg-gray-100 rounded-xl">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer ${
                  mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {m === 'login' ? 'Log in' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Username</label>
              <input
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-150"
                placeholder="your_username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </div>
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email</label>
                <input
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-150"
                  placeholder="you@example.com"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Password</label>
              <input
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-150"
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
              className="w-full bg-indigo-600 text-white py-3 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 rounded-xl cursor-pointer"
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
      </div>
    </div>
  )
}
