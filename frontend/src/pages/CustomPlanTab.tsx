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
  const [savedPrefs, setSavedPrefs] = useState<Record<string, number>>({})
  const [draftPicks, setDraftPicks] = useState<Record<string, number>>({})
  const [mode, setMode] = useState<'pick' | 'view'>('pick')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [r, p] = await Promise.all([api.get('/results/'), api.get('/option-preferences/')])
      setResults(r.data)
      const m: Record<string, number> = {}
      for (const pref of (p.data as Preference[])) m[pref.requirement_key] = pref.chosen_option_index
      setSavedPrefs(m)
      setDraftPicks(m)
    } catch {
      setError('Failed to load. Make sure you have saved schools and classes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

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

  useEffect(() => {
    if (!results || aggregated.length === 0) return
    const allCovered = aggregated.every((a) => savedPrefs[a.key] !== undefined)
    setMode(allCovered ? 'view' : 'pick')
  }, [results, aggregated, savedPrefs])

  const plan = useMemo(() => {
    if (!results) return [] as { code: string; name: string; in_progress: boolean; needed_for: string[] }[]
    const classes = new Map<string, { code: string; name: string; in_progress: boolean; needed_for: Set<string> }>()
    for (const r of results) {
      for (const req of r.requirements) {
        if (req.no_articulation || req.satisfied) continue
        let chosen = req.options[0]
        if (req.options.length > 1) {
          const key = requirementKey(req)
          const idx = savedPrefs[key] ?? 0
          chosen = req.options[idx] || req.options[0]
        }
        for (const c of chosen.courses) {
          if (c.completed) continue
          const entry = classes.get(c.code) || { code: c.code, name: c.name, in_progress: c.in_progress, needed_for: new Set<string>() }
          entry.needed_for.add(r.school_name)
          classes.set(c.code, entry)
        }
      }
    }
    return Array.from(classes.values())
      .map((c) => ({ code: c.code, name: c.name, in_progress: c.in_progress, needed_for: Array.from(c.needed_for) }))
      .sort((a, b) => (a.in_progress === b.in_progress ? a.code.localeCompare(b.code) : a.in_progress ? -1 : 1))
  }, [results, savedPrefs])

  const allPicked = aggregated.every((a) => draftPicks[a.key] !== undefined)

  const saveAll = async () => {
    setSaving(true)
    setError('')
    try {
      await Promise.all(
        aggregated.map((a) =>
          api.post('/option-preferences/', {
            requirement_key: a.key,
            chosen_option_index: draftPicks[a.key],
          })
        )
      )
      setSavedPrefs({ ...draftPicks })
      setMode('view')
    } catch {
      setError('Failed to save your choices. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const startEditing = () => {
    setDraftPicks({ ...savedPrefs })
    setMode('pick')
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
      </div>

      {aggregated.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 text-center mb-6">
          <p className="text-gray-600 font-semibold mb-1">No choices to make</p>
          <p className="text-gray-400 text-sm">None of your requirements have multiple options to pick from.</p>
        </div>
      )}

      {aggregated.length > 0 && mode === 'pick' && (
        <div className="mb-6 border border-indigo-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100">
            <p className="text-sm font-bold text-gray-900">Pick your option for each requirement</p>
            <p className="text-xs text-gray-500 mt-0.5">{aggregated.length} requirement{aggregated.length === 1 ? '' : 's'} with alternatives</p>
          </div>
          <div className="p-4 space-y-3 bg-white">
            {aggregated.map(({ key, req, targets }) => {
              const selectedIdx = draftPicks[key]
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
                            onChange={() => setDraftPicks((p) => ({ ...p, [key]: oi }))}
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
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {allPicked
                ? 'All picked, ready to save'
                : `${aggregated.filter((a) => draftPicks[a.key] !== undefined).length} of ${aggregated.length} picked`}
            </p>
            <button
              onClick={saveAll}
              disabled={!allPicked || saving}
              className="bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-40 hover:bg-indigo-700 transition-colors"
            >
              {saving ? 'Saving...' : 'Save my plan'}
            </button>
          </div>
        </div>
      )}

      {aggregated.length > 0 && mode === 'view' && (
        <>
          <div className="mb-5 flex items-center justify-between">
            <p className="text-sm text-gray-500">Showing classes based on your saved choices.</p>
            <button onClick={startEditing} className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-4 py-2 rounded-lg">
              Change your choices
            </button>
          </div>

          {plan.length > 0 ? (
            <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                <p className="text-sm font-bold text-gray-900">Your Custom Plan</p>
                <p className="text-xs text-gray-500 mt-0.5">{plan.length} class{plan.length === 1 ? '' : 'es'} still to take</p>
              </div>
              <div className="p-4 space-y-2 bg-white">
                {plan.map((c) => (
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
          ) : (
            <div className="bg-green-50 border border-green-100 rounded-2xl p-8 text-center">
              <p className="text-gray-900 font-semibold mb-1">All set</p>
              <p className="text-gray-500 text-sm">You have already taken every class your picks require.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
