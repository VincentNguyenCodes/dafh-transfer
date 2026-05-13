import { useEffect, useState } from 'react'
import api from '../api/client'

type Need = { target: string; requirement: string }

type CourseInOption = {
  code: string
  name: string
  units: number | null
  school: string
  completed: boolean
  in_progress: boolean
}

type TiedOption = { courses: CourseInOption[]; satisfied: boolean }

type NeedsChoice = {
  requirement_key: string
  receiving_code: string
  receiving_name: string
  target: string
  options: TiedOption[]
}

type ScheduleClass = {
  code: string
  name: string
  units: number | null
  school: string
  in_progress: boolean
  needed_for: Need[]
  kinds: ('required' | 'recommended' | 'elective')[]
}

type Schedule = {
  classes: ScheduleClass[]
  needs_choice: NeedsChoice[]
  total: number
  in_progress: number
}

export default function BestScheduleTab() {
  const [data, setData] = useState<Schedule | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError('')
    api.get('/best-schedule/')
      .then(({ data }) => setData(data))
      .catch(() => setError('Failed to load. Make sure you have saved schools and classes.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const pickOption = async (key: string, idx: number) => {
    setSaving(key)
    setError('')
    try {
      await api.post('/option-preferences/', { scope: 'schedule', requirement_key: key, chosen_option_index: idx })
      load()
    } catch {
      setError('Failed to save your choice.')
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-gray-500 text-sm">Calculating optimal schedule...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
        <p className="text-gray-900 font-medium text-sm mb-1">Could not load schedule</p>
        <p className="text-gray-600 text-xs">{error}</p>
      </div>
    )
  }

  if (!data) return null

  const { classes, needs_choice } = data
  const inProgress = classes.filter((c) => c.in_progress)
  const stillNeeded = classes.filter((c) => !c.in_progress)

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Best Schedule</h2>
          <p className="text-gray-500 text-sm">
            We picked the option for each requirement that minimizes the classes you still need. When two options need the same number of classes, you decide.
          </p>
        </div>
        <button onClick={load} className="text-sm text-gray-700 hover:text-gray-900 font-medium shrink-0">Refresh</button>
      </div>

      {needs_choice.length > 0 && (
        <div className="mb-6 border border-amber-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-200">
            <p className="text-sm font-bold text-gray-900">You need to pick {needs_choice.length} option{needs_choice.length === 1 ? '' : 's'}</p>
            <p className="text-xs text-gray-600 mt-0.5">These requirements have options that all need the same number of classes, so we cannot pick for you.</p>
          </div>
          <div className="p-4 space-y-3 bg-white">
            {needs_choice.map((nc) => (
              <div key={nc.requirement_key} className="rounded-xl border border-gray-100 px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-sm font-semibold text-gray-900">{nc.receiving_name}</p>
                  <span className="text-xs text-gray-500">— {nc.target}</span>
                </div>
                <div className="space-y-1">
                  {nc.options.map((opt, oi) => (
                    <button
                      key={oi}
                      onClick={() => pickOption(nc.requirement_key, oi)}
                      disabled={saving === nc.requirement_key}
                      className="w-full text-left px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 hover:border-gray-200 disabled:opacity-40 transition-colors"
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        {opt.courses.map((c, ci) => (
                          <span key={ci} className="flex items-center gap-1.5">
                            {ci > 0 && <span className="text-xs text-gray-400">+</span>}
                            <span className={`font-mono text-sm font-semibold ${c.completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{c.code}</span>
                            <span className="text-xs text-gray-500">{c.name}</span>
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {classes.length === 0 && needs_choice.length === 0 && (
        <div className="bg-green-50 border border-green-100 rounded-2xl p-8 text-center">
          <p className="text-gray-900 font-semibold mb-1">All required classes are complete</p>
          <p className="text-gray-500 text-sm">You have already taken every class needed for your transfer targets.</p>
        </div>
      )}

      {classes.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Classes Remaining</p>
              <p className="text-3xl font-bold text-gray-900">{stillNeeded.length}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">In Progress</p>
              <p className="text-3xl font-bold text-gray-900">{inProgress.length}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Total to Take</p>
              <p className="text-3xl font-bold text-gray-900">{data.total}</p>
            </div>
          </div>

          {inProgress.length > 0 && (
            <div className="mb-5 border border-yellow-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 bg-yellow-50 border-b border-yellow-100">
                <p className="text-sm font-bold text-gray-900">Currently In Progress</p>
                <p className="text-xs text-gray-500 mt-0.5">Classes you are taking now that count toward your transfer</p>
              </div>
              <div className="p-4 space-y-2 bg-white">
                {inProgress.map((c) => <ClassRow key={c.code} c={c} />)}
              </div>
            </div>
          )}

          {stillNeeded.length > 0 && (
            <div className="mb-5 border border-indigo-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100">
                <p className="text-sm font-bold text-gray-900">Still Need to Take</p>
                <p className="text-xs text-gray-500 mt-0.5">The minimum classes to satisfy all your transfer targets</p>
              </div>
              <div className="p-4 space-y-2 bg-white">
                {stillNeeded.map((c) => <ClassRow key={c.code} c={c} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ClassRow({ c }: { c: ScheduleClass }) {
  const schoolNames = Array.from(new Set(c.needed_for.map((n) => n.target)))
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-4 py-3">
      <div className="flex items-center gap-3 mb-1">
        <span className="font-mono text-sm font-semibold text-gray-900 shrink-0">{c.code}</span>
        <span className="text-sm text-gray-600 truncate flex-1">{c.name}</span>
        {c.units != null && (
          <span className="text-xs text-gray-400 shrink-0">{c.units}u</span>
        )}
        {c.in_progress && (
          <span className="text-xs bg-yellow-100 text-gray-700 px-2 py-0.5 rounded-full shrink-0">In Progress</span>
        )}
      </div>
      <p className="text-xs text-gray-500">Needed for: {schoolNames.join(', ')}</p>
    </div>
  )
}
