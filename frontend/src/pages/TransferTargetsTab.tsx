import { useEffect, useState } from 'react'
import api from '../api/client'
import Select from '../components/Select'

type Institution = { id: number; name: string }
type Major = { label: string; key: string }
type Target = {
  id?: number
  receiving_institution_id: number
  receiving_institution_name: string
  major_name: string
  major_code: string
  academic_year_id: number
}
type Row = Partial<Target>

export default function TransferTargetsTab() {
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [savedTargets, setSavedTargets] = useState<Target[]>([])
  const [rows, setRows] = useState<Row[]>([{}])
  const [majorsMap, setMajorsMap] = useState<Record<number, Major[] | 'loading'>>({})
  const [academicYearId, setAcademicYearId] = useState<number>(76)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editMajorKey, setEditMajorKey] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/assist/institutions/'),
      api.get('/assist/academic-years/'),
      api.get('/targets/'),
    ]).then(([instRes, yearRes, targetsRes]) => {
      setInstitutions(instRes.data)
      if (yearRes.data?.latestYearId) setAcademicYearId(yearRes.data.latestYearId)
      setSavedTargets(targetsRes.data)
    }).finally(() => setLoading(false))
  }, [])

  const loadMajors = async (institutionId: number) => {
    if (majorsMap[institutionId] !== undefined) return
    setMajorsMap((prev) => ({ ...prev, [institutionId]: 'loading' }))
    try {
      const res = await api.get(`/assist/majors/?receivingId=${institutionId}&academicYearId=${academicYearId}`)
      setMajorsMap((prev) => ({ ...prev, [institutionId]: res.data }))
    } catch {
      setMajorsMap((prev) => ({ ...prev, [institutionId]: [] }))
    }
  }

  const updateRow = (idx: number, field: keyof Row, value: string | number) => {
    setRows((prev) => prev.map((r, i) => {
      if (i !== idx) return r
      const updated = { ...r, [field]: value }
      if (field === 'receiving_institution_id') {
        const id = Number(value)
        const inst = institutions.find((ins) => ins.id === id)
        updated.receiving_institution_name = inst?.name ?? ''
        updated.major_name = ''
        updated.major_code = ''
        loadMajors(id)
      }
      if (field === 'major_key') {
        const majors = majorsMap[r.receiving_institution_id!]
        const major = Array.isArray(majors) ? majors.find((m) => m.key === value) : null
        updated.major_name = major?.label ?? ''
        updated.major_code = major?.key ?? ''
        delete (updated as Record<string, unknown>)['major_key']
      }
      return updated
    }))
  }

  const deleteTarget = async (id: number) => {
    await api.delete(`/targets/${id}/`)
    setSavedTargets((prev) => prev.filter((t) => t.id !== id))
  }

  const startEdit = (t: Target) => {
    setEditingId(t.id!)
    setEditMajorKey(t.major_code)
    loadMajors(t.receiving_institution_id)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditMajorKey('')
  }

  const handleEdit = async (t: Target) => {
    const majors = majorsMap[t.receiving_institution_id]
    const major = Array.isArray(majors) ? majors.find((m) => m.key === editMajorKey) : null
    if (!major || major.key === t.major_code) { cancelEdit(); return }
    setError('')
    try {
      await api.delete(`/targets/${t.id}/`)
      const { data } = await api.post('/targets/', {
        receiving_institution_id: t.receiving_institution_id,
        receiving_institution_name: t.receiving_institution_name,
        major_name: major.label,
        major_code: major.key,
        academic_year_id: t.academic_year_id,
      })
      setSavedTargets((prev) => prev.map((s) => s.id === t.id ? data : s))
      cancelEdit()
    } catch {
      setError('Failed to update. Try again.')
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      let saved = false
      for (const row of rows) {
        if (!row.receiving_institution_id || !row.major_name) continue
        const { data } = await api.post('/targets/', {
          receiving_institution_id: row.receiving_institution_id,
          receiving_institution_name: row.receiving_institution_name,
          major_name: row.major_name,
          major_code: row.major_code,
          academic_year_id: academicYearId,
        })
        setSavedTargets((prev) => [...prev, data])
        saved = true
      }
      if (saved) setRows([{}])
    } catch {
      setError('Failed to save. Check your selections and try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Loading schools from ASSIST.org...</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Transfer Targets</h2>
        <p className="text-gray-500 text-sm">Add each school and major you want to transfer to.</p>
      </div>

      {savedTargets.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Saved targets</p>
          <div className="space-y-2">
            {savedTargets.map((t) => (
              <div key={t.id} className="bg-gray-50 rounded-xl px-4 py-3">
                {editingId === t.id ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-900">{t.receiving_institution_name}</p>
                    <Select
                      value={editMajorKey}
                      disabled={majorsMap[t.receiving_institution_id] === 'loading'}
                      onChange={(v) => setEditMajorKey(String(v))}
                      placeholder={majorsMap[t.receiving_institution_id] === 'loading' ? 'Loading majors...' : 'Select a major...'}
                      options={Array.isArray(majorsMap[t.receiving_institution_id])
                        ? (majorsMap[t.receiving_institution_id] as Major[]).map((m) => ({ value: m.key, label: m.label }))
                        : []}
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleEdit(t)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{t.receiving_institution_name}</p>
                      <p className="text-xs text-gray-500 truncate">{t.major_name}</p>
                    </div>
                    <button
                      onClick={() => startEdit(t)}
                      className="text-indigo-400 hover:text-indigo-600 text-xs shrink-0 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteTarget(t.id!)}
                      className="text-red-400 hover:text-red-600 text-xs shrink-0 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Add target</p>
        <div className="space-y-4">
          {rows.map((row, idx) => (
            <div key={idx} className="space-y-3">
              <Select
                placeholder="Select a school..."
                value={row.receiving_institution_id ?? ''}
                onChange={(v) => updateRow(idx, 'receiving_institution_id', Number(v))}
                options={institutions.map((inst) => ({ value: inst.id, label: inst.name }))}
              />

              {row.receiving_institution_id && (
                <Select
                  placeholder={majorsMap[row.receiving_institution_id] === 'loading' ? 'Loading majors...' : 'Select a major...'}
                  value={row.major_code ?? ''}
                  disabled={majorsMap[row.receiving_institution_id] === 'loading' || !majorsMap[row.receiving_institution_id]}
                  onChange={(v) => updateRow(idx, 'major_key' as keyof Row, v)}
                  options={Array.isArray(majorsMap[row.receiving_institution_id])
                    ? (majorsMap[row.receiving_institution_id] as Major[]).map((m) => ({ value: m.key, label: m.label }))
                    : []}
                />
              )}

              {rows.length > 1 && (
                <button
                  onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                  className="flex items-center gap-1.5 text-xs font-medium text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Remove row
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={() => setRows((prev) => [...prev, {}])}
          className="mt-4 text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
        >
          + Add another school
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-indigo-600 text-white rounded-2xl py-4 font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-indigo-200"
      >
        {saving ? 'Saving...' : 'Save Target'}
      </button>
    </div>
  )
}
