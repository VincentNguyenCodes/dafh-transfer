import { useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import ScheduleBuilder, { type ClassItem, type Quarter } from './ScheduleBuilder'

type CourseItem = {
  code: string
  name: string
  units: number | null
  school: string
  completed: boolean
  in_progress: boolean
}

type Option = { courses: CourseItem[]; satisfied: boolean }

type Requirement = {
  receiving_code: string
  receiving_name: string
  no_articulation: boolean
  satisfied: boolean
  options: Option[]
  school: string
}

type ElectiveSeries = {
  name: string
  courses: { code: string; completed: boolean; in_progress: boolean }[]
  completed_count: number
  total: number
  satisfied: boolean
}

type ElectiveGroup = { label: string; series: ElectiveSeries[] }

type TargetResult = {
  target: string
  school_name: string
  major_name: string
  requirements: Requirement[]
  recommended: Requirement[]
  elective_series: ElectiveGroup[]
}

type ClassBankItem = ClassItem

type Props = {
  scheduleType: 'custom' | 'optimal'
  onCancel: () => void
  onSaved: () => void
}

function requirementKey(req: Requirement): string {
  return req.options.flatMap((o) => o.courses.map((c) => c.code)).sort().join('|')
}

function normalizeCode(code: string): string {
  const parts = code.split(/\s+/)
  if (parts.length < 2) return code
  const last = parts[parts.length - 1].replace(/^[DF]0*/, '').replace(/\.$/, '')
  return [...parts.slice(0, -1), last].join(' ')
}

function electiveGroupKey(group: ElectiveGroup): string {
  return 'elective:' + group.label + '|' + group.series
    .flatMap((s) => s.courses.map((c) => c.code))
    .sort()
    .join('|')
}

type TranscriptEntry = {
  id: number
  school: string
  course_code: string
  course_name: string
  units: string | null
  grade: string
  status: string
  term: string
}

export default function ScheduleWizard({ scheduleType, onCancel, onSaved }: Props) {
  const [results, setResults] = useState<TargetResult[] | null>(null)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picks, setPicks] = useState<Record<string, number>>({})
  const [electivePicks, setElectivePicks] = useState<Record<string, number>>({})
  const [stage, setStage] = useState<'picking' | 'building'>('picking')
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    Promise.all([api.get('/results/'), api.get('/transcript/')])
      .then(([r, t]) => {
        setResults(r.data)
        setTranscript(t.data)
      })
      .catch(() => setError('Failed to load your requirements.'))
      .finally(() => setLoading(false))
  }, [])

  const multiOptionReqs = useMemo(() => {
    if (!results) return []
    const map = new Map<string, { req: Requirement; targets: Set<string>; key: string; remainingCounts: number[]; kind: 'required' | 'recommended' }>()
    const addFrom = (reqs: Requirement[], schoolName: string, kind: 'required' | 'recommended') => {
      for (const req of reqs) {
        if (req.no_articulation || req.options.length <= 1) continue
        const key = requirementKey(req)
        const existing = map.get(key)
        if (existing) {
          existing.targets.add(schoolName)
        } else {
          const remainingCounts = req.options.map((o) => o.courses.filter((c) => !c.completed).length)
          map.set(key, { req, targets: new Set([schoolName]), key, remainingCounts, kind })
        }
      }
    }
    for (const r of results) {
      addFrom(r.requirements, r.school_name, 'required')
      addFrom(r.recommended, r.school_name, 'recommended')
    }
    return Array.from(map.values())
  }, [results])

  const electiveGroups = useMemo(() => {
    if (!results) return []
    const map = new Map<string, { group: ElectiveGroup; targets: Set<string>; key: string }>()
    for (const r of results) {
      for (const group of r.elective_series) {
        const key = electiveGroupKey(group)
        const existing = map.get(key)
        if (existing) {
          existing.targets.add(r.school_name)
        } else {
          map.set(key, { group, targets: new Set([r.school_name]), key })
        }
      }
    }
    return Array.from(map.values())
  }, [results])

  const visibleReqs = useMemo(() => {
    if (scheduleType === 'custom') return multiOptionReqs
    return multiOptionReqs.filter((m) => {
      const min = Math.min(...m.remainingCounts)
      return m.remainingCounts.filter((c) => c === min).length > 1
    })
  }, [scheduleType, multiOptionReqs])

  const visibleElectives = useMemo(() => electiveGroups, [electiveGroups])

  useEffect(() => {
    if (!results) return
    const auto: Record<string, number> = {}
    for (const m of multiOptionReqs) {
      const min = Math.min(...m.remainingCounts)
      const tied = m.remainingCounts.map((c, i) => c === min ? i : -1).filter((i) => i >= 0)
      if (scheduleType === 'optimal') {
        if (tied.length === 1) auto[m.key] = tied[0]
      } else {
        auto[m.key] = tied[0]
      }
    }
    setPicks((p) => ({ ...auto, ...p }))
  }, [scheduleType, results, multiOptionReqs])

  const allPicked =
    visibleReqs.every((m) => picks[m.key] !== undefined) &&
    visibleElectives.every((e) => electivePicks[e.key] !== undefined)

  const completedCodes = useMemo(() => {
    const s = new Set<string>()
    for (const t of transcript) {
      if (t.status === 'completed' || t.status === 'in_progress') {
        s.add(t.course_code)
        s.add(normalizeCode(t.course_code))
      }
    }
    return s
  }, [transcript])

  const isTaken = (code: string) => completedCodes.has(code) || completedCodes.has(normalizeCode(code))

  const classBank: ClassBankItem[] = useMemo(() => {
    if (!results) return []
    const bank = new Map<string, { code: string; name: string; units: number | null; needed_for: Set<string>; kind: 'required' | 'recommended' }>()
    const add = (code: string, name: string, units: number | null, target: string, kind: 'required' | 'recommended') => {
      if (isTaken(code)) return
      const existing = bank.get(code)
      if (existing) {
        if (target) existing.needed_for.add(target)
        if (!existing.units && units != null) existing.units = units
        if ((!existing.name || existing.name === existing.code) && name && name !== code) existing.name = name
        if (kind === 'required') existing.kind = 'required'
      } else {
        bank.set(code, { code, name, units, needed_for: new Set(target ? [target] : []), kind })
      }
    }
    const pickOption = (req: Requirement) => {
      if (req.options.length <= 1) return req.options[0]
      const k = requirementKey(req)
      const idx = picks[k] ?? (scheduleType === 'optimal'
        ? req.options.map((o) => o.courses.filter((c) => !c.completed).length).indexOf(Math.min(...req.options.map((o) => o.courses.filter((c) => !c.completed).length)))
        : 0)
      return req.options[idx] || req.options[0]
    }
    for (const r of results) {
      for (const req of r.requirements) {
        if (req.no_articulation) continue
        const opt = pickOption(req)
        if (!opt) continue
        for (const c of opt.courses) add(c.code, c.name, c.units, r.school_name, 'required')
      }
      for (const rec of r.recommended) {
        if (rec.no_articulation) continue
        const opt = pickOption(rec)
        if (!opt) continue
        for (const c of opt.courses) add(c.code, c.name, c.units, r.school_name, 'recommended')
      }
      for (const group of r.elective_series) {
        const k = electiveGroupKey(group)
        const idx = electivePicks[k]
        const series = idx !== undefined ? group.series[idx] : group.series.find((s) => s.satisfied) || group.series[0]
        if (!series) continue
        for (const c of series.courses) add(c.code, c.code, null, r.school_name, 'recommended')
      }
    }
    return Array.from(bank.values()).map((c) => ({ ...c, needed_for: Array.from(c.needed_for) }))
  }, [results, picks, electivePicks, scheduleType, completedCodes])

  const initialQuarters: Quarter[] = useMemo(() => {
    const byTerm: Record<string, string[]> = {}
    for (const t of transcript) {
      if (!t.term) continue
      if (t.status !== 'completed' && t.status !== 'in_progress') continue
      if (!byTerm[t.term]) byTerm[t.term] = []
      if (!byTerm[t.term].includes(t.course_code)) byTerm[t.term].push(t.course_code)
    }
    return Object.entries(byTerm)
      .map(([termStr, codes]) => {
        const [term, yearStr] = termStr.split(' ')
        const validTerm = (['Fall', 'Winter', 'Spring', 'Summer'].includes(term) ? term : 'Fall') as Quarter['term']
        return {
          id: `q-${termStr.replace(/\s/g, '-')}`,
          term: validTerm,
          year: parseInt(yearStr, 10) || new Date().getFullYear(),
          class_codes: codes,
        }
      })
      .sort((a, b) => {
        const order = { Winter: 0, Spring: 1, Summer: 2, Fall: 3 }
        if (a.year !== b.year) return a.year - b.year
        return order[a.term] - order[b.term]
      })
  }, [transcript])

  const taken: ClassItem[] = useMemo(() => transcript
    .filter((t) => t.status === 'completed' || t.status === 'in_progress')
    .map((t) => ({
      code: t.course_code,
      name: t.course_name || t.course_code,
      units: t.units ? parseFloat(t.units) : null,
      needed_for: [],
    })), [transcript])

  const save = async (quarters: Quarter[], remainingBank: ClassItem[]) => {
    setSaving(true)
    setError('')
    try {
      await api.post('/schedules/', {
        name,
        schedule_type: scheduleType,
        quarters,
        class_bank: remainingBank,
      })
      onSaved()
    } catch (err: unknown) {
      const errAxios = err as { response?: { data?: { error?: string } } }
      setError(errAxios?.response?.data?.error || 'Failed to save schedule.')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-gray-500 text-sm">Loading your requirements...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
        <p className="text-gray-900 font-medium text-sm mb-1">Could not load</p>
        <p className="text-gray-600 text-xs">{error}</p>
        <button onClick={onCancel} className="mt-3 text-sm text-gray-700 hover:text-gray-900 font-medium">Back to schedules</button>
      </div>
    )
  }

  if (stage === 'building') {
    return (
      <ScheduleBuilder
        classBank={classBank}
        prePlaced={taken}
        initialQuarters={initialQuarters}
        name={name}
        onNameChange={setName}
        onBack={() => setStage('picking')}
        onSave={save}
        saving={saving}
        error={error}
      />
    )
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            {scheduleType === 'custom' ? 'Create custom schedule' : 'Create optimal schedule'}
          </h2>
          <p className="text-gray-500 text-sm">
            {scheduleType === 'custom'
              ? 'Pick which option you want for each requirement that has alternatives.'
              : 'We auto-picked options that minimize classes. You decide on ties.'}
          </p>
        </div>
        <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
      </div>

      {visibleReqs.length === 0 && visibleElectives.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 text-center mb-6">
          <p className="text-gray-700 font-semibold mb-1">Nothing to pick</p>
          <p className="text-gray-500 text-sm">
            {scheduleType === 'optimal' ? 'No ties to resolve.' : 'None of your requirements have alternatives.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {visibleReqs.map((m) => (
            <PickerCard
              key={m.key}
              title={m.req.receiving_name || m.req.receiving_code}
              subtitle={`${m.kind === 'recommended' ? 'recommended' : 'required'} for ${Array.from(m.targets).join(', ')}`}
              options={m.req.options}
              selected={picks[m.key]}
              onSelect={(idx) => setPicks((p) => ({ ...p, [m.key]: idx }))}
            />
          ))}
          {visibleElectives.map((e) => (
            <PickerCard
              key={e.key}
              title={e.group.label}
              subtitle={`required for ${Array.from(e.targets).join(', ')}`}
              options={e.group.series.map((s) => ({
                courses: s.courses.map((c) => ({ code: c.code, name: c.code, units: null, school: '', completed: c.completed, in_progress: c.in_progress })),
                satisfied: s.satisfied,
                seriesName: s.name,
              }))}
              selected={electivePicks[e.key]}
              onSelect={(idx) => setElectivePicks((p) => ({ ...p, [e.key]: idx }))}
            />
          ))}
        </div>
      )}

      <div className="sticky bottom-0 -mx-8 px-8 py-3 bg-white border-t border-gray-100 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {allPicked ? 'All picked, ready to continue' : `${visibleReqs.filter((m) => picks[m.key] !== undefined).length + visibleElectives.filter((e) => electivePicks[e.key] !== undefined).length} of ${visibleReqs.length + visibleElectives.length} picked`}
        </p>
        <button
          onClick={() => setStage('building')}
          disabled={!allPicked}
          className="bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-40 hover:bg-indigo-700 transition-colors"
        >
          Next: review schedule
        </button>
      </div>
    </div>
  )
}

