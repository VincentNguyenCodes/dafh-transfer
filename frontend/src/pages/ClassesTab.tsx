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
  const [saveMsg, setSaveMsg] = useState('')

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
    setError('')
    setSaveMsg('')
    const toSave = [
      ...parsed.deanza,
      ...parsed.foothill,
      ...manualEntries.filter((e) => e.course_code.trim()),
    ]
    if (toSave.length === 0) {
      setSaveMsg('No new classes to save. Paste a transcript or add a class manually first.')
      return
    }
    setSaving(true)
    try {
      const { data } = await api.post('/transcript/', toSave)
      setSavedEntries((prev) => [...prev, ...(Array.isArray(data) ? data : [data])])
      setParsed({ deanza: [], foothill: [] })
      setPasteText({ deanza: '', foothill: '' })
      setManualEntries([])
      setSaveMsg(`Saved ${toSave.length} class${toSave.length > 1 ? 'es' : ''}.`)
    } catch {
      setError('Failed to save. Some classes may already be saved - try removing duplicates.')
    } finally {
      setSaving(false)
    }
  }

  const renderSchool = (school: SchoolKey, label: string) => (
    <div className="glass rounded-2xl mb-4 overflow-hidden">
      <div className="glass-header flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className={`w-2 h-2 rounded-full ${school === 'deanza' ? 'bg-indigo-500' : 'bg-violet-400'}`} />
          <h3 className="text-sm font-semibold text-gray-900 tracking-tight">{label}</h3>
        </div>
        <button
          onClick={() => setSkipped((s) => ({ ...s, [school]: !s[school] }))}
          className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors duration-150 px-2.5 py-1 rounded-lg hover:bg-white cursor-pointer"
        >
          {skipped[school] ? 'Undo skip' : "Didn't attend here"}
        </button>
      </div>
      <div className="p-5">

      {skipped[school] ? (
        <p className="text-sm text-gray-300 italic">Skipped</p>
      ) : (
        <>
          {savedEntries.filter((e) => e.school === school).length > 0 && (
            <div className="mb-5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Saved</p>
              <div className="space-y-1">
                {savedEntries.filter((e) => e.school === school).map((e) => (
                  <div key={e.id} className="flex items-center gap-2 text-sm bg-gray-50 rounded-xl px-3 py-2.5">
                    <span className="font-mono font-semibold text-xs text-gray-700 w-24 shrink-0">{e.course_code}</span>
                    <span className="flex-1 text-gray-500 truncate text-xs">{e.course_name}</span>
                    <span className="text-xs text-gray-400 shrink-0">{e.grade}</span>
                    {e.status === 'in_progress' && (
                      <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full shrink-0 font-medium">In Progress</span>
                    )}
                    <button onClick={() => deleteEntry(e.id!)} className="text-gray-300 hover:text-red-400 text-xs shrink-0 transition-colors duration-150">Remove</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">
              Paste transcript
            </label>
            <textarea
              className="w-full border border-gray-200 rounded-xl p-3 text-sm font-mono h-28 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all duration-150 text-gray-700 placeholder-gray-300 bg-gray-50"
              placeholder={`Cmd+A, Cmd+C from the ${label} unofficial transcript...`}
              value={pasteText[school]}
              onChange={(e) => setPasteText((p) => ({ ...p, [school]: e.target.value }))}
            />
            <button
              onClick={() => handleParse(school)}
              disabled={!pasteText[school].trim() || parsing[school]}
              className="mt-2 text-sm bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium px-4 py-2 rounded-xl disabled:opacity-40 transition-all duration-150 cursor-pointer"
            >
              {parsing[school] ? 'Parsing...' : 'Parse transcript'}
            </button>
          </div>

          {parsed[school].length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                {parsed[school].length} classes detected
              </p>
              <div className="space-y-1">
                {parsed[school].map((e, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm bg-indigo-50 rounded-xl px-3 py-2.5">
                    <span className="font-mono font-semibold text-xs text-indigo-700 w-24 shrink-0">{e.course_code}</span>
                    <span className="flex-1 text-gray-600 truncate text-xs">{e.course_name}</span>
                    <span className="text-xs text-gray-400 shrink-0">{e.grade}</span>
                    {e.status === 'in_progress' && (
                      <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full shrink-0 font-medium">In Progress</span>
                    )}
                    <button onClick={() => removeParsed(school, idx)} className="text-gray-300 hover:text-red-400 text-xs shrink-0 transition-colors duration-150">Remove</button>
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
                  className="col-span-3 border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all duration-150"
                  placeholder="CIS D022A"
                  value={entry.course_code}
                  onChange={(e) => updateManual(globalIdx, 'course_code', e.target.value)}
                />
                <input
                  className="col-span-4 border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all duration-150"
                  placeholder="Course name"
                  value={entry.course_name}
                  onChange={(e) => updateManual(globalIdx, 'course_name', e.target.value)}
                />
                <input
                  className="col-span-1 border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all duration-150"
                  placeholder="Units"
                  value={entry.units}
                  onChange={(e) => updateManual(globalIdx, 'units', e.target.value)}
                />
                <input
                  className="col-span-1 border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all duration-150"
                  placeholder="Grade"
                  value={entry.grade}
                  onChange={(e) => updateManual(globalIdx, 'grade', e.target.value)}
                />
                <select
                  className="col-span-2 border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all duration-150"
                  value={entry.status}
                  onChange={(e) => updateManual(globalIdx, 'status', e.target.value)}
                >
                  <option value="completed">Done</option>
                  <option value="in_progress">In Progress</option>
                </select>
                <button onClick={() => removeManual(globalIdx)} className="col-span-1 text-gray-300 hover:text-red-400 text-xs transition-colors duration-150">Remove</button>
              </div>
            )
          })}

          <button onClick={() => addManual(school)} className="text-sm text-indigo-500 hover:text-indigo-700 font-medium mt-1 transition-colors duration-150 cursor-pointer">
            + Add manually
          </button>
        </>
      )}
      </div>
    </div>
  )

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 tracking-tight mb-1">Your Classes</h2>
        <p className="text-gray-400 text-sm">Paste your unofficial transcripts or add classes manually.</p>
      </div>

      {renderSchool('deanza', 'De Anza College')}
      {renderSchool('foothill', 'Foothill College')}

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-3">
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      )}
      {saveMsg && !error && (
        <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 mb-3">
          <p className="text-green-600 text-sm">{saveMsg}</p>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-indigo-600 text-white rounded-2xl py-3.5 font-semibold text-sm hover:bg-indigo-500 hover:shadow-md hover:shadow-indigo-300/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 tracking-tight cursor-pointer"
      >
        {saving ? 'Saving...' : 'Save Classes'}
      </button>
    </div>
  )
}
