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

function electiveGroupKey(group: ElectiveGroup): string {
  return 'elective:' + group.label + '|' + group.series
    .flatMap((s) => s.courses.map((c) => c.code))
    .sort()
    .join('|')
}

export default function ScheduleWizard({ scheduleType, onCancel, onSaved }: Props) {
  const [results, setResults] = useState<TargetResult[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picks, setPicks] = useState<Record<string, number>>({})
  const [electivePicks, setElectivePicks] = useState<Record<string, number>>({})
  const [stage, setStage] = useState<'picking' | 'building'>('picking')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/results/')
      .then(({ data }) => setResults(data))
      .catch(() => setError('Failed to load your requirements.'))
      .finally(() => setLoading(false))
  }, [])

  const multiOptionReqs = useMemo(() => {
    if (!results) return []
    const map = new Map<string, { req: Requirement; targets: Set<string>; key: string; remainingCounts: number[] }>()
    for (const r of results) {
      for (const req of r.requirements) {
        if (req.no_articulation || req.satisfied || req.options.length <= 1) continue
        const key = requirementKey(req)
        const existing = map.get(key)
        if (existing) {
          existing.targets.add(r.school_name)
        } else {
          const remainingCounts = req.options.map((o) => o.courses.filter((c) => !c.completed).length)
          map.set(key, { req, targets: new Set([r.school_name]), key, remainingCounts })
        }
      }
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
    if (scheduleType !== 'optimal' || !results) return
    const auto: Record<string, number> = {}
    for (const m of multiOptionReqs) {
      const min = Math.min(...m.remainingCounts)
      const tied = m.remainingCounts.map((c, i) => c === min ? i : -1).filter((i) => i >= 0)
      if (tied.length === 1) auto[m.key] = tied[0]
    }
    setPicks((p) => ({ ...auto, ...p }))
  }, [scheduleType, results, multiOptionReqs])

  const allPicked =
    visibleReqs.every((m) => picks[m.key] !== undefined) &&
    visibleElectives.every((e) => electivePicks[e.key] !== undefined)

  const classBank: ClassBankItem[] = useMemo(() => {
    if (!results) return []
    const bank = new Map<string, { code: string; name: string; units: number | null; needed_for: Set<string> }>()
    const add = (code: string, name: string, units: number | null, target: string) => {
      const existing = bank.get(code)
      if (existing) {
        existing.needed_for.add(target)
      } else {
        bank.set(code, { code, name, units, needed_for: new Set([target]) })
      }
    }
    for (const r of results) {
      for (const req of r.requirements) {
        if (req.no_articulation || req.satisfied) continue
        let chosenIdx = 0
        if (req.options.length > 1) {
          const k = requirementKey(req)
          chosenIdx = picks[k] ?? (scheduleType === 'optimal'
            ? req.options.map((o) => o.courses.filter((c) => !c.completed).length).indexOf(Math.min(...req.options.map((o) => o.courses.filter((c) => !c.completed).length)))
            : 0)
        }
        const opt = req.options[chosenIdx] || req.options[0]
        for (const c of opt.courses) {
          if (c.completed) continue
          add(c.code, c.name, c.units, r.school_name)
        }
      }
      for (const group of r.elective_series) {
        const k = electiveGroupKey(group)
        const idx = electivePicks[k]
        const series = idx !== undefined ? group.series[idx] : group.series.find((s) => s.satisfied) || group.series[0]
        if (!series) continue
        for (const c of series.courses) {
          if (c.completed) continue
          add(c.code, c.code, null, r.school_name)
        }
      }
    }
    return Array.from(bank.values()).map((c) => ({ ...c, needed_for: Array.from(c.needed_for) }))
  }, [results, picks, electivePicks, scheduleType])

  const save = async (quarters: Quarter[], remainingBank: ClassItem[]) => {
    setSaving(true)
    setError('')
    try {
      const count = (await api.get('/schedules/')).data.length
      const defaultName = scheduleType === 'optimal'
        ? `Optimal plan ${count + 1}`
        : `Custom plan ${count + 1}`
      await api.post('/schedules/', {
        name: defaultName,
        schedule_type: scheduleType,
        quarters,
        class_bank: remainingBank,
      })
      onSaved()
    } catch {
      setError('Failed to save schedule.')
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
              subtitle={`required for ${Array.from(m.targets).join(', ')}`}
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
        {options.map((opt, oi) => {
          const isSelected = oi === selected
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
                {opt.seriesName && <p className="text-xs font-semibold text-gray-700 mb-1">{opt.seriesName}</p>}
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
        })}
      </div>
    </div>
  )
}

