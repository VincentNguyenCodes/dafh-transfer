import { useEffect, useState } from 'react'
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

export default function ClassesTab() {
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
      setError('Failed to parse. Try adding classes manually.')
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
    } catch {
      setError('Failed to save. Some classes may already be saved.')
    } finally {
      setSaving(false)
    }
  }

  const renderSchool = (school: SchoolKey, label: string) => (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-base font-semibold text-gray-900">{label}</h3>
        <button
          onClick={() => setSkipped((s) => ({ ...s, [school]: !s[school] }))}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
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
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Saved</p>
              <div className="space-y-1">
                {savedEntries.filter((e) => e.school === school).map((e) => (
                  <div key={e.id} className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
                    <span className="font-mono font-medium w-28 shrink-0">{e.course_code}</span>
                    <span className="flex-1 text-gray-600 truncate">{e.course_name}</span>
                    <span className="text-xs text-gray-400 shrink-0">{e.grade}</span>
                    {e.status === 'in_progress' && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full shrink-0">In Progress</span>
                    )}
                    <button onClick={() => deleteEntry(e.id!)} className="text-red-400 hover:text-red-600 text-xs shrink-0 transition-colors">Remove</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-3">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">
              Paste transcript (Cmd+A, Cmd+C from unofficial transcript)
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
                Detected {parsed[school].length} classes - review before saving
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
                    <button onClick={() => removeParsed(school, idx)} className="text-red-400 hover:text-red-600 text-xs shrink-0 transition-colors">Remove</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {manualEntries.filter((e) => e.school === school).map((entry) => {
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
                <button onClick={() => removeManual(globalIdx)} className="col-span-1 text-red-400 hover:text-red-600 text-xs transition-colors">Remove</button>
              </div>
            )
          })}

          <button onClick={() => addManual(school)} className="text-sm text-indigo-600 hover:text-indigo-800 mt-1 transition-colors">
            + Add class manually
          </button>
        </>
      )}
    </div>
  )

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Your Classes</h2>
        <p className="text-gray-500 text-sm">Paste your unofficial transcripts or add classes manually.</p>
      </div>

      {renderSchool('deanza', 'De Anza College')}
      {renderSchool('foothill', 'Foothill College')}

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-indigo-600 text-white rounded-2xl py-4 font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-md shadow-indigo-200"
      >
        {saving ? 'Saving...' : 'Save Classes'}
      </button>
    </div>
  )
}
