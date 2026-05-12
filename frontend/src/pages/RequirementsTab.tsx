import { useEffect, useState } from 'react'
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

type Badge = {
  target: string
  school_name: string
  major_name: string
  colorIdx: number
  satisfied: boolean
}

type AggregatedReq = {
  key: string
  options: Option[]
  satisfied: boolean
  no_articulation: boolean
  badges: Badge[]
}

const BADGE_COLORS = [
  { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { bg: 'bg-violet-100', text: 'text-violet-700' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { bg: 'bg-amber-100', text: 'text-amber-700' },
  { bg: 'bg-rose-100', text: 'text-rose-700' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700' },
]

function buildAggregated(results: TargetResult[]): AggregatedReq[] {
  const targetColorMap = new Map<string, number>()
  results.forEach((r, i) => targetColorMap.set(r.target, i % BADGE_COLORS.length))

  const map = new Map<string, AggregatedReq>()

  for (const result of results) {
    const colorIdx = targetColorMap.get(result.target) ?? 0

    for (const req of result.requirements) {
      const key = req.no_articulation
        ? `no_art:${req.receiving_code}:${result.target}`
        : req.options.flatMap((o) => o.courses.map((c) => c.code)).sort().join('|')

      const badge: Badge = {
        target: result.target,
        school_name: result.school_name,
        major_name: result.major_name,
        colorIdx,
        satisfied: req.satisfied,
      }

      if (!req.no_articulation && map.has(key)) {
        const existing = map.get(key)!
        existing.badges.push(badge)
        existing.satisfied = existing.satisfied && req.satisfied
      } else {
        map.set(key, {
          key,
          options: req.options,
          satisfied: req.satisfied,
          no_articulation: req.no_articulation,
          badges: [badge],
        })
      }
    }
  }

  return Array.from(map.values())
}

function AggregatedRequirementRow({ req }: { req: AggregatedReq }) {
  const remaining = req.options.filter((o) => !o.satisfied)

  return (
    <div className={`rounded-2xl border px-5 py-4 ${req.satisfied ? 'bg-green-50 border-green-100' : 'bg-white border-gray-100 shadow-sm'}`}>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {req.badges.map((b, i) => {
          const color = BADGE_COLORS[b.colorIdx]
          return (
            <span
              key={i}
              title={b.major_name}
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${color.bg} ${color.text} ${b.satisfied ? 'opacity-40 line-through' : ''}`}
            >
              {b.school_name}
            </span>
          )
        })}
      </div>

      {req.no_articulation && (
        <p className="text-xs text-gray-400 italic">No community college articulation available</p>
      )}

      {!req.no_articulation && req.satisfied && (
        <p className="text-xs text-green-600">Already satisfied</p>
      )}

      {!req.no_articulation && !req.satisfied && remaining.length > 0 && (
        <div className="space-y-2">
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
          {remaining.length > 1 && (
            <p className="text-xs text-gray-300 pl-1">Options are equivalent, choose whichever fits your schedule.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function RequirementsTab() {
  const [results, setResults] = useState<TargetResult[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [showSatisfied, setShowSatisfied] = useState(false)

  const load = () => {
    setLoading(true)
    setError('')
    api.get('/results/')
      .then(({ data }) => {
        setResults(data)
        setSelectedTarget(null)
      })
      .catch(() => setError('Failed to load results. Make sure you have saved schools and classes.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-gray-500 text-sm">Fetching requirements from ASSIST.org...</p>
        <p className="text-gray-400 text-xs mt-1">This may take a few seconds.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
        <p className="text-red-700 font-medium text-sm mb-1">Could not load results</p>
        <p className="text-red-500 text-xs">{error}</p>
      </div>
    )
  }

  if (!results || results.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 text-center">
        <p className="text-gray-600 font-semibold mb-1">No transfer targets set</p>
        <p className="text-gray-400 text-sm">Add schools and majors in the Transfer Targets tab.</p>
      </div>
    )
  }

  const aggregated = buildAggregated(results)

  const visible = selectedTarget
    ? aggregated.filter((r) => r.badges.some((b) => b.target === selectedTarget))
    : aggregated

  const unsatisfied = visible.filter((r) => !r.satisfied && !r.no_articulation)
  const satisfied = visible.filter((r) => r.satisfied)
  const noArticulation = visible.filter((r) => r.no_articulation)

  const targetColorMap = new Map<string, number>()
  results.forEach((r, i) => targetColorMap.set(r.target, i % BADGE_COLORS.length))

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Requirements</h2>
          <p className="text-gray-500 text-sm">All classes you still need to take across your transfer targets.</p>
        </div>
        <button onClick={load} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors shrink-0">
          Refresh
        </button>
      </div>

      <div className="flex gap-2 flex-wrap mb-6">
        <button
          onClick={() => setSelectedTarget(null)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            selectedTarget === null
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All Schools
        </button>
        {results.map((r) => {
          const colorIdx = targetColorMap.get(r.target) ?? 0
          const color = BADGE_COLORS[colorIdx]
          const isActive = selectedTarget === r.target
          return (
            <button
              key={r.target}
              onClick={() => setSelectedTarget(isActive ? null : r.target)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                isActive ? `${color.bg} ${color.text} ring-2 ring-offset-1 ring-current` : `${color.bg} ${color.text} opacity-70 hover:opacity-100`
              }`}
            >
              {r.school_name}
            </button>
          )
        })}
      </div>

      {unsatisfied.length === 0 && !showSatisfied ? (
        <div className="bg-green-50 border border-green-100 rounded-2xl p-5 text-center mb-4">
          <p className="text-green-700 font-semibold">All requirements satisfied!</p>
        </div>
      ) : (
        <>
          {unsatisfied.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 mb-6 flex items-center gap-4">
              <div>
                <p className="text-3xl font-bold text-indigo-600">{unsatisfied.length}</p>
                <p className="text-xs text-gray-400">classes still needed</p>
              </div>
              <div className="h-10 w-px bg-gray-100"></div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Hover a badge to see the major. If multiple options appear for a class, you only need one.
              </p>
            </div>
          )}

          <div className="space-y-2 mb-4">
            {unsatisfied.map((req) => (
              <AggregatedRequirementRow key={req.key} req={req} />
            ))}
          </div>
        </>
      )}

      {satisfied.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowSatisfied((s) => !s)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {showSatisfied ? 'Hide' : 'Show'} {satisfied.length} completed requirements
          </button>
          {showSatisfied && (
            <div className="space-y-2 mt-2">
              {satisfied.map((req) => (
                <AggregatedRequirementRow key={req.key} req={req} />
              ))}
            </div>
          )}
        </div>
      )}

      {noArticulation.length > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-400">
            {noArticulation.length} requirement{noArticulation.length > 1 ? 's' : ''} have no community college articulation path and cannot be satisfied at De Anza or Foothill.
          </p>
        </div>
      )}
    </div>
  )
}
