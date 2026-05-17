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
  is_csu?: boolean
  requirements: Requirement[]
  recommended: Requirement[]
  elective_series: ElectiveGroup[]
  flags?: string[]
  total: number
  satisfied: number
}

const CALGETC_FILTER = '__calgetc__'
const GOLDEN4_FILTER = '__golden4__'
const GOLDEN_4_CODES = new Set(['CALGETC_1A', 'CALGETC_1B', 'CALGETC_1C', 'CALGETC_2'])

type Badge = {
  target: string
  school_name: string
  major_name: string
  colorIdx: number
  satisfied: boolean
  receiving_code: string
  receiving_name: string
}

type AggregatedReq = {
  key: string
  options: Option[]
  satisfied: boolean
  no_articulation: boolean
  badges: Badge[]
}

function fmtCode(code: string) {
  return code.replace(/([A-Za-z]+)(\d)/, '$1 $2')
}

const BADGE_COLORS = [
  { bg: 'bg-indigo-100', text: 'text-gray-700' },
  { bg: 'bg-violet-100', text: 'text-gray-700' },
  { bg: 'bg-emerald-100', text: 'text-gray-700' },
  { bg: 'bg-amber-100', text: 'text-gray-700' },
  { bg: 'bg-rose-100', text: 'text-gray-700' },
  { bg: 'bg-cyan-100', text: 'text-gray-700' },
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
        receiving_code: req.receiving_code,
        receiving_name: req.receiving_name,
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
    <div className={`rounded-xl border px-4 py-3.5 ${req.satisfied ? 'bg-green-50 border-green-100' : 'bg-white border-gray-100'}`}>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {req.badges.map((b, i) => {
          const color = BADGE_COLORS[b.colorIdx]
          return (
            <span
              key={i}
              title={`${b.major_name}${b.receiving_name ? ` · ${b.receiving_name}` : ''}`}
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${color.bg} ${color.text} ${b.satisfied ? 'opacity-40 line-through' : ''}`}
            >
              {b.school_name}{b.receiving_code ? ` · ${fmtCode(b.receiving_code)}` : ''}
            </span>
          )
        })}
      </div>

      {req.no_articulation && (
        <p className="text-xs text-gray-400 italic">No community college articulation available</p>
      )}

      {!req.no_articulation && req.satisfied && (() => {
        const completedOpt = req.options.find((o) => o.satisfied)
        if (!completedOpt) return <p className="text-xs text-gray-600">Already satisfied</p>
        return (
          <div className="space-y-1">
            {[...completedOpt.courses].sort((a, b) => a.code.localeCompare(b.code)).map((c, ci) => (
              <div key={ci} className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold">✓</span>
                </span>
                <span className="font-mono text-sm font-semibold text-gray-500 line-through">{c.code}</span>
                <span className="text-xs text-gray-500 truncate">{c.name}</span>
                {c.units && <span className="text-xs text-gray-400 shrink-0 ml-auto">{c.units}u</span>}
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
                <p className="text-xs font-semibold text-gray-600 mb-1">Option {oi + 1}</p>
              )}
              <div className="space-y-1">
                {[...opt.courses].sort((a, b) => a.code.localeCompare(b.code)).map((c, ci) => (
                  <div key={ci} className="flex items-center gap-2">
                    {opt.courses.length > 1 && ci > 0 && (
                      <span className="text-xs text-gray-400 w-6 text-center">+</span>
                    )}
                    {opt.courses.length === 1 && <span className="w-6" />}
                    <span className={`font-mono text-sm font-semibold ${c.completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                      {c.code}
                    </span>
                    <span className="text-xs text-gray-500 truncate">{c.name}</span>
                    {c.in_progress && (
                      <span className="text-xs bg-yellow-100 text-gray-700 px-1.5 py-0.5 rounded-full shrink-0">In Progress</span>
                    )}
                    {c.units && (
                      <span className="text-xs text-gray-400 shrink-0 ml-auto">{c.units}u</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {remaining.length > 1 && (
            <p className="text-xs text-gray-500 pl-1">Options are equivalent, choose whichever fits your schedule.</p>
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
        if (data && data.length > 0) {
          setSelectedTarget(data[0].target)
        }
      })
      .catch(() => setError('Failed to load results. Make sure you have saved schools and classes.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="space-y-3">
        <p className="text-[11px] font-mono text-gray-400 uppercase tracking-widest mb-4">Fetching from ASSIST.org...</p>
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="skeleton h-11 w-full" />
            <div className="p-4 space-y-2">
              {[...Array(i === 1 ? 3 : i === 2 ? 2 : 1)].map((_, j) => (
                <div key={j} className="skeleton h-10 rounded-lg w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="border-l-2 border-red-400 pl-5 py-4">
        <p className="text-sm font-semibold text-gray-900 mb-0.5">Could not load results</p>
        <p className="text-xs text-gray-400">{error}</p>
      </div>
    )
  }

  if (!results || results.length === 0) {
    return (
      <div className="border-l-2 border-gray-200 pl-5 py-4">
        <p className="text-sm font-semibold text-gray-900 mb-0.5">No transfer targets set</p>
        <p className="text-xs text-gray-400">Add schools and majors in the Transfer Targets tab.</p>
      </div>
    )
  }

  const targetColorMap = new Map<string, number>()
  results.forEach((r, i) => targetColorMap.set(r.target, i % BADGE_COLORS.length))

  const aggregated = buildAggregated(results, targetColorMap, (r) => r.requirements)
  const aggregatedRec = buildAggregated(results, targetColorMap, (r) => r.recommended)

  const isCalgetcReq = (req: AggregatedReq) => req.badges.some((b) => b.receiving_code.startsWith('CALGETC_'))
  const isGolden4Req = (req: AggregatedReq) => req.badges.some((b) => GOLDEN_4_CODES.has(b.receiving_code))

  const hasCalgetc = aggregated.some(isCalgetcReq)
  const hasCsu = results.some((r) => r.is_csu)
  const isCalgetcView = selectedTarget === CALGETC_FILTER
  const isGolden4View = selectedTarget === GOLDEN4_FILTER
  const isSpecialView = isCalgetcView || isGolden4View

  const visibleResults = isSpecialView
    ? []
    : selectedTarget ? results.filter((r) => r.target === selectedTarget) : results
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
  const unsatisfiedElectiveGroups = electiveGroups.filter((g) => !g.series.some((s) => s.satisfied))
  const satisfiedElectiveGroups = electiveGroups.filter((g) => g.series.some((s) => s.satisfied))

  const visible = (() => {
    if (isCalgetcView) return aggregated.filter(isCalgetcReq)
    if (isGolden4View) return aggregated.filter(isGolden4Req)
    const schoolReqs = aggregated.filter((r) => !isCalgetcReq(r))
    return selectedTarget
      ? schoolReqs.filter((r) => r.badges.some((b) => b.target === selectedTarget))
      : schoolReqs
  })()

  const visibleRec = (() => {
    if (isSpecialView) return []
    return selectedTarget
      ? aggregatedRec.filter((r) => r.badges.some((b) => b.target === selectedTarget))
      : aggregatedRec
  })()

  const unsatisfied = visible.filter((r) => !r.satisfied && !r.no_articulation)
  const satisfied = visible.filter((r) => r.satisfied)
  const noArticulation = visible.filter((r) => r.no_articulation)

  const unsatisfiedRec = visibleRec.filter((r) => !r.satisfied && !r.no_articulation)
  const satisfiedRec = visibleRec.filter((r) => r.satisfied)

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight mb-1">Requirements</h2>
          <p className="text-gray-400 text-sm">
            {isCalgetcView
              ? 'General education areas required for UC, CSU, and AICCU transfer.'
              : isGolden4View
                ? 'CSU Golden 4. Must be completed with C- or higher before transfer.'
                : 'All classes you still need across your transfer targets.'}
          </p>
        </div>
        <button onClick={load} className="text-sm text-gray-400 hover:text-gray-700 font-medium transition-colors duration-150 px-3 py-1.5 rounded-xl hover:bg-white shrink-0">
          Refresh
        </button>
      </div>

      <div className="flex gap-2 flex-wrap mb-6 items-center">
        {results.map((r) => {
          const colorIdx = targetColorMap.get(r.target) ?? 0
          const color = BADGE_COLORS[colorIdx]
          const isActive = selectedTarget === r.target
          return (
            <button
              key={r.target}
              onClick={() => setSelectedTarget(r.target)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-150 ${
                isActive ? `${color.bg} ${color.text}` : `bg-white border border-gray-100 text-gray-500 hover:border-gray-200`
              }`}
            >
              {r.school_name}
            </button>
          )
        })}
        {(hasCalgetc || hasCsu) && <span className="w-px h-5 bg-gray-200 mx-1" />}
        {hasCalgetc && (
          <button
            onClick={() => setSelectedTarget(CALGETC_FILTER)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-150 ${
              isCalgetcView ? 'bg-emerald-100 text-gray-700' : 'bg-white border border-gray-100 text-gray-500 hover:border-gray-200'
            }`}
          >
            Cal-GETC
          </button>
        )}
        {hasCsu && (
          <button
            onClick={() => setSelectedTarget(GOLDEN4_FILTER)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-150 ${
              isGolden4View ? 'bg-amber-100 text-gray-700' : 'bg-white border border-gray-100 text-gray-500 hover:border-gray-200'
            }`}
          >
            CSU Golden 4
          </button>
        )}
      </div>

      <div className="sticky top-[109px] z-10 -mx-8 px-8 py-4 mb-6 bg-[#f5f5f7]/95 backdrop-blur border-b border-gray-200/60">
        <div className="flex items-center gap-6">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Required</span>
              <span className="text-xs font-semibold text-gray-600">
                {satisfied.length} / {satisfied.length + unsatisfied.length}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1">
              <div
                className="bg-indigo-500 h-1 rounded-full transition-all duration-500"
                style={{ width: `${satisfied.length + unsatisfied.length > 0 ? (satisfied.length / (satisfied.length + unsatisfied.length)) * 100 : 0}%` }}
              />
            </div>
          </div>
          <div className="w-px h-6 bg-gray-200 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Recommended</span>
              <span className="text-xs font-semibold text-gray-600">
                {satisfiedRec.length} / {satisfiedRec.length + unsatisfiedRec.length}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1">
              <div
                className="bg-violet-500 h-1 rounded-full transition-all duration-500"
                style={{ width: `${satisfiedRec.length + unsatisfiedRec.length > 0 ? (satisfiedRec.length / (satisfiedRec.length + unsatisfiedRec.length)) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-2.5">Hover a badge for the major name. If multiple options appear, pick any one.</p>
      </div>

      {unsatisfied.length > 0 && (
        <div className="mb-4 bg-white rounded-2xl border border-gray-100 overflow-hidden animate-fade-up stagger-1">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900 tracking-tight">Required - Have Not Completed</p>
              <p className="text-xs text-gray-400 mt-0.5">Must complete for admission</p>
            </div>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
              {unsatisfied.length}
            </span>
          </div>
          <div className="p-4 space-y-2">
            {unsatisfied.map((req) => (
              <AggregatedRequirementRow key={req.key} req={req} />
            ))}
          </div>
        </div>
      )}

      {(unsatisfiedRec.length > 0 || unsatisfiedElectiveGroups.length > 0) && (
        <div className="mb-4 bg-white rounded-2xl border border-gray-100 overflow-hidden animate-fade-up stagger-2">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900 tracking-tight">Recommended - Have Not Completed</p>
              <p className="text-xs text-gray-400 mt-0.5">Not required, but saves units after transfer</p>
            </div>
            <span className="text-xs font-bold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-full">
              {unsatisfiedRec.length + unsatisfiedElectiveGroups.reduce((n, g) => n + g.series.length, 0)}
            </span>
          </div>
          <div className="p-4 space-y-2 bg-white">
            {unsatisfiedRec.map((req) => (
              <AggregatedRequirementRow key={req.key} req={req} />
            ))}
            {unsatisfiedElectiveGroups.map((group) => (
              <div key={group.label} className="rounded-2xl border border-violet-100 overflow-hidden">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 pt-3 pb-1">{group.label}</p>
                <div className="p-3 space-y-2">
                  {group.series.map((s) => (
                    <div key={s.name} className={`rounded-xl border px-4 py-3 ${s.satisfied ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.satisfied ? 'bg-green-100 text-gray-700' : 'bg-white text-gray-500 border border-gray-200'}`}>
                          {s.completed_count}/{s.total} done
                        </span>
                      </div>
                      <div className="space-y-1">
                        {[...s.courses].sort((a, b) => a.code.localeCompare(b.code)).map((c, ci) => (
                          <div key={ci} className="flex items-center gap-2">
                            {c.completed
                              ? <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0"><span className="text-white text-xs font-bold">✓</span></span>
                              : <span className="w-5 h-5 rounded-full border-2 border-gray-200 shrink-0" />
                            }
                            <span className={`font-mono text-sm font-semibold ${c.completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{c.code}</span>
                            {c.in_progress && (
                              <span className="text-xs bg-yellow-100 text-gray-700 px-1.5 py-0.5 rounded-full">In Progress</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {satisfied.length > 0 && (
        <div className="mb-4 bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900 tracking-tight">Completed Required</p>
              <p className="text-xs text-gray-400 mt-0.5">Required courses you have already finished</p>
            </div>
            <span className="text-xs font-bold text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
              {satisfied.length}
            </span>
          </div>
          <div className="p-4 space-y-2">
            {satisfied.map((req) => (
              <AggregatedRequirementRow key={req.key} req={req} />
            ))}
          </div>
        </div>
      )}

      {(satisfiedRec.length > 0 || satisfiedElectiveGroups.length > 0) && (
        <div className="mb-4 bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900 tracking-tight">Completed Recommended</p>
              <p className="text-xs text-gray-400 mt-0.5">Recommended courses you have already finished</p>
            </div>
            <span className="text-xs font-bold text-gray-500 bg-gray-50 px-2.5 py-1 rounded-full">
              {satisfiedRec.length + satisfiedElectiveGroups.length}
            </span>
          </div>
          <div className="p-4 space-y-2">
            {satisfiedRec.map((req) => (
              <AggregatedRequirementRow key={req.key} req={req} />
            ))}
            {satisfiedElectiveGroups.map((group) => (
              <div key={group.label} className="rounded-xl border border-green-100 bg-green-50 px-4 py-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">{group.label}</p>
                {group.series.filter((s) => s.satisfied).map((s) => (
                  <div key={s.name} className="space-y-1">
                    <p className="text-sm font-semibold text-gray-700 mb-1">{s.name} — completed</p>
                    {[...s.courses].sort((a, b) => a.code.localeCompare(b.code)).map((c, ci) => (
                      <div key={ci} className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0"><span className="text-white text-xs font-bold">✓</span></span>
                        <span className="font-mono text-sm font-semibold text-gray-500 line-through">{c.code}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {unsatisfied.length === 0 && satisfied.length === 0 && unsatisfiedRec.length === 0 && satisfiedRec.length === 0 && (
        <div className="bg-green-50 border border-green-100 rounded-2xl p-5 text-center">
          <p className="text-gray-900 font-semibold">All requirements satisfied!</p>
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
