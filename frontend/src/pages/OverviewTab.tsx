import { useEffect, useState } from 'react'
import api from '../api/client'

type Target = {
  id: number
  receiving_institution_name: string
  major_name: string
}

type TargetResult = {
  target: string
  school_name: string
  major_name: string
  total: number
  satisfied: number
  requirements: { satisfied: boolean; no_articulation: boolean }[]
  recommended: { satisfied: boolean; no_articulation: boolean }[]
}

type Entry = {
  school: 'deanza' | 'foothill'
  status: 'completed' | 'in_progress'
}

export default function OverviewTab() {
  const [results, setResults] = useState<TargetResult[] | null>(null)
  const [targets, setTargets] = useState<Target[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/results/'),
      api.get('/targets/'),
      api.get('/transcript/'),
    ]).then(([r, t, e]) => {
      setResults(r.data)
      setTargets(t.data)
      setEntries(e.data)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
      </div>
    )
  }

  if (!loading && targets.length === 0 && entries.length === 0) {
    return (
      <div className="py-16 text-center max-w-sm mx-auto">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-gray-900 mb-1">Start your transfer plan</p>
        <p className="text-xs text-gray-500 leading-relaxed mb-6">Add your transcript and pick target schools. DAFH will show exactly which requirements you still need.</p>
        <div className="space-y-2 text-left">
          {[
            { step: '1', label: 'Paste your transcript', sub: 'Go to the Classes tab and paste your De Anza or Foothill transcript' },
            { step: '2', label: 'Add target schools', sub: 'Go to the Targets tab, pick a school and major' },
            { step: '3', label: 'View your requirements', sub: 'Come back here — requirements will load automatically' },
          ].map((s) => (
            <div key={s.step} className="flex gap-3 p-3 card-elevated rounded-xl">
              <span className="text-xs font-bold text-indigo-600 w-4 shrink-0 mt-0.5">{s.step}</span>
              <div>
                <p className="text-xs font-semibold text-gray-900">{s.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const deanza = entries.filter((e) => e.school === 'deanza')
  const foothill = entries.filter((e) => e.school === 'foothill')
  const inProgress = entries.filter((e) => e.status === 'in_progress')

  const totalReq = results?.reduce((n, r) => n + r.requirements.filter((x) => !x.no_articulation).length, 0) ?? 0
  const doneReq = results?.reduce((n, r) => n + r.requirements.filter((x) => x.satisfied).length, 0) ?? 0
  const totalRec = results?.reduce((n, r) => n + r.recommended.filter((x) => !x.no_articulation).length, 0) ?? 0
  const doneRec = results?.reduce((n, r) => n + r.recommended.filter((x) => x.satisfied).length, 0) ?? 0

  const reqPct = totalReq > 0 ? (doneReq / totalReq) * 100 : 0
  const recPct = totalRec > 0 ? (doneRec / totalRec) * 100 : 0

  const StatCard = ({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent: string }) => (
    <div className="card-elevated rounded-xl px-4 py-3.5 flex flex-col gap-1">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${accent}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-2 px-1">Progress</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <StatCard label="Required Done" value={`${doneReq}/${totalReq}`} sub={`${Math.round(reqPct)}% complete`} accent="text-indigo-600" />
          <StatCard label="Recommended Done" value={`${doneRec}/${totalRec}`} sub={`${Math.round(recPct)}% complete`} accent="text-violet-500" />
          <StatCard label="Classes Logged" value={entries.length} sub={`${inProgress.length} in progress`} accent="text-gray-800" />
          <StatCard label="Transfer Targets" value={targets.length} accent="text-gray-800" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2 px-1">Progress by Target</p>
          <div className="card-elevated rounded-xl overflow-hidden divide-y divide-gray-100">
            {results && results.length > 0 ? results.map((r) => {
              const req = r.requirements.filter((x) => !x.no_articulation)
              const done = req.filter((x) => x.satisfied).length
              const pct = req.length > 0 ? (done / req.length) * 100 : 0
              return (
                <div key={r.target} className="px-4 py-3 hover:bg-black/[0.02] transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{r.school_name}</p>
                      <p className="text-[11px] text-gray-400 truncate">{r.major_name}</p>
                    </div>
                    <span className="text-xs font-bold text-indigo-600 shrink-0 ml-3">{done}/{req.length}</span>
                  </div>
                  <div className="w-full bg-gray-200/50 rounded-full h-1.5">
                    <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            }) : (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-gray-400">No transfer targets yet — add them in the Targets tab.</p>
              </div>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2 px-1">Classes Breakdown</p>
          <div className="card-elevated rounded-xl overflow-hidden divide-y divide-gray-100">
            {[
              { label: 'De Anza College', completed: deanza.filter((e) => e.status === 'completed').length, inProgress: deanza.filter((e) => e.status === 'in_progress').length },
              { label: 'Foothill College', completed: foothill.filter((e) => e.status === 'completed').length, inProgress: foothill.filter((e) => e.status === 'in_progress').length },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-3 px-4 py-3">
                <div className={`w-2 h-2 rounded-full shrink-0 ${s.label.includes('Anza') ? 'bg-indigo-500' : 'bg-violet-400'}`} />
                <span className="text-xs font-semibold text-gray-800 flex-1">{s.label}</span>
                <span className="text-xs font-bold text-gray-700">{s.completed}</span>
                <span className="text-[11px] text-gray-400">done</span>
                {s.inProgress > 0 && (
                  <>
                    <span className="text-[11px] font-bold text-amber-600">{s.inProgress}</span>
                    <span className="text-[11px] text-gray-400">in progress</span>
                  </>
                )}
              </div>
            ))}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
              <span className="text-xs font-semibold text-gray-800 flex-1">Total</span>
              <span className="text-xs font-bold text-gray-700">{entries.filter((e) => e.status === 'completed').length}</span>
              <span className="text-[11px] text-gray-400">done</span>
              {inProgress.length > 0 && (
                <>
                  <span className="text-[11px] font-bold text-amber-600">{inProgress.length}</span>
                  <span className="text-[11px] text-gray-400">in progress</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-600 mb-2 px-1">Overall</p>
        <div className="card-elevated rounded-xl px-4 py-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold text-gray-500 w-28 shrink-0">Required</span>
            <div className="flex-1 bg-gray-200/50 rounded-full h-2">
              <div className="bg-indigo-500 h-2 rounded-full transition-all duration-500" style={{ width: `${reqPct}%` }} />
            </div>
            <span className="text-xs font-bold text-indigo-600 w-16 text-right shrink-0">{doneReq}/{totalReq}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold text-gray-500 w-28 shrink-0">Recommended</span>
            <div className="flex-1 bg-gray-200/50 rounded-full h-2">
              <div className="bg-violet-400 h-2 rounded-full transition-all duration-500" style={{ width: `${recPct}%` }} />
            </div>
            <span className="text-xs font-bold text-violet-500 w-16 text-right shrink-0">{doneRec}/{totalRec}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
