import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import ClassesTab from './ClassesTab'
import RequirementsTab from './RequirementsTab'
import SchedulesTab from './SchedulesTab'
import TransferTargetsTab from './TransferTargetsTab'

const STEPS = [
  { num: 1, label: 'Add Your Classes', desc: 'Paste your De Anza and Foothill transcripts', path: '/transcript', icon: '📄' },
  { num: 2, label: 'Choose Schools & Majors', desc: 'Select which schools and majors you are applying to', path: '/schools', icon: '🎓' },
  { num: 3, label: 'View Your Results', desc: 'See which classes you still need to take', path: '/dashboard', icon: '✅' },
]

type Tab = 'requirements' | 'schedules' | 'targets' | 'classes'

const TABS: { id: Tab; label: string }[] = [
  { id: 'requirements', label: 'Requirements' },
  { id: 'schedules', label: 'Schedules' },
  { id: 'targets', label: 'Transfer Targets' },
  { id: 'classes', label: 'Classes' },
]

function Header({ onLogout }: { onLogout: () => void }) {
  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 px-6 py-4 sticky top-0 z-30">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/src/assets/logo.png" alt="DAFH Transfer" className="w-8 h-8 object-contain" />
          <span className="font-semibold text-gray-900 tracking-tight">DAFH Transfer</span>
        </div>
        <button
          onClick={onLogout}
          className="text-sm text-gray-400 hover:text-gray-700 font-medium transition-colors duration-150 px-3 py-1.5 rounded-lg hover:bg-gray-100"
        >
          Log out
        </button>
      </div>
    </header>
  )
}

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
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-[2.5px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400 font-medium">Loading...</p>
        </div>
      </div>
    )
  }

  if (currentStep < 3) {
    const nextPath = STEPS.find((s) => s.num === currentStep)?.path ?? '/transcript'
    return (
      <div className="min-h-screen bg-[#f5f5f7]">
        <Header onLogout={logout} />

        <main className="max-w-xl mx-auto px-6 py-12">
          <div className="mb-10">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1.5">Your Transfer Plan</h1>
            <p className="text-gray-400 text-sm">Complete each step to see which classes you still need.</p>
          </div>

          <div className="space-y-2.5 mb-8">
            {STEPS.map((step) => {
              const isDone = step.num < currentStep
              const isCurrent = step.num === currentStep
              const isLocked = step.num > currentStep

              return (
                <button
                  key={step.num}
                  onClick={() => !isLocked && navigate(step.path)}
                  disabled={isLocked}
                  className={`w-full flex items-center gap-4 p-5 rounded-2xl border text-left transition-all duration-200 ${
                    isCurrent
                      ? 'bg-indigo-600 border-indigo-600 shadow-lg shadow-indigo-500/20 hover:bg-indigo-500'
                      : isDone
                      ? 'bg-white border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-px'
                      : 'bg-white border-gray-100 opacity-40 cursor-not-allowed'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${
                    isCurrent ? 'bg-white/15' : isDone ? 'bg-green-50' : 'bg-gray-50'
                  }`}>
                    {isDone ? '✓' : step.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm tracking-tight ${isCurrent ? 'text-white' : 'text-gray-900'}`}>
                      {step.label}
                    </p>
                    <p className={`text-xs mt-0.5 ${isCurrent ? 'text-white/60' : 'text-gray-400'}`}>
                      {step.desc}
                    </p>
                  </div>
                  {!isLocked && (
                    <span className={`text-sm font-medium ${isCurrent ? 'text-white/50' : 'text-gray-300'}`}>→</span>
                  )}
                </button>
              )
            })}
          </div>

          <button
            onClick={() => navigate(nextPath)}
            className="w-full bg-indigo-600 text-white rounded-2xl py-4 font-semibold text-sm hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20 transition-all duration-200 tracking-tight"
          >
            Continue
          </button>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <Header onLogout={logout} />

      <div className="sticky top-[65px] z-20 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-5xl mx-auto flex overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3.5 text-sm font-medium border-b-2 whitespace-nowrap transition-all duration-200 ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-8 py-8">
        {activeTab === 'requirements' && <RequirementsTab />}
        {activeTab === 'schedules' && <SchedulesTab />}
        {activeTab === 'targets' && <TransferTargetsTab />}
        {activeTab === 'classes' && <ClassesTab />}
      </main>
    </div>
  )
}
