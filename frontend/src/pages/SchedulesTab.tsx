import { useEffect, useState } from 'react'
import api from '../api/client'
import ScheduleWizard from './ScheduleWizard'
import ScheduleBuilder, { type ClassItem, type Quarter } from './ScheduleBuilder'

type Schedule = {
  id: number
  name: string
  schedule_type: 'custom' | 'optimal'
  ge_path: string
  quarters: Quarter[]
  class_bank: ClassItem[]
  created_at: string
  updated_at: string
}

export default function SchedulesTab() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [wizardType, setWizardType] = useState<'custom' | 'optimal' | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [viewing, setViewing] = useState<Schedule | null>(null)

  const load = () => {
    setLoading(true)
    setError('')
    api.get('/schedules/')
      .then(({ data }) => setSchedules(data))
      .catch(() => setError('Failed to load schedules.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const deleteSchedule = async (id: number) => {
    if (!confirm('Delete this schedule?')) return
    setBusy(id)
    try {
      await api.delete(`/schedules/${id}/`)
      setSchedules((prev) => prev.filter((s) => s.id !== id))
    } catch {
      setError('Failed to delete.')
    } finally {
      setBusy(null)
    }
  }

  if (wizardType) {
    return (
      <ScheduleWizard
        scheduleType={wizardType}
        onCancel={() => setWizardType(null)}
        onSaved={() => { setWizardType(null); load() }}
      />
    )
  }

  if (viewing) {
    return (
      <ScheduleViewer
        schedule={viewing}
        onClose={() => { setViewing(null); load() }}
      />
    )
  }

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-gray-500 text-sm">Loading your schedules...</p>
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Schedules</h2>
          <p className="text-gray-500 text-sm">Build a schedule by picking your options or letting us optimize for the fewest classes.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="bg-indigo-600 text-white text-sm font-semibold px-5 py-2 rounded-xl hover:bg-indigo-500 transition-all duration-150 cursor-pointer shadow-sm"
        >
          + Create new schedule
        </button>
      </div>

      {schedules.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-14 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-gray-900 font-semibold mb-1">No schedules yet</p>
          <p className="text-gray-500 text-sm mb-5 max-w-xs mx-auto">Plan your classes quarter by quarter to stay on track for transfer.</p>
          <button
            onClick={() => setCreating(true)}
            className="bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-500 transition-all duration-150 cursor-pointer shadow-sm"
          >
            Create your first schedule
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {schedules.map((s) => (
            <button
              key={s.id}
              onClick={() => setViewing(s)}
              className="text-left rounded-2xl border border-gray-100 bg-white shadow-sm p-5 flex flex-col hover:shadow-md hover:border-indigo-200 transition-all duration-200 cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-indigo-700 transition-colors duration-150">{s.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {s.schedule_type === 'optimal' ? 'Optimal plan' : 'Custom plan'} · {new Date(s.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); deleteSchedule(s.id) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); deleteSchedule(s.id) } }}
                  aria-disabled={busy === s.id}
                  className="text-xs text-gray-300 hover:text-red-400 transition-colors shrink-0 cursor-pointer ml-2"
                >
                  Delete
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {s.quarters.length} quarter{s.quarters.length === 1 ? '' : 's'}
                </span>
                {s.class_bank.length > 0 && (
                  <span className="text-[11px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {s.class_bank.length} unplaced
                  </span>
                )}
                {s.ge_path && (
                  <span className="text-[11px] font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                    Cal-GETC
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {creating && (
        <CreateScheduleModal
          onClose={() => setCreating(false)}
          onPicked={(kind) => { setCreating(false); setWizardType(kind) }}
        />
      )}
    </div>
  )
}

function CreateScheduleModal({ onClose, onPicked }: { onClose: () => void; onPicked: (kind: 'custom' | 'optimal') => void }) {
  return (
    <div className="fixed inset-0 bg-gray-900/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-1">Create a new schedule</h3>
        <p className="text-sm text-gray-500 mb-5">Choose how you want to build this schedule.</p>

        <button
          onClick={() => onPicked('custom')}
          className="w-full text-left rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40 px-4 py-4 mb-3 transition-colors"
        >
          <p className="text-sm font-semibold text-gray-900 mb-0.5">Create custom</p>
          <p className="text-xs text-gray-500">Pick your option for every requirement that has alternatives.</p>
        </button>

        <button
          onClick={() => onPicked('optimal')}
          className="w-full text-left rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40 px-4 py-4 transition-colors"
        >
          <p className="text-sm font-semibold text-gray-900 mb-0.5">Create optimal</p>
          <p className="text-xs text-gray-500">We pick the option that requires the fewest classes. You decide on ties.</p>
        </button>

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
        </div>
      </div>
    </div>
  )
}

function ScheduleViewer({ schedule, onClose }: { schedule: Schedule; onClose: () => void }) {
  const [name, setName] = useState(schedule.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async (quarters: Quarter[], remainingBank: ClassItem[]) => {
    setSaving(true)
    setError('')
    try {
      const fullBank = new Map<string, ClassItem>()
      for (const c of remainingBank) fullBank.set(c.code, c)
      for (const c of schedule.class_bank) if (!fullBank.has(c.code)) fullBank.set(c.code, c)
      await api.patch(`/schedules/${schedule.id}/`, {
        name,
        quarters,
        class_bank: Array.from(fullBank.values()),
      })
      onClose()
    } catch (err: unknown) {
      const errAxios = err as { response?: { data?: { error?: string } } }
      setError(errAxios?.response?.data?.error || 'Failed to save schedule.')
      setSaving(false)
    }
  }

  return (
    <ScheduleBuilder
      classBank={schedule.class_bank}
      initialQuarters={schedule.quarters}
      name={name}
      onNameChange={setName}
      onBack={onClose}
      onSave={save}
      saving={saving}
      error={error}
    />
  )
}
