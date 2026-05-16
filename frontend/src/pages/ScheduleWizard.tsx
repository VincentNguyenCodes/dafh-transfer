import { Fragment, useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import ScheduleBuilder, { type ClassItem, type Quarter } from './ScheduleBuilder'

type CourseItem = {
  code: string
  name: string
  units: number | null
  school: string
  completed: boolean
  in_progress: boolean
  subarea?: string
  subarea_name?: string
}

type Option = { courses: CourseItem[]; satisfied: boolean }

type Requirement = {
  receiving_code: string
  receiving_name: string
  no_articulation: boolean
  satisfied: boolean
  options: Option[]
  school: string
  pick_count?: number
  rule?: string
  pre_satisfied_codes?: string[]
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
  ge_path?: string
  ge_approved_codes?: string[]
  prereq_map?: Record<string, string[]>
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

function requirementKey(req: Requirement, schoolName?: string): string {
  const code = req.receiving_code || req.options.flatMap((o) => o.courses.map((c) => c.code)).sort().join('|')
  const isGeArea = code.startsWith('CALGETC_')
  if (isGeArea) return code
  return schoolName ? `${schoolName}:${code}` : code
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [picks, setPicks] = useState<Record<string, number | number[]>>({})
  const [electivePicks, setElectivePicks] = useState<Record<string, number>>({})
  const [stage, setStage] = useState<'picking' | 'building'>('picking')
  const gePath = 'calgetc'
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    Promise.all([
      api.get(`/results/?ge_path=${gePath}`),
      api.get('/transcript/'),
    ])
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
        const pc = req.pick_count || 1
        const remainingCounts = req.options.map((o) => o.courses.filter((c) => !c.completed).length)
        if (pc <= 1) {
          const minRem = Math.min(...remainingCounts)
          if (minRem === 0) continue
        }
        const key = requirementKey(req, schoolName)
        const existing = map.get(key)
        if (existing) {
          existing.targets.add(schoolName)
        } else {
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
    const filtered = scheduleType === 'custom'
      ? multiOptionReqs
      : multiOptionReqs.filter((m) => {
          const min = Math.min(...m.remainingCounts)
          return m.remainingCounts.filter((c) => c === min).length > 1
        })
    const rank = (code: string) => {
      if (code.startsWith('CALGETC_')) return 0
      return 1
    }
    return [...filtered].sort((a, b) => {
      const ra = rank(a.req.receiving_code)
      const rb = rank(b.req.receiving_code)
      if (ra !== rb) return ra - rb
      return a.req.receiving_code.localeCompare(b.req.receiving_code, undefined, { numeric: true })
    })
  }, [scheduleType, multiOptionReqs])

  const visibleElectives = useMemo(
    () => electiveGroups.filter((e) => !e.group.series.some((s) => s.satisfied)),
    [electiveGroups],
  )

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

  useEffect(() => {
    if (!results) return

    const baseCovered = new Set<string>(completedCodes)
    for (const r of results) {
      for (const req of r.requirements) {
        if (req.no_articulation) continue
        if (req.options.length === 1) {
          for (const c of req.options[0].courses) {
            baseCovered.add(c.code)
            baseCovered.add(normalizeCode(c.code))
          }
        }
      }
    }

    const reqsByKey = new Map<string, Requirement>()
    for (const m of multiOptionReqs) reqsByKey.set(m.key, m.req)

    const initialPicks: Record<string, number | number[]> = {}
    const multiPickInits: Record<string, number[]> = {}
    for (const m of multiOptionReqs) {
      const pc = m.req.pick_count || 1
      if (pc > 1) {
        const preSat = new Set(m.req.pre_satisfied_codes || [])
        const preSelected: number[] = []
        for (let i = 0; i < m.req.options.length; i++) {
          for (const c of m.req.options[i].courses) {
            if (preSat.has(c.code) || preSat.has(normalizeCode(c.code)) || c.completed) {
              preSelected.push(i)
              break
            }
          }
        }
        multiPickInits[m.key] = preSelected
        initialPicks[m.key] = preSelected
        continue
      }
      let bestIdx = 0
      let bestCost = Infinity
      for (let i = 0; i < m.req.options.length; i++) {
        const cost = m.req.options[i].courses.filter(
          (c) => !baseCovered.has(c.code) && !baseCovered.has(normalizeCode(c.code))
        ).length
        if (cost < bestCost) {
          bestCost = cost
          bestIdx = i
        }
      }
      initialPicks[m.key] = bestIdx
    }

    const singlePickReqs = multiOptionReqs.filter((m) => (m.req.pick_count || 1) <= 1)
    let current: Record<string, number | number[]> = { ...initialPicks }
    for (let iter = 0; iter < 8; iter++) {
      let changed = false
      const next: Record<string, number | number[]> = { ...current }
      for (const m of singlePickReqs) {
        const coveredWithoutMe = new Set<string>(baseCovered)
        for (const m2 of singlePickReqs) {
          if (m2.key === m.key) continue
          const v = next[m2.key]
          const idx = typeof v === 'number' ? v : 0
          for (const c of m2.req.options[idx].courses) {
            coveredWithoutMe.add(c.code)
            coveredWithoutMe.add(normalizeCode(c.code))
          }
        }
        const currentIdx = typeof next[m.key] === 'number' ? next[m.key] as number : 0
        let bestIdx = currentIdx
        let bestCost = m.req.options[currentIdx].courses.filter(
          (c) => !coveredWithoutMe.has(c.code) && !coveredWithoutMe.has(normalizeCode(c.code))
        ).length
        for (let i = 0; i < m.req.options.length; i++) {
          if (i === bestIdx) continue
          const cost = m.req.options[i].courses.filter(
            (c) => !coveredWithoutMe.has(c.code) && !coveredWithoutMe.has(normalizeCode(c.code))
          ).length
          if (cost < bestCost) {
            bestCost = cost
            bestIdx = i
          }
        }
        if (bestIdx !== currentIdx) {
          next[m.key] = bestIdx
          changed = true
        }
      }
      current = next
      if (!changed) break
    }

    setPicks((p) => ({ ...current, ...p }))
  }, [scheduleType, results, multiOptionReqs, completedCodes])

  const multiPickValid = (req: Requirement, value: number | number[] | undefined): boolean => {
    const pc = req.pick_count || 1
    if (pc <= 1) return value !== undefined
    if (!Array.isArray(value)) return false
    if (value.length < pc) return false
    const chosen = value.map((i) => req.options[i]).filter((o): o is Option => !!o)
    if (chosen.length < pc) return false
    if (req.rule === 'at_least_one_per_subarea') {
      const subs = new Set(chosen.flatMap((o) => o.courses.map((c) => c.subarea).filter(Boolean) as string[]))
      const allSubs = new Set(req.options.flatMap((o) => o.courses.map((c) => c.subarea).filter(Boolean) as string[]))
      return Array.from(allSubs).every((s) => subs.has(s))
    }
    if (req.rule === 'different_disciplines') {
      const prefixes = new Set(chosen.flatMap((o) => o.courses.map((c) => (c.code.split(/\s+/)[0] || '').toUpperCase())))
      return prefixes.size >= 2
    }
    return true
  }

  const allPicked =
    visibleReqs.every((m) => multiPickValid(m.req, picks[m.key])) &&
    visibleElectives.every((e) => electivePicks[e.key] !== undefined)

  const isTaken = (code: string) => completedCodes.has(code) || completedCodes.has(normalizeCode(code))

  const classBank: ClassBankItem[] = useMemo(() => {
    if (!results) return []
    type BankEntry = { code: string; name: string; units: number | null; needed_for: Set<string>; kind: 'required' | 'recommended' | 'prereq'; prereq_for?: string }
    const bank = new Map<string, BankEntry>()
    const add = (code: string, name: string, units: number | null, target: string, kind: 'required' | 'recommended') => {
      if (isTaken(code)) return
      const existing = bank.get(code)
      if (existing) {
        if (target) existing.needed_for.add(target)
        if (!existing.units && units != null) existing.units = units
        if ((!existing.name || existing.name === existing.code) && name && name !== code) existing.name = name
        if (kind === 'required') existing.kind = 'required'
        else if (kind === 'recommended' && existing.kind === 'prereq') existing.kind = 'recommended'
      } else {
        bank.set(code, { code, name, units, needed_for: new Set(target ? [target] : []), kind })
      }
    }
    const pickedOptions = (req: Requirement, schoolName: string): Option[] => {
      const k = requirementKey(req, schoolName)
      const pc = req.pick_count || 1
      const raw = picks[k]
      if (pc > 1) {
        const indices = Array.isArray(raw) ? raw : []
        return indices.map((i) => req.options[i]).filter((o): o is Option => !!o)
      }
      if (req.options.length <= 1) return req.options[0] ? [req.options[0]] : []
      if (typeof raw === 'number') return req.options[raw] ? [req.options[raw]] : [req.options[0]]
      const remainingCounts = req.options.map((o) => o.courses.filter((c) => !c.completed).length)
      const minRem = Math.min(...remainingCounts)
      const fallback = req.options[remainingCounts.indexOf(minRem)] || req.options[0]
      return fallback ? [fallback] : []
    }
    const labelFor = (req: Requirement, schoolName: string) => {
      if (req.receiving_code.startsWith('CALGETC_')) return 'Cal-GETC'
      return schoolName
    }
    for (const r of results) {
      for (const req of r.requirements) {
        if (req.no_articulation) continue
        const opts = pickedOptions(req, r.school_name)
        const label = labelFor(req, r.school_name)
        for (const opt of opts) {
          for (const c of opt.courses) add(c.code, c.name, c.units, label, 'required')
        }
      }
      for (const rec of r.recommended) {
        if (rec.no_articulation) continue
        const opts = pickedOptions(rec, r.school_name)
        const label = labelFor(rec, r.school_name)
        for (const opt of opts) {
          for (const c of opt.courses) add(c.code, c.name, c.units, label, 'recommended')
        }
      }
      for (const group of r.elective_series) {
        const k = electiveGroupKey(group)
        const idx = electivePicks[k]
        const series = idx !== undefined ? group.series[idx] : group.series.find((s) => s.satisfied) || group.series[0]
        if (!series) continue
        for (const c of series.courses) add(c.code, c.code, null, r.school_name, 'recommended')
      }
    }
    const geApproved = new Set<string>()
    for (const r of results) {
      for (const code of (r.ge_approved_codes || [])) geApproved.add(code)
    }
    for (const item of bank.values()) {
      if (geApproved.has(item.code) || geApproved.has(normalizeCode(item.code))) {
        item.needed_for.add('Cal-GETC')
      }
    }
    const prereqMap = (results[0]?.prereq_map) || {}
    const lookupPrereqs = (code: string): string[] => {
      if (prereqMap[code]) return prereqMap[code]
      const norm = normalizeCode(code)
      if (prereqMap[norm]) return prereqMap[norm]
      if (code.endsWith('H')) {
        const stripped = code.slice(0, -1)
        return prereqMap[stripped] || prereqMap[normalizeCode(stripped)] || []
      }
      return []
    }
    const queue = Array.from(bank.keys())
    while (queue.length > 0) {
      const code = queue.shift()!
      const prereqs = lookupPrereqs(code)
      for (const p of prereqs) {
        if (isTaken(p)) continue
        const existing = bank.get(p)
        if (existing) {
          existing.needed_for.add(`prereq for ${code}`)
          if (!existing.prereq_for) existing.prereq_for = code
          continue
        }
        bank.set(p, {
          code: p,
          name: p,
          units: null,
          needed_for: new Set([`prereq for ${code}`]),
          kind: 'prereq',
          prereq_for: code,
        })
        queue.push(p)
      }
    }
    return Array.from(bank.values()).map((c) => ({ ...c, needed_for: Array.from(c.needed_for) }))
  }, [results, picks, electivePicks, scheduleType, completedCodes, gePath])

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
      const fullBank = new Map<string, ClassItem>()
      for (const c of remainingBank) fullBank.set(c.code, c)
      for (const c of classBank) if (!fullBank.has(c.code)) fullBank.set(c.code, c)
      for (const c of taken) if (!fullBank.has(c.code)) fullBank.set(c.code, c)
      await api.post('/schedules/', {
        name,
        schedule_type: scheduleType,
        ge_path: gePath,
        quarters,
        class_bank: Array.from(fullBank.values()),
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

      <div className="mb-4 flex items-center gap-2 text-xs text-gray-600">
        <span className="font-medium">GE pattern:</span>
        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
          Cal-GETC
        </span>
        <span className="text-gray-400">Required for UC and CSU transfer starting Fall 2025</span>
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
          {visibleReqs.map((m) => {
            const isCalgetc = m.req.receiving_code.startsWith('CALGETC_')
            const badge = isCalgetc ? 'Cal-GETC' : undefined
            return (
              <PickerCard
                key={m.key}
                title={m.req.receiving_name || m.req.receiving_code}
                subtitle={`${m.kind === 'recommended' ? 'recommended' : 'required'} for ${Array.from(m.targets).join(', ')}`}
                options={m.req.options}
                selected={picks[m.key]}
                onSelect={(value) => setPicks((p) => ({ ...p, [m.key]: value }))}
                badge={badge}
                prereqMap={results?.[0]?.prereq_map || {}}
                isTaken={isTaken}
                pickCount={m.req.pick_count || 1}
                rule={m.req.rule}
              />
            )
          })}
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
              prereqMap={results?.[0]?.prereq_map || {}}
              isTaken={isTaken}
            />
          ))}
        </div>
      )}

      <div className="sticky bottom-0 -mx-8 px-8 py-3 bg-white border-t border-gray-100 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {allPicked ? 'All picked, ready to continue' : `${visibleReqs.filter((m) => multiPickValid(m.req, picks[m.key])).length + visibleElectives.filter((e) => electivePicks[e.key] !== undefined).length} of ${visibleReqs.length + visibleElectives.length} picked`}
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
  badge,
  prereqMap,
  isTaken,
  pickCount = 1,
  rule,
}: {
  title: string
  subtitle: string
  options: (Option & { seriesName?: string })[]
  selected: number | number[] | undefined
  onSelect: (value: number | number[]) => void
  badge?: string
  prereqMap?: Record<string, string[]>
  isTaken?: (code: string) => boolean
  pickCount?: number
  rule?: string
}) {
  if (pickCount > 1) {
    return (
      <MultiPickCard
        title={title}
        subtitle={subtitle}
        options={options}
        selected={Array.isArray(selected) ? selected : []}
        onSelect={onSelect}
        badge={badge}
        pickCount={pickCount}
        rule={rule}
      />
    )
  }
  const singleSelected = typeof selected === 'number' ? selected : undefined
  const handleSelect = (idx: number) => onSelect(idx)
  const directPrereqs = (code: string) => {
    if (!prereqMap) return []
    if (prereqMap[code]) return prereqMap[code]
    const norm = normalizeCode(code)
    if (prereqMap[norm]) return prereqMap[norm]
    if (code.endsWith('H')) {
      const stripped = code.slice(0, -1)
      return prereqMap[stripped] || prereqMap[normalizeCode(stripped)] || []
    }
    return []
  }
  const computeMissingPrereqs = (codes: string[]) => {
    if (!prereqMap) return []
    const missing = new Set<string>()
    const visited = new Set(codes)
    const queue = [...codes]
    while (queue.length > 0) {
      const code = queue.shift()!
      for (const p of directPrereqs(code)) {
        if (visited.has(p)) continue
        if (isTaken && isTaken(p)) continue
        visited.add(p)
        missing.add(p)
        queue.push(p)
      }
    }
    return Array.from(missing).sort()
  }
  return (
    <div className="rounded-xl border border-gray-100 px-4 py-3 bg-white shadow-sm">
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          {badge && (
            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      <div className="space-y-1">
        {(() => {
          const missingPrereqsPerOpt = options.map((opt) =>
            computeMissingPrereqs(opt.courses.filter((c) => !c.completed).map((c) => c.code))
          )
          const remainingCounts = options.map((opt, i) =>
            opt.courses.filter((c) => !c.completed).length + missingPrereqsPerOpt[i].length
          )
          const minRemaining = Math.min(...remainingCounts)
          return options.map((opt, oi) => {
            const isSelected = oi === singleSelected
            const remaining = remainingCounts[oi]
            const isOptimal = remaining === minRemaining
            const missingPrereqs = missingPrereqsPerOpt[oi]
            if (remaining === 0) return null
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
                  onChange={() => handleSelect(oi)}
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
                    {missingPrereqs.length > 0 && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-50/60 border border-blue-200">
                        {missingPrereqs.map((p, pi) => (
                          <Fragment key={pi}>
                            {pi > 0 && <span className="text-xs text-blue-400">→</span>}
                            <span className="font-mono text-sm font-semibold text-blue-900">{p}</span>
                          </Fragment>
                        ))}
                        <span className="text-xs text-blue-400">→</span>
                      </span>
                    )}
                    {[...opt.courses].sort((a, b) => a.code.localeCompare(b.code)).map((c, ci) => (
                      <span key={ci} className="flex items-center gap-1.5">
                        {ci > 0 && <span className="text-xs text-gray-400">+</span>}
                        <span className={`font-mono text-sm font-semibold ${c.completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{c.code}</span>
                        {c.name && c.name !== c.code && <span className="text-xs text-gray-500">{c.name}</span>}
                      </span>
                    ))}
                  </div>
                  {missingPrereqs.length > 0 && (
                    <p className="text-[10px] text-blue-600 mt-1">
                      Includes {missingPrereqs.length} prereq{missingPrereqs.length === 1 ? '' : 's'}
                    </p>
                  )}
                </div>
              </label>
            )
          })
        })()}
      </div>
    </div>
  )
}

function MultiPickCard({
  title,
  subtitle,
  options,
  selected,
  onSelect,
  badge,
  pickCount,
  rule,
}: {
  title: string
  subtitle: string
  options: Option[]
  selected: number[]
  onSelect: (value: number[]) => void
  badge?: string
  pickCount: number
  rule?: string
}) {
  const toggle = (idx: number) => {
    const set = new Set(selected)
    if (set.has(idx)) set.delete(idx)
    else set.add(idx)
    onSelect(Array.from(set).sort((a, b) => a - b))
  }

  const grouped = useMemo(() => {
    const groups = new Map<string, { name: string; entries: { idx: number; opt: Option }[] }>()
    for (let i = 0; i < options.length; i++) {
      const opt = options[i]
      const c = opt.courses[0]
      const key = c?.subarea || c?.code.split(/\s+/)[0] || 'Other'
      const name = c?.subarea_name || key
      const g = groups.get(key) || { name, entries: [] }
      g.entries.push({ idx: i, opt })
      groups.set(key, g)
    }
    for (const g of groups.values()) {
      g.entries.sort((a, b) => a.opt.courses[0].code.localeCompare(b.opt.courses[0].code))
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [options])

  const chosen = selected.map((i) => options[i]).filter((o): o is Option => !!o)
  const subareasCovered = new Set(chosen.flatMap((o) => o.courses.map((c) => c.subarea).filter(Boolean) as string[]))
  const allSubareas = new Set(options.flatMap((o) => o.courses.map((c) => c.subarea).filter(Boolean) as string[]))
  const prefixesCovered = new Set(chosen.flatMap((o) => o.courses.map((c) => (c.code.split(/\s+/)[0] || '').toUpperCase())))

  let validationMessage = ''
  if (selected.length < pickCount) {
    validationMessage = `Pick ${pickCount - selected.length} more course${pickCount - selected.length === 1 ? '' : 's'}.`
  } else if (rule === 'at_least_one_per_subarea') {
    const missing = Array.from(allSubareas).filter((s) => !subareasCovered.has(s))
    if (missing.length > 0) validationMessage = `Still need at least one from ${missing.join(', ')}.`
  } else if (rule === 'different_disciplines' && prefixesCovered.size < 2) {
    validationMessage = 'Need courses from 2 different subject prefixes.'
  }

  let ruleHelp = ''
  if (rule === 'at_least_one_per_subarea') {
    ruleHelp = `Pick ${pickCount} courses, at least one from each subarea.`
  } else if (rule === 'different_disciplines') {
    ruleHelp = `Pick ${pickCount} courses from ${pickCount} different subject prefixes.`
  } else {
    ruleHelp = `Pick ${pickCount} courses.`
  }

  return (
    <div className="rounded-xl border border-gray-100 px-4 py-3 bg-white shadow-sm">
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          {badge && (
            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">{subtitle}</p>
        <p className="text-xs text-indigo-600 mt-1">{ruleHelp}</p>
        {validationMessage ? (
          <p className="text-xs text-amber-600 mt-0.5">{validationMessage}</p>
        ) : (
          <p className="text-xs text-emerald-600 mt-0.5">All set ({selected.length} of {pickCount} picked)</p>
        )}
      </div>
      <div className="space-y-3">
        {grouped.map(([key, group]) => (
          <div key={key}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{group.name}</p>
            <div className="grid grid-cols-2 gap-1">
              {group.entries.map(({ idx, opt }) => {
                const c = opt.courses[0]
                const isChecked = selected.includes(idx)
                return (
                  <label
                    key={idx}
                    className={`flex items-start gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                      isChecked ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50 border border-transparent'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(idx)}
                      className="accent-indigo-600 mt-0.5"
                    />
                    <span className={`font-mono text-xs font-semibold ${c.completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                      {c.code}
                    </span>
                    {c.completed && <span className="text-[10px] text-emerald-600">done</span>}
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

