import { useEffect, useMemo, useState } from 'react'
import api from '../api/client'

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

type TargetResult = {
  target: string
  school_name: string
  major_name: string
  requirements: Requirement[]
  recommended: Requirement[]
  total: number
  satisfied: number
}

type Preference = { requirement_key: string; chosen_option_index: number }

function requirementKey(req: Requirement): string {
  return req.options
    .flatMap((o) => o.courses.map((c) => c.code))
    .sort()
    .join('|')
}

export default function CustomPlanTab() {
  const [results, setResults] = useState<TargetResult[] | null>(null)
  const [prefs, setPrefs] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [r, p] = await Promise.all([api.get('/results/'), api.get('/option-preferences/')])
      setResults(r.data)
      const m: Record<string, number> = {}
      for (const pref of (p.data as Preference[])) m[pref.requirement_key] = pref.chosen_option_index
      setPrefs(m)
    } catch {
      setError('Failed to load. Make sure you have saved schools and classes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const savePref = async (key: string, idx: number) => {
    setSaving(key)
    setPrefs((p) => ({ ...p, [key]: idx }))
    try {
      await api.post('/option-preferences/', { requirement_key: key, chosen_option_index: idx })
    } catch {
      setError('Failed to save your choice.')
    } finally {
      setSaving(null)
    }
  }

  const aggregated = useMemo(() => {
    if (!results) return []
    const map = new Map<string, { req: Requirement; targets: Set<string> }>()
    for (const r of results) {
      for (const req of r.requirements) {
        if (req.no_articulation || req.satisfied || req.options.length <= 1) continue
        const key = requirementKey(req)
        const existing = map.get(key)
        if (existing) {
          existing.targets.add(r.school_name)
        } else {
          map.set(key, { req, targets: new Set([r.school_name]) })
        }
      }
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, req: v.req, targets: Array.from(v.targets) }))
  }, [results])

  const plan = useMemo(() => {
    if (!results) return { classes: [] as { code: string; name: string; in_progress: boolean; needed_for: string[] }[] }
    const classes = new Map<string, { code: string; name: string; in_progress: boolean; needed_for: Set<string> }>()
    const addCourses = (req: Requirement, targetLabel: string, options: Option[]) => {
      if (req.no_articulation || req.satisfied) return
      let chosen = options[0]
      if (options.length > 1) {
        const key = requirementKey(req)
        const idx = prefs[key] ?? 0
        chosen = options[idx] || options[0]
      }
      for (const c of chosen.courses) {
        if (c.completed) continue
        const entry = classes.get(c.code) || { code: c.code, name: c.name, in_progress: c.in_progress, needed_for: new Set<string>() }
        entry.needed_for.add(targetLabel)
        classes.set(c.code, entry)
      }
    }
    for (const r of results) {
      for (const req of r.requirements) addCourses(req, r.school_name, req.options)
    }
    return {
      classes: Array.from(classes.values())
        .map((c) => ({ code: c.code, name: c.name, in_progress: c.in_progress, needed_for: Array.from(c.needed_for) }))
        .sort((a, b) => (a.in_progress === b.in_progress ? a.code.localeCompare(b.code) : a.in_progress ? -1 : 1)),
    }
  }, [results, prefs])

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
      </div>
    )
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Custom Plan</h2>
          <p className="text-gray-500 text-sm">Pick which courses you want to take for each requirement that has alternatives. Your choices are saved.</p>
        </div>
        <button onClick={load} className="text-sm text-gray-700 hover:text-gray-900 font-medium shrink-0">Refresh</button>
      </div>

      {aggregated.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 text-center mb-6">
          <p className="text-gray-600 font-semibold mb-1">No choices to make</p>
          <p className="text-gray-400 text-sm">None of your requirements have multiple options to pick from.</p>
        </div>
      )}

      {aggregated.length > 0 && (
        <div className="mb-6 border border-indigo-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100">
            <p className="text-sm font-bold text-gray-900">Pick your option for each requirement</p>
            <p className="text-xs text-gray-500 mt-0.5">{aggregated.length} requirement{aggregated.length === 1 ? '' : 's'} have alternatives</p>
          </div>
          <div className="p-4 space-y-3 bg-white">
            {aggregated.map(({ key, req, targets }) => {
              const selectedIdx = prefs[key] ?? 0
              return (
                <div key={key} className="rounded-xl border border-gray-100 px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-semibold text-gray-900">{req.receiving_name || req.receiving_code}</p>
                    <span className="text-xs text-gray-500">— required for {targets.join(', ')}</span>
                  </div>
                  <div className="space-y-1">
                    {req.options.map((opt, oi) => {
                      const isSelected = oi === selectedIdx
                      return (
                        <label
                          key={oi}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                            isSelected ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50 border border-transparent'
                          }`}
                        >
                          <input
                            type="radio"
                            name={key}
                            checked={isSelected}
                            onChange={() => savePref(key, oi)}
                            disabled={saving === key}
                            className="accent-indigo-600"
                          />
                          <div className="flex-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            {opt.courses.map((c, ci) => (
                              <span key={ci} className="flex items-center gap-1.5">
                                {ci > 0 && <span className="text-xs text-gray-400">+</span>}
                                <span className={`font-mono text-sm font-semibold ${c.completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{c.code}</span>
                                <span className="text-xs text-gray-500">{c.name}</span>
                                {c.in_progress && <span className="text-xs bg-yellow-100 text-gray-700 px-1.5 py-0.5 rounded-full">In Progress</span>}
                              </span>
                            ))}
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {plan.classes.length > 0 && (
        <div className="mb-5 border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-sm font-bold text-gray-900">Your Custom Plan</p>
            <p className="text-xs text-gray-500 mt-0.5">{plan.classes.length} class{plan.classes.length === 1 ? '' : 'es'} based on your picks</p>
          </div>
          <div className="p-4 space-y-2 bg-white">
            {plan.classes.map((c) => (
              <div key={c.code} className="rounded-xl border border-gray-100 px-4 py-3">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-mono text-sm font-semibold text-gray-900 shrink-0">{c.code}</span>
                  <span className="text-sm text-gray-600 truncate flex-1">{c.name}</span>
                  {c.in_progress && <span className="text-xs bg-yellow-100 text-gray-700 px-2 py-0.5 rounded-full shrink-0">In Progress</span>}
                </div>
                <p className="text-xs text-gray-500">Needed for: {c.needed_for.join(', ')}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
