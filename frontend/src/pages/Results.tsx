import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

type CourseItem = {
  code: string
  name: string
  units: number | null
  school: string
  completed: boolean
  in_progress: boolean
}

type Option = {
  courses: CourseItem[]
  satisfied: boolean
}

type Requirement = {
  receiving_code: string
  receiving_name: string
  no_articulation: boolean
  satisfied: boolean
  options: Option[]
  school: string
}

type TargetResult = {
  target: string
  school_name: string
  major_name: string
  requirements: Requirement[]
  recommended: Requirement[]
  total: number
  satisfied: number
}

function RequirementRow({ req }: { req: Requirement }) {
  const remaining = req.options.filter((o) => !o.satisfied)
  const hasAny = req.options.length > 0

  return (
    <div className={`rounded-2xl border px-5 py-4 ${req.satisfied ? 'bg-green-50 border-green-100' : 'bg-white border-gray-100 shadow-sm'}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${req.satisfied ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
          {req.satisfied ? '✓' : ''}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono font-bold text-sm text-gray-800">{req.receiving_code}</span>
            <span className="text-xs text-gray-400 truncate">{req.receiving_name}</span>
          </div>

          {req.no_articulation && (
            <p className="text-xs text-gray-400 italic">No De Anza articulation available</p>
          )}

          {!req.no_articulation && !req.satisfied && hasAny && (
            <div className="mt-2 space-y-2">
              {remaining.length > 1 && (
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Pick one option:</p>
              )}
              {remaining.map((opt, oi) => (
                <div key={oi} className={`rounded-xl px-3 py-2 ${remaining.length > 1 ? 'bg-gray-50 border border-gray-100' : ''}`}>
                  {remaining.length > 1 && (
                    <p className="text-xs font-semibold text-indigo-500 mb-1">Option {oi + 1}</p>
                  )}
                  <div className="space-y-1">
                    {opt.courses.map((c, ci) => (
                      <div key={ci} className="flex items-center gap-2">
                        {opt.courses.length > 1 && ci > 0 && (
                          <span className="text-xs text-gray-300 w-6 text-center">+</span>
                        )}
                        {opt.courses.length === 1 && <span className="w-6" />}
                        <span className={`font-mono text-sm font-semibold ${c.completed ? 'text-green-600 line-through' : 'text-indigo-700'}`}>
                          {c.code}
                        </span>
                        <span className="text-xs text-gray-500 truncate">{c.name}</span>
                        {c.in_progress && (
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full shrink-0">In Progress</span>
                        )}
                        {c.units && (
                          <span className="text-xs text-gray-300 shrink-0 ml-auto">{c.units}u</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {remaining.length > 1 && <p className="text-xs text-gray-300 pl-1">Options are equivalent — choose whichever fits your schedule.</p>}
            </div>
          )}

          {!req.no_articulation && req.satisfied && (
            <p className="text-xs text-green-600 mt-0.5">Already satisfied</p>
          )}
        </div>
      </div>
    </div>
  )
}

function RecommendedSection({ courses }: { courses: Requirement[] }) {
  const [open, setOpen] = useState(false)
  const done = courses.filter((c) => c.satisfied).length

  return (
    <div className="mt-6 border-t border-gray-100 pt-5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-left group"
      >
        <div>
          <p className="text-sm font-semibold text-gray-600 group-hover:text-gray-800 transition-colors">
            Recommended — Counts Toward Major
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Not required for admission, but completing these at De Anza saves time at {open ? '' : '— '}
            {courses.length} courses, {done} already done
          </p>
        </div>
        <span className="text-gray-300 text-lg shrink-0 ml-4">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="space-y-2 mt-4">
          {courses.map((req, i) => (
            <RequirementRow key={i} req={req} />
          ))}
        </div>
      )}
    </div>
  )
}

function TargetSection({ result }: { result: TargetResult }) {
  const remaining = result.requirements.filter((r) => !r.satisfied)
  const [showSatisfied, setShowSatisfied] = useState(false)
  const satisfied = result.requirements.filter((r) => r.satisfied)

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{result.school_name}</h2>
          <p className="text-sm text-gray-500">{result.major_name}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-indigo-600">{result.satisfied}<span className="text-gray-300">/{result.total}</span></p>
          <p className="text-xs text-gray-400">requirements met</p>
        </div>
      </div>

      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-5">
        <div
          className="bg-indigo-600 h-1.5 rounded-full transition-all"
          style={{ width: `${result.total ? (result.satisfied / result.total) * 100 : 0}%` }}
        />
      </div>

      {remaining.length === 0 ? (
        <div className="bg-green-50 border border-green-100 rounded-2xl p-5 text-center">
          <p className="text-green-700 font-semibold">All requirements satisfied!</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Still needed ({remaining.length})</p>
          {remaining.map((req, i) => (
            <RequirementRow key={i} req={req} />
          ))}
        </div>
      )}

      {satisfied.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowSatisfied((s) => !s)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {showSatisfied ? 'Hide' : 'Show'} {satisfied.length} completed requirements
          </button>
          {showSatisfied && (
            <div className="space-y-2 mt-2">
              {satisfied.map((req, i) => (
                <RequirementRow key={i} req={req} />
              ))}
            </div>
          )}
        </div>
      )}

      {result.recommended && result.recommended.length > 0 && (
        <RecommendedSection courses={result.recommended} />
      )}
    </div>
  )
}

export default function Results() {
  const navigate = useNavigate()
  const [results, setResults] = useState<TargetResult[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    api.get('/results/')
      .then(({ data }) => setResults(data))
      .catch(() => setError('Failed to load results. Make sure you have saved schools and a transcript.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const totalRemaining = results?.reduce((sum, r) => sum + (r.total - r.satisfied), 0) ?? 0

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-gray-600 transition-colors">←</button>
            <div className="flex items-center gap-2">
              <img src="/src/assets/logo.png" alt="DAFH Transfer" className="w-8 h-8 object-contain" />
              <span className="font-semibold text-gray-900">DAFH Transfer</span>
            </div>
          </div>
          <button onClick={load} className="text-sm text-indigo-600 hover:text-indigo-800 transition-colors font-medium">
            Refresh
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Transfer Requirements</h1>
          <p className="text-gray-500 text-sm">Based on your transcript and selected schools.</p>
        </div>

        {loading && (
          <div className="text-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-500 text-sm">Fetching requirements from ASSIST.org...</p>
            <p className="text-gray-400 text-xs mt-1">This may take a few seconds.</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 mb-6">
            <p className="text-red-700 font-medium text-sm mb-1">Could not load results</p>
            <p className="text-red-500 text-xs">{error}</p>
          </div>
        )}

        {results && !loading && (
          <>
            {results.length === 0 ? (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 text-center">
                <p className="text-gray-600 font-semibold mb-1">No transfer targets set</p>
                <p className="text-gray-400 text-sm mb-4">Add schools and majors first.</p>
                <button onClick={() => navigate('/schools')} className="bg-indigo-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-indigo-700 transition-colors">
                  Add Schools
                </button>
              </div>
            ) : (
              <>
                {totalRemaining > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 mb-8 flex items-center gap-4">
                    <div>
                      <p className="text-3xl font-bold text-indigo-600">{totalRemaining}</p>
                      <p className="text-xs text-gray-400">requirements still needed</p>
                    </div>
                    <div className="h-10 w-px bg-gray-100"></div>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Each item shows what De Anza or Foothill class satisfies it. If multiple options appear, you only need to take one.
                    </p>
                  </div>
                )}
                {results.map((r, i) => (
                  <TargetSection key={i} result={r} />
                ))}
              </>
            )}

            <div className="flex gap-3 mt-8">
              <button onClick={() => navigate('/transcript')} className="flex-1 border border-gray-200 text-gray-600 rounded-2xl py-3 text-sm font-medium hover:bg-gray-50 transition-colors">
                Edit Transcript
              </button>
              <button onClick={() => navigate('/schools')} className="flex-1 border border-gray-200 text-gray-600 rounded-2xl py-3 text-sm font-medium hover:bg-gray-50 transition-colors">
                Edit Schools
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
