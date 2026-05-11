import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

type Institution = { id: number; names: { name: string }[] }
type Major = { label: string; key: string }
type Target = { id?: number; receiving_institution_id: number; receiving_institution_name: string; major_name: string; major_code: string; academic_year_id: number }

const DEANZA_ID = 113
const FOOTHILL_ID = 112

export default function Schools() {
  const navigate = useNavigate()
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [savedTargets, setSavedTargets] = useState<Target[]>([])
  const [rows, setRows] = useState<Partial<Target>[]>([{}])
  const [majorsMap, setMajorsMap] = useState<Record<number, Major[]>>({})
  const [academicYearId, setAcademicYearId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get('/assist/institutions/'),
      api.get('/assist/academic-years/'),
      api.get('/targets/'),
    ]).then(([instRes, yearRes, targetsRes]) => {
      setInstitutions(instRes.data)
      const years: { id: number; code: string }[] = yearRes.data
      const latest = years.sort((a, b) => b.code.localeCompare(a.code))[0]
      if (latest) setAcademicYearId(latest.id)
      setSavedTargets(targetsRes.data)
    }).finally(() => setLoading(false))
  }, [])

  const loadMajors = async (institutionId: number, rowIdx: number) => {
    if (majorsMap[institutionId] || !academicYearId) return
    try {
      const [daRes, fhRes] = await Promise.all([
        api.get(`/assist/majors/?receivingId=${institutionId}&sendingId=${DEANZA_ID}&academicYearId=${academicYearId}`),
        api.get(`/assist/majors/?receivingId=${institutionId}&sendingId=${FOOTHILL_ID}&academicYearId=${academicYearId}`),
      ])
      const combined: Major[] = [
        ...(daRes.data?.agreements || []).map((a: { label: string; major?: { code: string } }) => ({ label: a.label, key: a.major?.code || a.label })),
        ...(fhRes.data?.agreements || []).map((a: { label: string; major?: { code: string } }) => ({ label: a.label, key: a.major?.code || a.label })),
      ]
      const unique = Array.from(new Map(combined.map((m) => [m.key, m])).values())
      setMajorsMap((prev) => ({ ...prev, [institutionId]: unique }))
    } catch {
      setMajorsMap((prev) => ({ ...prev, [institutionId]: [] }))
    }
    void rowIdx
  }

  const updateRow = (idx: number, field: keyof Target, value: string | number) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))
    if (field === 'receiving_institution_id') {
      const id = Number(value)
      const inst = institutions.find((i) => i.id === id)
      if (inst) {
        setRows((prev) => prev.map((r, i) => i === idx ? { ...r, receiving_institution_id: id, receiving_institution_name: inst.names[0]?.name || '' } : r))
        loadMajors(id, idx)
      }
    }
  }

  const deleteTarget = async (id: number) => {
    await api.delete(`/targets/${id}/`)
    setSavedTargets((prev) => prev.filter((t) => t.id !== id))
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      for (const row of rows) {
        if (!row.receiving_institution_id || !row.major_code) continue
        const { data } = await api.post('/targets/', { ...row, academic_year_id: academicYearId })
        setSavedTargets((prev) => [...prev, data])
      }
      setRows([{}])
      await api.patch('/progress/', { current_step: 3 })
      navigate('/results')
    } catch {
      setError('Failed to save targets. Please check your selections.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading schools...</div>

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-400 hover:text-gray-600 mb-4">
          Back to dashboard
        </button>
        <h1 className="text-2xl font-bold mb-2">Transfer Targets</h1>
        <p className="text-sm text-gray-500 mb-6">
          Add each school and major you want to transfer to. You can add as many as you'd like.
        </p>

        {savedTargets.length > 0 && (
          <div className="bg-white rounded-2xl shadow-md p-5 mb-4">
            <p className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wide">Saved targets</p>
            <div className="space-y-2">
              {savedTargets.map((t) => (
                <div key={t.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2 text-sm">
                  <span className="font-medium">{t.receiving_institution_name}</span>
                  <span className="text-gray-500 flex-1 mx-4">{t.major_name}</span>
                  <button onClick={() => deleteTarget(t.id!)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-md p-6 mb-4">
          <p className="text-sm font-medium text-gray-500 mb-4 uppercase tracking-wide">Add schools</p>
          {rows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-2 gap-3 mb-3">
              <select
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={row.receiving_institution_id || ''}
                onChange={(e) => updateRow(idx, 'receiving_institution_id', Number(e.target.value))}
              >
                <option value="">Select a school...</option>
                {institutions
                  .filter((i) => i.id !== DEANZA_ID && i.id !== FOOTHILL_ID)
                  .map((i) => (
                    <option key={i.id} value={i.id}>{i.names[0]?.name || `Institution ${i.id}`}</option>
                  ))}
              </select>

              <select
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-40"
                value={row.major_code || ''}
                disabled={!row.receiving_institution_id}
                onChange={(e) => {
                  const opt = majorsMap[row.receiving_institution_id!]?.find((m) => m.key === e.target.value)
                  setRows((prev) => prev.map((r, i) => i === idx ? { ...r, major_code: e.target.value, major_name: opt?.label || '' } : r))
                }}
              >
                <option value="">Select a major...</option>
                {(majorsMap[row.receiving_institution_id!] || []).map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </div>
          ))}
          <button
            onClick={() => setRows((prev) => [...prev, {}])}
            className="text-sm text-indigo-600 hover:text-indigo-800"
          >
            + Add another school
          </button>
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-indigo-600 text-white rounded-xl py-3 font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save and See Results'}
        </button>
      </div>
    </div>
  )
}
