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

type SchoolKey = 'deanza' | 'foothill'

const EMPTY_ENTRY = (school: SchoolKey): Entry => ({
  school,
  course_code: '',
  course_name: '',
  units: '',
  grade: '',
  status: 'completed',
})

export default function Transcript() {
  const navigate = useNavigate()
  const [skipped, setSkipped] = useState<Record<SchoolKey, boolean>>({ deanza: false, foothill: false })
  const [pasteText, setPasteText] = useState<Record<SchoolKey, string>>({ deanza: '', foothill: '' })
  const [parsed, setParsed] = useState<Record<SchoolKey, Entry[]>>({ deanza: [], foothill: [] })
  const [parsing, setParsing] = useState<Record<SchoolKey, boolean>>({ deanza: false, foothill: false })
  const [manualEntries, setManualEntries] = useState<Entry[]>([])
  const [savedEntries, setSavedEntries] = useState<Entry[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/transcript/').then(({ data }) => setSavedEntries(data))
  }, [])

  const handleParse = async (school: SchoolKey) => {
    if (!pasteText[school].trim()) return
    setParsing((p) => ({ ...p, [school]: true }))
    try {
      const { data } = await api.post('/transcript/parse/', { text: pasteText[school], school })
      setParsed((p) => ({ ...p, [school]: data }))
    } catch {
      setError('Failed to parse transcript. Try adding courses manually.')
    } finally {
      setParsing((p) => ({ ...p, [school]: false }))
    }
  }

  const removeParsed = (school: SchoolKey, idx: number) => {
    setParsed((p) => ({ ...p, [school]: p[school].filter((_, i) => i !== idx) }))
  }

  const addManual = (school: SchoolKey) => {
    setManualEntries((prev) => [...prev, EMPTY_ENTRY(school)])
  }

  const updateManual = (idx: number, field: keyof Entry, value: string) => {
    setManualEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)))
  }

  const removeManual = (idx: number) => {
    setManualEntries((prev) => prev.filter((_, i) => i !== idx))
  }

  const deleteEntry = async (id: number) => {
    await api.delete(`/transcript/${id}/`)
    setSavedEntries((prev) => prev.filter((e) => e.id !== id))
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const toSave = [
        ...parsed.deanza,
        ...parsed.foothill,
        ...manualEntries.filter((e) => e.course_code.trim()),
      ]
      if (toSave.length > 0) {
        const { data } = await api.post('/transcript/', toSave)
        setSavedEntries((prev) => [...prev, ...(Array.isArray(data) ? data : [data])])
        setParsed({ deanza: [], foothill: [] })
        setPasteText({ deanza: '', foothill: '' })
        setManualEntries([])
      }
      await api.patch('/progress/', { current_step: 2 })
      navigate('/schools')
    } catch {
      setError('Failed to save. Some courses may already be saved. Try removing duplicates.')
    } finally {
      setSaving(false)
    }
  }

  const renderSchool = (school: SchoolKey, label: string) => (
    <div className="bg-white rounded-2xl shadow-md p-6 mb-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">{label}</h2>
        <button
          onClick={() => setSkipped((s) => ({ ...s, [school]: !s[school] }))}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          {skipped[school] ? 'Undo skip' : "Didn't attend here"}
        </button>
      </div>

      {skipped[school] ? (
        <p className="text-sm text-gray-400 italic">Skipped</p>
      ) : (
        <>
          {savedEntries.filter((e) => e.school === school).length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Already saved</p>
              <div className="space-y-1">
                {savedEntries.filter((e) => e.school === school).map((e) => (
                  <div key={e.id} className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
                    <span className="font-mono font-medium w-28 shrink-0">{e.course_code}</span>
                    <span className="flex-1 text-gray-600 truncate">{e.course_name}</span>
                    <span className="text-xs text-gray-400 shrink-0">{e.grade}</span>
                    {e.status === 'in_progress' && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full shrink-0">In Progress</span>
                    )}
                    <button onClick={() => deleteEntry(e.id!)} className="text-red-400 hover:text-red-600 text-xs shrink-0">Remove</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-3">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">
              Paste transcript (Cmd+A, Cmd+C from the unofficial transcript page)
            </label>
            <textarea
              className="w-full border border-gray-200 rounded-lg p-3 text-sm font-mono h-32 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder={`Go to your ${label} unofficial transcript, press Cmd+A then Cmd+C, and paste here...`}
              value={pasteText[school]}
              onChange={(e) => setPasteText((p) => ({ ...p, [school]: e.target.value }))}
            />
            <button
              onClick={() => handleParse(school)}
              disabled={!pasteText[school].trim() || parsing[school]}
              className="mt-2 text-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-4 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
            >
              {parsing[school] ? 'Parsing...' : 'Parse transcript'}
            </button>
          </div>

          {parsed[school].length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Detected {parsed[school].length} courses - review before saving
              </p>
              <div className="space-y-1">
                {parsed[school].map((e, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm bg-indigo-50 rounded-lg px-3 py-2">
                    <span className="font-mono font-medium w-28 shrink-0">{e.course_code}</span>
                    <span className="flex-1 text-gray-700 truncate">{e.course_name}</span>
                    <span className="text-xs text-gray-500 shrink-0">{e.grade} | {e.units} units</span>
                    {e.status === 'in_progress' && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full shrink-0">In Progress</span>
                    )}
                    <button onClick={() => removeParsed(school, idx)} className="text-red-400 hover:text-red-600 text-xs shrink-0">Remove</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {manualEntries.filter((e) => e.school === school).map((entry, _) => {
            const globalIdx = manualEntries.indexOf(entry)
            return (
              <div key={globalIdx} className="grid grid-cols-12 gap-2 mb-2 text-sm">
                <input
                  className="col-span-3 border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  placeholder="Code (e.g. CIS D022A)"
                  value={entry.course_code}
                  onChange={(e) => updateManual(globalIdx, 'course_code', e.target.value)}
                />
                <input
                  className="col-span-4 border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  placeholder="Course name"
                  value={entry.course_name}
                  onChange={(e) => updateManual(globalIdx, 'course_name', e.target.value)}
                />
                <input
                  className="col-span-1 border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  placeholder="Units"
                  value={entry.units}
                  onChange={(e) => updateManual(globalIdx, 'units', e.target.value)}
                />
                <input
                  className="col-span-1 border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  placeholder="Grade"
                  value={entry.grade}
                  onChange={(e) => updateManual(globalIdx, 'grade', e.target.value)}
                />
                <select
                  className="col-span-2 border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
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

          <button onClick={() => addManual(school)} className="text-sm text-indigo-600 hover:text-indigo-800 mt-1">
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
        <h1 className="text-2xl font-bold mb-1">Your Transcripts</h1>
        <p className="text-sm text-gray-500 mb-6">
          Go to your unofficial transcript page, press Cmd+A then Cmd+C, and paste below. Do this for each school you attended.
        </p>

        {renderSchool('deanza', 'De Anza College')}
        {renderSchool('foothill', 'Foothill College')}

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
