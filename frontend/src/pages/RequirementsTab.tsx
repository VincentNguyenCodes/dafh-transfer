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

type ElectiveCourse = {
  code: string
  completed: boolean
  in_progress: boolean
}

type ElectiveSeries = {
  name: string
  courses: ElectiveCourse[]
  completed_count: number
  total: number
  satisfied: boolean
}

type ElectiveGroup = {
  label: string
  series: ElectiveSeries[]
}

type TargetResult = {
  target: string
  school_name: string
  major_name: string
  requirements: Requirement[]
  recommended: Requirement[]
  elective_series: ElectiveGroup[]
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

function buildAggregated(
  results: TargetResult[],
  targetColorMap: Map<string, number>,
  getReqs: (r: TargetResult) => Requirement[]
): AggregatedReq[] {
  const map = new Map<string, AggregatedReq>()

  for (const result of results) {
    const colorIdx = targetColorMap.get(result.target) ?? 0

    for (const req of getReqs(result)) {
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

      {!req.no_articulation && req.satisfied && (() => {
        const completedOpt = req.options.find((o) => o.satisfied)
        if (!completedOpt) return <p className="text-xs text-green-600">Already satisfied</p>
        return (
          <div className="space-y-1">
            {completedOpt.courses.map((c, ci) => (
              <div key={ci} className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold">✓</span>
                </span>
                <span className="font-mono text-sm font-semibold text-green-700">{c.code}</span>
                <span className="text-xs text-gray-500 truncate">{c.name}</span>
                {c.units && <span className="text-xs text-gray-300 shrink-0 ml-auto">{c.units}u</span>}
              </div>
            ))}
          </div>
        )
      })()}

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

  const targetColorMap = new Map<string, number>()
  results.forEach((r, i) => targetColorMap.set(r.target, i % BADGE_COLORS.length))

  const aggregated = buildAggregated(results, targetColorMap, (r) => r.requirements)
  const aggregatedRec = buildAggregated(results, targetColorMap, (r) => r.recommended)

  const visibleResults = selectedTarget ? results.filter((r) => r.target === selectedTarget) : results
  const electiveGroups: ElectiveGroup[] = []
  const seenElectiveLabels = new Set<string>()
  for (const r of visibleResults) {
    for (const group of (r.elective_series ?? [])) {
      if (!seenElectiveLabels.has(group.label)) {
        seenElectiveLabels.add(group.label)
        electiveGroups.push(group)
      }
    }
  }

  const visible = selectedTarget
    ? aggregated.filter((r) => r.badges.some((b) => b.target === selectedTarget))
    : aggregated

  const visibleRec = selectedTarget
    ? aggregatedRec.filter((r) => r.badges.some((b) => b.target === selectedTarget))
    : aggregatedRec

  const unsatisfied = visible.filter((r) => !r.satisfied && !r.no_articulation)
  const satisfied = visible.filter((r) => r.satisfied)
  const noArticulation = visible.filter((r) => r.no_articulation)

  const unsatisfiedRec = visibleRec.filter((r) => !r.satisfied && !r.no_articulation)
  const satisfiedRec = visibleRec.filter((r) => r.satisfied)

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

      <div className="sticky top-[44px] z-10 -mx-8 px-8 py-3 mb-6 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-indigo-600">Required Classes</span>
              <span className="text-xs font-bold text-gray-700">
                {satisfied.length} / {satisfied.length + unsatisfied.length} done
              </span>
            </div>
            <div className="w-full bg-indigo-100 rounded-full h-1.5">
              <div
                className="bg-indigo-600 h-1.5 rounded-full transition-all"
                style={{ width: `${satisfied.length + unsatisfied.length > 0 ? (satisfied.length / (satisfied.length + unsatisfied.length)) * 100 : 0}%` }}
              />
            </div>
          </div>
          <div className="w-px h-8 bg-gray-200 shrink-0"></div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-violet-600">Recommended Classes</span>
              <span className="text-xs font-bold text-gray-700">
                {satisfiedRec.length} / {satisfiedRec.length + unsatisfiedRec.length} done
              </span>
            </div>
            <div className="w-full bg-violet-100 rounded-full h-1.5">
              <div
                className="bg-violet-500 h-1.5 rounded-full transition-all"
                style={{ width: `${satisfiedRec.length + unsatisfiedRec.length > 0 ? (satisfiedRec.length / (satisfiedRec.length + unsatisfiedRec.length)) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">Hover a badge to see the major. If multiple options appear, you only need one.</p>
      </div>

      {unsatisfied.length > 0 && (
        <div className="mb-5 border border-indigo-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-indigo-800">Required Classes - Need to Take</p>
              <p className="text-xs text-indigo-400 mt-0.5">Must complete for admission</p>
            </div>
            <span className="text-sm font-bold text-indigo-600 bg-white px-2.5 py-0.5 rounded-full border border-indigo-100">
              {unsatisfied.length}
            </span>
          </div>
          <div className="p-4 space-y-2 bg-white">
            {unsatisfied.map((req) => (
              <AggregatedRequirementRow key={req.key} req={req} />
            ))}
          </div>
        </div>
      )}

      {unsatisfiedRec.length > 0 && (
        <div className="mb-5 border border-violet-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-violet-50 border-b border-violet-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-violet-800">Recommended Classes - Need to Take</p>
              <p className="text-xs text-violet-400 mt-0.5">Not required for admission, but saves units after transfer</p>
            </div>
            <span className="text-sm font-bold text-violet-600 bg-white px-2.5 py-0.5 rounded-full border border-violet-100">
              {unsatisfiedRec.length}
            </span>
          </div>
          <div className="p-4 space-y-2 bg-white">
            {unsatisfiedRec.map((req) => (
              <AggregatedRequirementRow key={req.key} req={req} />
            ))}
          </div>
        </div>
      )}

      {electiveGroups.map((group) => (
        <div key={group.label} className="mb-5 border border-amber-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-100">
            <p className="text-sm font-bold text-amber-800">{group.label}</p>
            <p className="text-xs text-amber-500 mt-0.5">Complete all courses in one series before transfer</p>
          </div>
          <div className="p-4 space-y-3 bg-white">
            {group.series.map((s) => (
              <div key={s.name} className={`rounded-xl border px-4 py-3 ${s.satisfied ? 'bg-green-50 border-green-100' : 'border-gray-100'}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-700">{s.name}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.satisfied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {s.completed_count}/{s.total} done
                  </span>
                </div>
                <div className="space-y-1">
                  {s.courses.map((c, ci) => (
                    <div key={ci} className="flex items-center gap-2">
                      {c.completed
                        ? <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0"><span className="text-white text-xs font-bold">✓</span></span>
                        : <span className="w-5 h-5 rounded-full border-2 border-gray-200 shrink-0" />
                      }
                      <span className={`font-mono text-sm font-semibold ${c.completed ? 'text-green-600 line-through' : 'text-gray-800'}`}>{c.code}</span>
                      {c.in_progress && (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">In Progress</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {satisfied.length > 0 && (
        <div className="mb-5 border border-green-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-green-50 border-b border-green-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-green-800">Completed Required Classes</p>
              <p className="text-xs text-green-400 mt-0.5">Required courses you have already finished</p>
            </div>
            <span className="text-sm font-bold text-green-600 bg-white px-2.5 py-0.5 rounded-full border border-green-100">
              {satisfied.length}
            </span>
          </div>
          <div className="p-4 space-y-2 bg-white">
            {satisfied.map((req) => (
              <AggregatedRequirementRow key={req.key} req={req} />
            ))}
          </div>
        </div>
      )}

      {satisfiedRec.length > 0 && (
        <div className="mb-5 border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-700">Completed Recommended Classes</p>
              <p className="text-xs text-gray-400 mt-0.5">Recommended courses you have already finished</p>
            </div>
            <span className="text-sm font-bold text-gray-500 bg-white px-2.5 py-0.5 rounded-full border border-gray-200">
              {satisfiedRec.length}
            </span>
          </div>
          <div className="p-4 space-y-2 bg-white">
            {satisfiedRec.map((req) => (
              <AggregatedRequirementRow key={req.key} req={req} />
            ))}
          </div>
        </div>
      )}

      {unsatisfied.length === 0 && satisfied.length === 0 && unsatisfiedRec.length === 0 && satisfiedRec.length === 0 && (
        <div className="bg-green-50 border border-green-100 rounded-2xl p-5 text-center">
          <p className="text-green-700 font-semibold">All requirements satisfied!</p>
        </div>
      )}

      {noArticulation.length > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-400">
            {noArticulation.length} requirement{noArticulation.length > 1 ? 's' : ''} have no community college articulation path.
          </p>
        </div>
      )}
    </div>
  )
}
