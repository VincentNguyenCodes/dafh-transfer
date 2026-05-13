import { useEffect, useState } from 'react'
import api from '../api/client'

type Need = {
  target: string
  requirement: string
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
  total: number
  in_progress: number
}

export default function BestScheduleTab() {
  const [data, setData] = useState<Schedule | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    api.get('/best-schedule/')
      .then(({ data }) => setData(data))
      .catch(() => setError('Failed to load best schedule. Make sure you have saved schools and classes.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

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

  if (!data || data.classes.length === 0) {
    return (
      <div className="bg-green-50 border border-green-100 rounded-2xl p-8 text-center">
        <p className="text-gray-900 font-semibold mb-1">All required classes are complete!</p>
        <p className="text-gray-500 text-sm">You have already taken every class needed for your transfer targets.</p>
      </div>
    )
  }

  const inProgress = data.classes.filter((c) => c.in_progress)
  const stillNeeded = data.classes.filter((c) => !c.in_progress)

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Best Schedule</h2>
          <p className="text-gray-500 text-sm">
            We picked the option for each requirement that uses the most classes you have already taken. This is the minimum set of classes you still need.
          </p>
        </div>
        <button onClick={load} className="text-sm text-gray-700 hover:text-gray-900 font-medium shrink-0">Refresh</button>
      </div>

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
      <p className="text-xs text-gray-500">
        Needed for: {schoolNames.join(', ')}
      </p>
    </div>
  )
}
