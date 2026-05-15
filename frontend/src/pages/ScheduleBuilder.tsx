import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { Fragment, useMemo, useState } from 'react'

export type ClassItem = {
  code: string
  name: string
  units: number | null
  needed_for: string[]
  kind?: 'required' | 'recommended' | 'prereq'
  prereq_for?: string
}

export type Quarter = {
  id: string
  term: 'Fall' | 'Winter' | 'Spring' | 'Summer'
  year: number
  class_codes: string[]
}

const TERMS: Quarter['term'][] = ['Winter', 'Spring', 'Summer', 'Fall']
const BANK_ID = 'bank'

type Props = {
  classBank: ClassItem[]
  prePlaced?: ClassItem[]
  initialQuarters?: Quarter[]
  name: string
  onNameChange: (name: string) => void
  onBack: () => void
  onSave: (quarters: Quarter[], remainingBank: ClassItem[]) => void
  saving: boolean
  error: string
}

export default function ScheduleBuilder({ classBank, prePlaced = [], initialQuarters = [], name, onNameChange, onBack, onSave, saving, error }: Props) {
  const [editingName, setEditingName] = useState(!name)
  const [draftName, setDraftName] = useState(name)
  const [quarters, setQuarters] = useState<Quarter[]>(initialQuarters)
  const [bankCodes, setBankCodes] = useState<string[]>(() => {
    const placed = new Set(initialQuarters.flatMap((q) => q.class_codes))
    return classBank.map((c) => c.code).filter((code) => !placed.has(code))
  })
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const classByCode = useMemo(() => {
    const m = new Map<string, ClassItem>()
    for (const c of classBank) m.set(c.code, c)
    for (const c of prePlaced) if (!m.has(c.code)) m.set(c.code, c)
    return m
  }, [classBank, prePlaced])

  const addQuarter = () => {
    const lastYear = quarters.length > 0 ? quarters[quarters.length - 1].year : new Date().getFullYear()
    const lastTermIdx = quarters.length > 0 ? TERMS.indexOf(quarters[quarters.length - 1].term) : -1
    let nextTermIdx = (lastTermIdx + 1) % TERMS.length
    let nextYear = lastYear
    if (lastTermIdx >= 0 && nextTermIdx === 0) nextYear = lastYear + 1
    setQuarters((q) => [...q, {
      id: `q-${Date.now()}`,
      term: TERMS[nextTermIdx],
      year: nextYear,
      class_codes: [],
    }])
  }

  const removeQuarter = (id: string) => {
    setQuarters((qs) => {
      const removed = qs.find((q) => q.id === id)
      if (removed) setBankCodes((b) => [...b, ...removed.class_codes])
      return qs.filter((q) => q.id !== id)
    })
  }

  const updateQuarter = (id: string, patch: Partial<Quarter>) => {
    setQuarters((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)))
  }

  const onDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id))
  }

  const onDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null)
    const code = String(e.active.id)
    const overId = e.over ? String(e.over.id) : null
    if (!overId) return

    setQuarters((qs) => qs.map((q) => ({ ...q, class_codes: q.class_codes.filter((c) => c !== code) })))
    setBankCodes((b) => b.filter((c) => c !== code))

    if (overId === BANK_ID) {
      setBankCodes((b) => (b.includes(code) ? b : [...b, code]))
    } else {
      setQuarters((qs) => qs.map((q) => (q.id === overId ? { ...q, class_codes: [...q.class_codes, code] } : q)))
    }
  }

  const remainingBank = useMemo(
    () => bankCodes
      .map((code) => classByCode.get(code))
      .filter((c): c is ClassItem => !!c)
      .sort((a, b) => a.code.localeCompare(b.code)),
    [bankCodes, classByCode]
  )

  const totalRemaining = bankCodes.length
  const totalPlanned = quarters.reduce((n, q) => n + q.class_codes.length, 0)

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2 mb-1">
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && draftName.trim()) {
                      onNameChange(draftName.trim())
                      setEditingName(false)
                    }
                    if (e.key === 'Escape' && name) {
                      setDraftName(name)
                      setEditingName(false)
                    }
                  }}
                  placeholder="Name this schedule..."
                  autoFocus
                  className="text-xl font-bold text-gray-900 bg-transparent border-b-2 border-indigo-400 focus:outline-none focus:border-indigo-600 px-1 py-0.5 flex-1"
                />
                <button
                  onClick={() => {
                    if (!draftName.trim()) return
                    onNameChange(draftName.trim())
                    setEditingName(false)
                  }}
                  disabled={!draftName.trim()}
                  className="text-sm bg-indigo-600 text-white px-3 py-1 rounded-lg disabled:opacity-40 hover:bg-indigo-700"
                >
                  Set
                </button>
                {name && (
                  <button
                    onClick={() => { setDraftName(name); setEditingName(false) }}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-gray-900 truncate">{name}</h2>
                <button
                  onClick={() => { setDraftName(name); setEditingName(true) }}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Rename
                </button>
              </div>
            )}
            <p className="text-gray-500 text-sm">Drag classes from the bank into the quarter you plan to take them.</p>
          </div>
          <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700 shrink-0 mt-1">Back</button>
        </div>

        <div className="text-xs text-gray-500 mb-3">
          {totalRemaining} in bank · {totalPlanned} planned across {quarters.length} quarter{quarters.length === 1 ? '' : 's'}
        </div>

        <ClassBank items={remainingBank} />

        <div className="mt-6 -mx-8 px-8 overflow-x-auto pb-3">
          <div className="flex gap-3 items-start min-w-min">
            {quarters.map((q) => (
              <QuarterCard
                key={q.id}
                quarter={q}
                classes={q.class_codes.map((code) => classByCode.get(code) || { code, name: code, units: null, needed_for: [] })}
                onChange={(patch) => updateQuarter(q.id, patch)}
                onRemove={() => removeQuarter(q.id)}
              />
            ))}
            <button
              onClick={addQuarter}
              className="shrink-0 w-56 h-32 border-2 border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-2xl text-sm font-medium text-gray-500 transition-colors"
            >
              + Add quarter
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-500 mt-4">{error}</p>}

        <div className="sticky bottom-0 -mx-8 mt-6 px-8 py-3 bg-white border-t border-gray-100 flex items-center justify-between">
          <button onClick={onBack} className="text-sm text-gray-700 hover:text-gray-900 font-medium">Back</button>
          <button
            onClick={() => {
              if (!name) { setEditingName(true); return }
              onSave(quarters, remainingBank)
            }}
            disabled={saving}
            className="bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-40 hover:bg-indigo-700 transition-colors"
          >
            {saving ? 'Saving...' : 'Save schedule'}
          </button>
        </div>
      </div>

      <DragOverlay>
        {activeDragId && classByCode.get(activeDragId) ? (
          <ClassChip c={classByCode.get(activeDragId)!} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function buildPrereqGroups(items: ClassItem[]): ClassItem[][] {
  const byCode = new Map(items.map((c) => [c.code, c]))
  const childrenOf = new Map<string, ClassItem[]>()
  const standalone: ClassItem[] = []
  for (const c of items) {
    if (c.prereq_for && byCode.has(c.prereq_for)) {
      const arr = childrenOf.get(c.prereq_for) || []
      arr.push(c)
      childrenOf.set(c.prereq_for, arr)
    } else {
      standalone.push(c)
    }
  }
  return standalone.map((parent) => {
    const chain: ClassItem[] = []
    const stack = [parent.code]
    const visited = new Set<string>()
    while (stack.length) {
      const cur = stack.pop()!
      if (visited.has(cur)) continue
      visited.add(cur)
      const kids = (childrenOf.get(cur) || []).slice().sort((a, b) => a.code.localeCompare(b.code))
      for (const k of kids) {
        chain.push(k)
        stack.push(k.code)
      }
    }
    chain.sort((a, b) => a.code.localeCompare(b.code))
    return [...chain, parent]
  })
}

function ClassBank({ items }: { items: ClassItem[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: BANK_ID })
  const groups = useMemo(() => buildPrereqGroups(items), [items])
  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border-2 ${isOver ? 'border-indigo-300 bg-indigo-50/40' : 'border-gray-100 bg-white'} shadow-sm overflow-hidden transition-colors`}
    >
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-gray-900">Class bank</p>
          <p className="text-xs text-gray-500 mt-0.5">Drag a class into a quarter below</p>
        </div>
        <span className="text-xs font-bold text-gray-600 bg-white px-2 py-0.5 rounded-full border border-gray-200">{items.length}</span>
      </div>
      <div className="p-4">
        {items.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">All classes have been placed.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => g.length === 1 ? (
              <ClassChip key={g[0].code} c={g[0]} />
            ) : (
              <div key={g[g.length - 1].code} className="flex items-center gap-1 px-1.5 py-1 rounded-xl bg-blue-50/40 border border-blue-200">
                {g.map((c, i) => (
                  <Fragment key={c.code}>
                    {i > 0 && <span className="text-blue-400 text-xs font-bold">→</span>}
                    <ClassChip c={c} />
                  </Fragment>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function QuarterCard({
  quarter,
  classes,
  onChange,
  onRemove,
}: {
  quarter: Quarter
  classes: ClassItem[]
  onChange: (patch: Partial<Quarter>) => void
  onRemove: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: quarter.id })
  const totalUnits = classes.reduce((n, c) => n + (c.units || 0), 0)

  return (
    <div
      ref={setNodeRef}
      className={`shrink-0 w-56 rounded-2xl border-2 ${isOver ? 'border-indigo-300 bg-indigo-50/40' : 'border-gray-100 bg-white'} shadow-sm flex flex-col transition-colors`}
    >
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="flex items-center gap-1 mb-1">
          <select
            value={quarter.term}
            onChange={(e) => onChange({ term: e.target.value as Quarter['term'] })}
            className="text-sm font-bold text-gray-900 bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded px-1 min-w-0"
          >
            {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            type="number"
            value={quarter.year}
            onChange={(e) => onChange({ year: parseInt(e.target.value || '0', 10) })}
            className="text-sm font-bold text-gray-900 w-16 bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded px-1"
          />
          <button onClick={onRemove} className="ml-auto text-xs text-gray-400 hover:text-red-500 transition-colors">×</button>
        </div>
        <p className="text-xs text-gray-500">{totalUnits}u · {classes.length} class{classes.length === 1 ? '' : 'es'}</p>
      </div>
      <div className="p-2 flex-1 min-h-[120px]">
        {classes.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">Drop classes here</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {classes.map((c) => <ClassChip key={c.code} c={c} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function abbreviateSchool(name: string): string {
  if (name === 'IGETC' || name === 'CSU GE') return name
  if (name.startsWith('prereq for ')) return `→ ${name.slice('prereq for '.length)}`
  const lower = name.toLowerCase()
  if (lower.includes('berkeley')) return 'UCB'
  if (lower.includes('los angeles')) return 'UCLA'
  if (lower.includes('san diego')) return 'UCSD'
  if (lower.includes('santa barbara')) return 'UCSB'
  if (lower.includes('irvine')) return 'UCI'
  if (lower.includes('davis')) return 'UCD'
  if (lower.includes('santa cruz')) return 'UCSC'
  if (lower.includes('riverside')) return 'UCR'
  if (lower.includes('merced')) return 'UCM'
  if (lower.includes('san luis obispo') || lower.includes('polytechnic')) return 'CP SLO'
  const words = name.split(/[\s,]+/).filter(Boolean)
  return words.map((w) => w[0]).join('').slice(0, 4).toUpperCase()
}

function ClassChip({ c, dragging }: { c: ClassItem; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.code })
  const hidden = isDragging && !dragging
  const isRequired = c.kind === 'required'
  const isRecommended = c.kind === 'recommended'
  const isPrereq = c.kind === 'prereq'
  const colorClass = isRequired
    ? 'border-red-200 bg-red-50'
    : isRecommended
      ? 'border-yellow-200 bg-yellow-50'
      : isPrereq
        ? 'border-blue-200 bg-blue-50'
        : 'border-gray-200 bg-white'
  const schoolAbbrevs = (c.needed_for || []).filter(Boolean).map(abbreviateSchool)
  const uniqueSchools = Array.from(new Set(schoolAbbrevs))
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      title={c.needed_for && c.needed_for.length > 0 ? `${c.kind === 'required' ? 'Required' : c.kind === 'recommended' ? 'Recommended' : ''} for: ${c.needed_for.join(', ')}` : undefined}
      className={`flex flex-col gap-0.5 px-3 py-2 rounded-xl border ${colorClass} cursor-grab active:cursor-grabbing select-none shadow-sm ${
        hidden ? 'opacity-30' : ''
      } ${dragging ? 'shadow-lg' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-semibold text-gray-900">{c.code}</span>
        {c.units != null && <span className="text-xs text-gray-400">{c.units}u</span>}
      </div>
      {uniqueSchools.length > 0 && (
        <span className="text-[10px] text-gray-500 font-medium">{uniqueSchools.join(' · ')}</span>
      )}
    </div>
  )
}
