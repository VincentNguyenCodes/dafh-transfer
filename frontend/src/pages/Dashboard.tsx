import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import ClassesTab from './ClassesTab'
import RequirementsTab from './RequirementsTab'
import TransferTargetsTab from './TransferTargetsTab'

const STEPS = [
  { num: 1, label: 'Add Your Classes', desc: 'Paste your De Anza and Foothill transcripts', path: '/transcript', icon: '📄' },
  { num: 2, label: 'Choose Schools & Majors', desc: 'Select which schools and majors you are applying to', path: '/schools', icon: '🎓' },
  { num: 3, label: 'View Your Results', desc: 'See which classes you still need to take', path: '/dashboard', icon: '✅' },
]

type Tab = 'requirements' | 'targets' | 'classes'

const TABS: { id: Tab; label: string }[] = [
  { id: 'requirements', label: 'Requirements' },
  { id: 'targets', label: 'Transfer Targets' },
  { id: 'classes', label: 'Classes' },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('requirements')

  useEffect(() => {
    api.get('/progress/').then(({ data }) => setCurrentStep(data.current_step))
  }, [])

  const logout = () => {
    localStorage.removeItem('access')
    localStorage.removeItem('refresh')
    navigate('/')
  }

  if (currentStep === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (currentStep < 3) {
    const nextPath = STEPS.find((s) => s.num === currentStep)?.path ?? '/transcript'
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-gray-100 px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xs">D</span>
              </div>
              <span className="font-semibold text-gray-900">DAFH Transfer</span>
            </div>
            <button onClick={logout} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
              Log out
            </button>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-6 py-10">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Your Transfer Plan</h1>
            <p className="text-gray-500 text-sm">Complete each step to see which classes you still need.</p>
          </div>

          <div className="space-y-3 mb-8">
            {STEPS.map((step) => {
              const isDone = step.num < currentStep
              const isCurrent = step.num === currentStep
              const isLocked = step.num > currentStep

              return (
                <button
                  key={step.num}
                  onClick={() => !isLocked && navigate(step.path)}
                  disabled={isLocked}
                  className={`w-full flex items-center gap-4 p-5 rounded-2xl border text-left transition-all ${
                    isCurrent
                      ? 'bg-indigo-600 border-indigo-600 shadow-lg shadow-indigo-200'
                      : isDone
                      ? 'bg-white border-gray-100 shadow-sm hover:shadow-md'
                      : 'bg-white border-gray-100 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${
                    isCurrent ? 'bg-indigo-500' : isDone ? 'bg-green-50' : 'bg-gray-50'
                  }`}>
                    {isDone ? '✓' : step.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm ${isCurrent ? 'text-white' : 'text-gray-900'}`}>
                      {step.label}
                    </p>
                    <p className={`text-xs mt-0.5 ${isCurrent ? 'text-indigo-200' : 'text-gray-400'}`}>
                      {step.desc}
                    </p>
                  </div>
                  {!isLocked && (
                    <span className={`text-lg ${isCurrent ? 'text-indigo-200' : 'text-gray-300'}`}>→</span>
                  )}
                </button>
              )
            })}
          </div>

          <button
            onClick={() => navigate(nextPath)}
            className="w-full bg-indigo-600 text-white rounded-2xl py-4 font-semibold text-sm hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-200"
          >
            Continue →
          </button>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">D</span>
            </div>
            <span className="font-semibold text-gray-900">DAFH Transfer</span>
          </div>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            Log out
          </button>
        </div>
      </header>

      <div className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {activeTab === 'requirements' && <RequirementsTab />}
        {activeTab === 'targets' && <TransferTargetsTab />}
        {activeTab === 'classes' && <ClassesTab />}
      </main>
    </div>
  )
}
