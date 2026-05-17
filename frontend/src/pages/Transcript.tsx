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
    <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4">
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-base font-semibold text-gray-900 tracking-tight">{label}</h2>
        <button
          onClick={() => setSkipped((s) => ({ ...s, [school]: !s[school] }))}
          className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors duration-150 px-2.5 py-1 rounded-lg hover:bg-gray-100"
        >
          {skipped[school] ? 'Undo skip' : "Didn't attend here"}
        </button>
      </div>

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
              placeholder={`Cmd+A, Cmd+C from the ${label} unofficial transcript page...`}
              value={pasteText[school]}
              onChange={(e) => setPasteText((p) => ({ ...p, [school]: e.target.value }))}
            />
            <button
              onClick={() => handleParse(school)}
              disabled={!pasteText[school].trim() || parsing[school]}
              className="mt-2 text-sm bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium px-4 py-2 rounded-xl disabled:opacity-40 transition-all duration-150"
            >
              {parsing[school] ? 'Parsing...' : 'Parse transcript'}
            </button>
          </div>

          {parsed[school].length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                {parsed[school].length} courses detected
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

          <button onClick={() => addManual(school)} className="text-sm text-indigo-500 hover:text-indigo-700 font-medium mt-1 transition-colors duration-150">
            + Add manually
          </button>
        </>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <header className="bg-white/90 backdrop-blur-md border-b border-gray-100 px-6 py-3.5 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-gray-600 transition-colors duration-150 p-2 rounded-xl hover:bg-gray-100 cursor-pointer shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-2.5">
            <img src="/src/assets/logo.png" alt="DAFH Transfer" className="w-6 h-6 object-contain" />
            <span className="font-semibold text-gray-900 tracking-tight text-sm">DAFH Transfer</span>
          </div>
          <span className="ml-auto text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Step 1 of 3</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-2">Your Transcripts</h1>
          <p className="text-sm text-gray-400 leading-relaxed">
            Go to your unofficial transcript, press Cmd+A then Cmd+C, and paste below.
          </p>
        </div>

        {renderSchool('deanza', 'De Anza College')}
        {renderSchool('foothill', 'Foothill College')}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-indigo-600 text-white rounded-2xl py-3.5 font-semibold text-sm hover:bg-indigo-500 hover:shadow-md hover:shadow-indigo-300/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 tracking-tight cursor-pointer"
        >
          {saving ? 'Saving...' : 'Save and Continue'}
        </button>
      </main>
    </div>
  )
}
