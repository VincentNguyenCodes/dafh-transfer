import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

type Entry = {
  id?: number
  school: 'deanza' | 'foothill'
  course_code: string
  course_name: string
  units: string
  grade: string
  status: 'completed' | 'in_progress'
}

type SchoolSection = 'deanza' | 'foothill'

const EMPTY_ENTRY: Omit<Entry, 'school'> = {
  course_code: '',
  course_name: '',
  units: '',
  grade: '',
  status: 'completed',
}

export default function Transcript() {
  const navigate = useNavigate()
  const [skipped, setSkipped] = useState<Record<SchoolSection, boolean>>({ deanza: false, foothill: false })
  const [pasteText, setPasteText] = useState<Record<SchoolSection, string>>({ deanza: '', foothill: '' })
  const [manualEntries, setManualEntries] = useState<Entry[]>([])
  const [savedEntries, setSavedEntries] = useState<Entry[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/transcript/').then(({ data }) => setSavedEntries(data))
  }, [])

  const addManualEntry = (school: SchoolSection) => {
    setManualEntries((prev) => [...prev, { ...EMPTY_ENTRY, school }])
  }

  const updateManual = (index: number, field: keyof Entry, value: string) => {
    setManualEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, [field]: value } : e))
    )
  }

  const removeManual = (index: number) => {
    setManualEntries((prev) => prev.filter((_, i) => i !== index))
  }

  const deleteEntry = async (id: number) => {
    await api.delete(`/transcript/${id}/`)
    setSavedEntries((prev) => prev.filter((e) => e.id !== id))
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const toSave = manualEntries.filter((e) => e.course_code.trim())
      if (toSave.length > 0) {
        const { data } = await api.post('/transcript/', toSave)
        setSavedEntries((prev) => [...prev, ...(Array.isArray(data) ? data : [data])])
        setManualEntries([])
      }
      await api.patch('/progress/', { current_step: 2 })
      navigate('/schools')
    } catch {
      setError('Failed to save. Please check your entries and try again.')
    } finally {
      setSaving(false)
    }
  }

  const renderSchoolSection = (school: SchoolSection, label: string) => (
    <div className="bg-white rounded-2xl shadow-md p-6 mb-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">{label}</h2>
        <button
          onClick={() => setSkipped((prev) => ({ ...prev, [school]: !prev[school] }))}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          {skipped[school] ? 'Undo' : "Didn't attend here"}
        </button>
      </div>

      {skipped[school] ? (
        <p className="text-sm text-gray-400 italic">Skipped</p>
      ) : (
        <>
          <textarea
            className="w-full border border-gray-200 rounded-lg p-3 text-sm font-mono h-36 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-3"
            placeholder={`Paste your unofficial ${label} transcript here (Cmd+A, Cmd+C from the transcript page)...`}
            value={pasteText[school]}
            onChange={(e) => setPasteText((prev) => ({ ...prev, [school]: e.target.value }))}
          />

          {savedEntries.filter((e) => e.school === school).length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Saved courses</p>
              <div className="space-y-1">
                {savedEntries.filter((e) => e.school === school).map((e) => (
                  <div key={e.id} className="flex items-center gap-2 text-sm bg-gray-50 rounded px-3 py-1.5">
                    <span className="font-mono font-medium w-24">{e.course_code}</span>
                    <span className="flex-1 text-gray-600">{e.course_name}</span>
                    {e.status === 'in_progress' && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">In Progress</span>
                    )}
                    <button onClick={() => deleteEntry(e.id!)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {manualEntries.filter((e) => e.school === school).map((entry, i) => {
            const globalIdx = manualEntries.indexOf(entry)
            return (
              <div key={i} className="grid grid-cols-12 gap-2 mb-2 text-sm">
                <input
                  className="col-span-3 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  placeholder="Code (e.g. CIS 22A)"
                  value={entry.course_code}
                  onChange={(e) => updateManual(globalIdx, 'course_code', e.target.value)}
                />
                <input
                  className="col-span-4 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  placeholder="Course name"
                  value={entry.course_name}
                  onChange={(e) => updateManual(globalIdx, 'course_name', e.target.value)}
                />
                <input
                  className="col-span-1 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  placeholder="Units"
                  value={entry.units}
                  onChange={(e) => updateManual(globalIdx, 'units', e.target.value)}
                />
                <input
                  className="col-span-1 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  placeholder="Grade"
                  value={entry.grade}
                  onChange={(e) => updateManual(globalIdx, 'grade', e.target.value)}
                />
                <select
                  className="col-span-2 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  value={entry.status}
                  onChange={(e) => updateManual(globalIdx, 'status', e.target.value)}
                >
                  <option value="completed">Done</option>
                  <option value="in_progress">In Progress</option>
                </select>
                <button onClick={() => removeManual(globalIdx)} className="col-span-1 text-red-400 hover:text-red-600 text-xs">Remove</button>
              </div>
            )
          })}

          <button
            onClick={() => addManualEntry(school)}
            className="text-sm text-indigo-600 hover:text-indigo-800 mt-1"
          >
            + Add course manually
          </button>
        </>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-400 hover:text-gray-600 mb-4">
          Back to dashboard
        </button>
        <h1 className="text-2xl font-bold mb-2">Your Transcripts</h1>
        <p className="text-sm text-gray-500 mb-6">
          Paste your unofficial transcript text and/or add courses manually. Include in-progress classes too.
        </p>

        {renderSchoolSection('deanza', 'De Anza College')}
        {renderSchoolSection('foothill', 'Foothill College')}

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-indigo-600 text-white rounded-xl py-3 font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save and Continue'}
        </button>
      </div>
    </div>
  )
}
