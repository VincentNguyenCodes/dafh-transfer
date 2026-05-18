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
    <div className="glass rounded-xl px-4 py-3.5 flex flex-col gap-1">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</p>
      <p className={`text-2xl font-bold ${accent}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Progress</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <StatCard label="Required Done" value={`${doneReq}/${totalReq}`} sub={`${Math.round(reqPct)}% complete`} accent="text-indigo-600" />
          <StatCard label="Recommended Done" value={`${doneRec}/${totalRec}`} sub={`${Math.round(recPct)}% complete`} accent="text-violet-500" />
          <StatCard label="Classes Logged" value={entries.length} sub={`${inProgress.length} in progress`} accent="text-gray-800" />
          <StatCard label="Transfer Targets" value={targets.length} accent="text-gray-800" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Progress by Target</p>
          <div className="glass rounded-xl overflow-hidden divide-y divide-white/40">
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
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Classes Breakdown</p>
          <div className="glass rounded-xl overflow-hidden divide-y divide-white/40">
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
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Overall</p>
        <div className="glass rounded-xl px-4 py-4 space-y-3">
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