function PickerCard({
  title,
  subtitle,
  options,
  selected,
  onSelect,
}: {
  title: string
  subtitle: string
  options: (Option & { seriesName?: string })[]
  selected: number | undefined
  onSelect: (idx: number) => void
}) {
  return (
    <div className="rounded-xl border border-gray-100 px-4 py-3 bg-white shadow-sm">
      <div className="mb-2">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      <div className="space-y-1">
        {(() => {
          const remainingCounts = options.map((opt) => opt.courses.filter((c) => !c.completed).length)
          const minRemaining = Math.min(...remainingCounts)
          return options.map((opt, oi) => {
            const isSelected = oi === selected
            const remaining = remainingCounts[oi]
            const isOptimal = remaining === minRemaining
            return (
              <label
                key={oi}
                className={`flex items-start gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  isSelected ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                <input
                  type="radio"
                  checked={isSelected}
                  onChange={() => onSelect(oi)}
                  className="accent-indigo-600 mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {opt.seriesName && <p className="text-xs font-semibold text-gray-700">{opt.seriesName}</p>}
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      isOptimal ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {remaining === 0 ? 'Already done' : `${remaining} class${remaining === 1 ? '' : 'es'} to take`}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    {opt.courses.map((c, ci) => (
                      <span key={ci} className="flex items-center gap-1.5">
                        {ci > 0 && <span className="text-xs text-gray-400">+</span>}
                        <span className={`font-mono text-sm font-semibold ${c.completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{c.code}</span>
                        {c.name && c.name !== c.code && <span className="text-xs text-gray-500">{c.name}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              </label>
            )
          })
        })()}
      </div>
    </div>
  )
}

