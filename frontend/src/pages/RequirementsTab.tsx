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

function CourseChip({ c, style }: { c: CourseItem; style: string }) {
  return (
    <span className="relative group/chip inline-block">
      <span className={style}>{c.code}</span>
      {(c.name || c.units) && (
        <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-[300] opacity-0 group-hover/chip:opacity-100 transition-opacity duration-150">
          <div
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 whitespace-nowrap"
            style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 8px 28px -4px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)' }}
          >
            <span className="text-xs font-bold text-gray-900 font-mono shrink-0">{c.code}</span>
            {c.name && c.name !== c.code && (
              <>
                <span className="w-px h-3 bg-gray-200 shrink-0" />
                <span className="text-xs text-gray-600 max-w-[260px] truncate">{c.name}</span>
              </>
            )}
            {c.units && (
              <>
                <span className="w-px h-3 bg-gray-200 shrink-0" />
                <span className="text-[11px] font-semibold text-gray-400 shrink-0">{c.units}u</span>
              </>
            )}
          </div>
        </div>
      )}
    </span>
  )
}

function SchoolTags({ badges }: { badges: Badge[] }) {
  return (
    <div className="flex gap-1 shrink-0 ml-2 flex-wrap justify-end">
      {badges.slice(0, 3).map((b, i) => {
        const color = BADGE_COLORS[b.colorIdx]
        return (
          <span
            key={i}
            title={`${b.major_name}${b.receiving_name ? ` · ${b.receiving_name}` : ''}`}
            className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${color.bg} ${color.text} ${b.satisfied ? 'opacity-40' : ''} whitespace-nowrap`}
          >
            {b.school_name}
          </span>
        )
      })}
    </div>
  )
}

function AggregatedRequirementRow({ req }: { req: AggregatedReq }) {
  const remaining = req.options.filter((o) => !o.satisfied)

  if (req.no_articulation) {
    return (
      <div className="flex items-center gap-3 py-2 px-4 hover:bg-black/[0.02] transition-colors">
        <div className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
        <span className="text-xs text-gray-400 italic flex-1">No community college articulation</span>
        <SchoolTags badges={req.badges} />
      </div>
    )
  }

  if (req.satisfied) {
    const completedOpt = req.options.find((o) => o.satisfied)
    const courses = [...(completedOpt?.courses ?? [])].sort((a, b) => a.code.localeCompare(b.code))
    return (
      <div className="flex items-center gap-3 py-2 px-4 hover:bg-black/[0.02] transition-colors">
        <svg className="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          {courses.map((c, ci) => (
            <span key={ci} className="flex items-center gap-1">
              {ci > 0 && <span className="text-[10px] text-gray-300 font-bold">+</span>}
              <CourseChip c={c} style="font-mono text-[11px] font-bold text-gray-400 line-through cursor-default" />
              {c.units && <span className="text-[10px] text-gray-300">{c.units}u</span>}
            </span>
          ))}
          {courses.length === 1 && courses[0].name && (
            <span className="text-[11px] text-gray-400 truncate max-w-[220px]">{courses[0].name}</span>
          )}
        </div>
        <SchoolTags badges={req.badges} />
      </div>
    )
  }

  if (remaining.length > 1) {
    return (
      <div className="flex items-center gap-3 py-2 px-4 hover:bg-black/[0.02] transition-colors flex-wrap">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
        <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide shrink-0">Pick one</span>
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          {remaining.map((opt, oi) => (
            <span key={oi} className="flex items-center gap-1.5">
              {oi > 0 && <span className="text-[10px] font-bold text-gray-300 px-1">or</span>}
              <span className="text-[10px] font-mono text-gray-400 shrink-0">{String.fromCharCode(65 + oi)}</span>
              {[...opt.courses].sort((a, b) => a.code.localeCompare(b.code)).map((c, ci) => (
                <span key={ci} className="flex items-center gap-1">
                  {ci > 0 && <span className="text-[10px] text-gray-300 font-bold">+</span>}
                  <CourseChip c={c} style={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded cursor-default ${c.completed ? 'text-gray-400 line-through' : 'bg-indigo-50 text-indigo-800'}`} />
                  {c.in_progress && <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded">→</span>}
                </span>
              ))}
            </span>
          ))}
        </div>
        <SchoolTags badges={req.badges} />
      </div>
    )
  }

  const opt = remaining[0]
  const courses = [...(opt?.courses ?? [])].sort((a, b) => a.code.localeCompare(b.code))
  return (
    <div className="flex items-center gap-3 py-2 px-4 hover:bg-black/[0.02] transition-colors">
      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        {courses.map((c, ci) => (
          <span key={ci} className="flex items-center gap-1.5">
            {ci > 0 && <span className="text-[10px] text-gray-400 font-bold">+</span>}
            <CourseChip c={c} style={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded cursor-default ${c.completed ? 'text-gray-400 line-through bg-gray-100' : 'bg-indigo-50 text-indigo-800'}`} />
            {c.in_progress && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 rounded font-medium">In Progress</span>}
            {c.units && <span className="text-[10px] text-gray-400">{c.units}u</span>}
          </span>
        ))}
        {courses.length === 1 && courses[0].name && (
          <span className="text-[11px] text-gray-500 truncate max-w-[220px]">{courses[0].name}</span>
        )}
      </div>
      <SchoolTags badges={req.badges} />
    </div>
  )
}

export default function RequirementsTab({ defaultFilter }: { defaultFilter?: string } = {}) {
  const [results, setResults] = useState<TargetResult[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedTarget, setSelectedTarget] = useState<string | null>(defaultFilter ?? null)

  const load = () => {
    setLoading(true)
    setError('')
    api.get('/results/')
      .then(({ data }) => {
        setResults(data)
        if (!defaultFilter && data && data.length > 0) {
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

  const reqPct = satisfied.length + unsatisfied.length > 0 ? (satisfied.length / (satisfied.length + unsatisfied.length)) * 100 : 0
  const recPct = satisfiedRec.length + unsatisfiedRec.length > 0 ? (satisfiedRec.length / (satisfiedRec.length + unsatisfiedRec.length)) * 100 : 0

  const SectionHeader = ({ dot, label, count, countColor }: { dot: string; label: string; count: number; countColor: string }) => (
    <div className="flex items-center gap-2 mb-1 px-1">
      <div className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex-1">{label}</span>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${countColor}`}>{count}</span>
    </div>
  )

  const RowList = ({ children }: { children: React.ReactNode }) => (
    <div className="glass rounded-xl overflow-hidden divide-y divide-white/40">{children}</div>
  )

  return (
    <div>
      <div className="sticky top-[109px] z-10 -mx-8 px-8 py-2.5 mb-4" style={{ background: 'rgba(245,245,247,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.6)' }}>
        <div className="flex items-center gap-4 mb-2">
          <div className="flex gap-2 flex-wrap items-center flex-1 min-w-0">
            {results.map((r) => {
              const colorIdx = targetColorMap.get(r.target) ?? 0
              const color = BADGE_COLORS[colorIdx]
              const isActive = selectedTarget === r.target
              return (
                <button key={r.target} onClick={() => setSelectedTarget(r.target)} className={`px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150 cursor-pointer ${isActive ? `${color.bg} ${color.text}` : 'bg-white/60 border border-white/60 text-gray-500 hover:border-gray-200'}`}>
                  {r.school_name}
                </button>
              )
            })}
            {(hasCalgetc || hasCsu) && <span className="w-px h-4 bg-gray-200 mx-0.5" />}
            {hasCalgetc && (
              <button onClick={() => setSelectedTarget(CALGETC_FILTER)} className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${isCalgetcView ? 'bg-emerald-100 text-emerald-700' : 'bg-white/60 border border-white/60 text-gray-500 hover:border-gray-200'}`}>Cal-GETC</button>
            )}
            {hasCsu && (
              <button onClick={() => setSelectedTarget(GOLDEN4_FILTER)} className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${isGolden4View ? 'bg-amber-100 text-amber-700' : 'bg-white/60 border border-white/60 text-gray-500 hover:border-gray-200'}`}>Golden 4</button>
            )}
          </div>
          <button onClick={load} className="text-xs text-gray-400 hover:text-gray-600 font-medium cursor-pointer px-2 py-1 rounded-lg hover:bg-white/50 transition-all shrink-0">Refresh</button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <div className="flex-1 bg-gray-200/50 rounded-full h-1.5">
              <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${reqPct}%` }} />
            </div>
            <span className="text-[11px] font-bold text-indigo-600 shrink-0 w-14 text-right">{satisfied.length}/{satisfied.length + unsatisfied.length} req</span>
          </div>
          <div className="w-px h-4 bg-gray-200 shrink-0" />
          <div className="flex items-center gap-2 flex-1">
            <div className="flex-1 bg-gray-200/50 rounded-full h-1.5">
              <div className="bg-violet-400 h-1.5 rounded-full transition-all duration-500" style={{ width: `${recPct}%` }} />
            </div>
            <span className="text-[11px] font-bold text-violet-500 shrink-0 w-14 text-right">{satisfiedRec.length}/{satisfiedRec.length + unsatisfiedRec.length} rec</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {unsatisfied.length > 0 && (
          <div className="animate-fade-up stagger-1">
            <SectionHeader dot="bg-indigo-500" label="Still Needed — Required" count={unsatisfied.length} countColor="bg-indigo-500 text-white" />
            <RowList>
              {unsatisfied.map((req) => <AggregatedRequirementRow key={req.key} req={req} />)}
            </RowList>
          </div>
        )}

        {(unsatisfiedRec.length > 0 || unsatisfiedElectiveGroups.length > 0) && (
          <div className="animate-fade-up stagger-2">
            <SectionHeader dot="bg-violet-400" label="Still Needed — Recommended" count={unsatisfiedRec.length + unsatisfiedElectiveGroups.reduce((n, g) => n + g.series.length, 0)} countColor="bg-violet-100 text-violet-700" />
            <RowList>
              {unsatisfiedRec.map((req) => <AggregatedRequirementRow key={req.key} req={req} />)}
              {unsatisfiedElectiveGroups.map((group) => (
                <div key={group.label}>
                  <div className="px-4 py-1.5 glass-header">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{group.label}</span>
                  </div>
                  {group.series.map((s) => (
                    <div key={s.name} className="flex items-center gap-3 py-2 px-4 hover:bg-black/[0.02] transition-colors">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.satisfied ? 'bg-green-400' : 'bg-gray-300'}`} />
                      <span className="text-xs font-semibold text-gray-700 flex-1">{s.name}</span>
                      <div className="flex gap-1 flex-wrap">
                        {[...s.courses].sort((a,b) => a.code.localeCompare(b.code)).map((c, ci) => (
                          <span key={ci} className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${c.completed ? 'bg-green-100 text-green-700 line-through' : 'bg-gray-100 text-gray-600'}`}>{c.code}</span>
                        ))}
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${s.satisfied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{s.completed_count}/{s.total}</span>
                    </div>
                  ))}
                </div>
              ))}
            </RowList>
          </div>
        )}

        {satisfied.length > 0 && (
          <div>
            <SectionHeader dot="bg-green-400" label="Completed — Required" count={satisfied.length} countColor="bg-green-100 text-green-700" />
            <RowList>
              {satisfied.map((req) => <AggregatedRequirementRow key={req.key} req={req} />)}
            </RowList>
          </div>
        )}

        {(satisfiedRec.length > 0 || satisfiedElectiveGroups.length > 0) && (
          <div>
            <SectionHeader dot="bg-gray-300" label="Completed — Recommended" count={satisfiedRec.length + satisfiedElectiveGroups.length} countColor="bg-gray-100 text-gray-500" />
            <RowList>
              {satisfiedRec.map((req) => <AggregatedRequirementRow key={req.key} req={req} />)}
              {satisfiedElectiveGroups.map((group) =>
                group.series.filter((s) => s.satisfied).map((s) => (
                  <div key={`${group.label}-${s.name}`} className="flex items-center gap-3 py-2 px-4 hover:bg-black/[0.02] transition-colors">
                    <svg className="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-xs text-gray-500 flex-1">{s.name}</span>
                    <div className="flex gap-1 flex-wrap">
                      {[...s.courses].sort((a,b) => a.code.localeCompare(b.code)).map((c, ci) => (
                        <span key={ci} className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-600 line-through">{c.code}</span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </RowList>
          </div>
        )}

        {noArticulation.length > 0 && (
          <div>
            <SectionHeader dot="bg-gray-200" label="No Articulation Path" count={noArticulation.length} countColor="bg-gray-100 text-gray-400" />
            <RowList>
              {noArticulation.map((req) => <AggregatedRequirementRow key={req.key} req={req} />)}
            </RowList>
          </div>
        )}

        {unsatisfied.length === 0 && satisfied.length === 0 && unsatisfiedRec.length === 0 && satisfiedRec.length === 0 && (
          <div className="glass rounded-2xl p-10 text-center">
            <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-900 mb-1">All requirements satisfied!</p>
            <p className="text-xs text-gray-400">You have completed everything needed for this transfer target.</p>
          </div>
        )}
      </div>
    </div>
  )
}
