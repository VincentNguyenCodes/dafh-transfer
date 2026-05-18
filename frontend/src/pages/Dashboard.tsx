import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import AdvisorChat from '../components/AdvisorChat'
import ClassesTab from './ClassesTab'
import OverviewTab from './OverviewTab'
import RequirementsTab from './RequirementsTab'
import SchedulesTab from './SchedulesTab'
import TransferTargetsTab from './TransferTargetsTab'

const STEPS = [
  { num: 1, label: 'Add your classes', desc: 'Paste your De Anza and Foothill transcripts', path: '/transcript' },
  { num: 2, label: 'Choose schools and majors', desc: 'Select which schools and majors you are applying to', path: '/schools' },
  { num: 3, label: 'View your results', desc: 'See which classes you still need to take', path: '/dashboard' },
]

type Tab = 'overview' | 'requirements' | 'calgetc' | 'schedules' | 'targets' | 'classes'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'requirements', label: 'Requirements' },
  { id: 'calgetc', label: 'Cal-GETC' },
  { id: 'schedules', label: 'Schedules' },
  { id: 'targets', label: 'Targets' },
  { id: 'classes', label: 'Classes' },
]

function TopBar({ children, onLogout }: { children?: React.ReactNode; onLogout: () => void }) {
  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-gray-100 px-6 py-3.5 sticky top-0 z-30">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/src/assets/logo.png" alt="DAFH" className="w-6 h-6 object-contain" />
          <span className="text-sm font-semibold text-gray-900 tracking-tight">DAFH Transfer</span>
        </div>
        <div className="flex items-center gap-4">
          {children}
          <button
            onClick={onLogout}
            className="text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors duration-150 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  )
}

function LoadingBar() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-[2px] bg-gray-200/60 overflow-hidden">
      <div
        className="h-full bg-indigo-500/70 rounded-full"
        style={{ animation: 'loadbar 1.6s cubic-bezier(0.4,0,0.2,1) infinite', width: '45%' }}
      />
      <style>{`
        @keyframes loadbar {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
      `}</style>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

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
      <>
        <LoadingBar />
        <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
          <p className="text-xs text-gray-400 font-medium tracking-wide">Loading your plan...</p>
        </div>
      </>
    )
  }

  if (currentStep < 3) {
    const step = STEPS.find((s) => s.num === currentStep)!
    const nextPath = step?.path ?? '/transcript'

    return (
      <div className="min-h-screen bg-white">
        <div className="h-[3px] gradient-brand w-full" />
        <TopBar onLogout={logout} />

        <main className="max-w-md mx-auto px-6 py-14 animate-fade-up">
          <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-[0.15em] mb-10">
            Step {currentStep} of 3
          </p>

          <div className="space-y-2 mb-12">
            {STEPS.map((s) => {
              const isDone = s.num < currentStep
              const isCurrent = s.num === currentStep
              const isLocked = s.num > currentStep

              return (
                <button
                  key={s.num}
                  onClick={() => !isLocked && navigate(s.path)}
                  disabled={isLocked}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left transition-all duration-200 animate-fade-up stagger-${s.num} ${
                    isCurrent
                      ? 'bg-white border border-gray-200 shadow-sm cursor-pointer'
                      : isDone
                      ? 'hover:bg-white/70 cursor-pointer'
                      : 'cursor-not-allowed opacity-35'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors duration-200 ${
                    isDone ? 'bg-green-100' : isCurrent ? 'bg-indigo-600' : 'bg-gray-100'
                  }`}>
                    {isDone ? (
                      <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className={`text-xs font-bold ${isCurrent ? 'text-white' : 'text-gray-400'}`}>{s.num}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold tracking-tight ${isCurrent ? 'text-gray-900' : isDone ? 'text-gray-500' : 'text-gray-300'}`}>
                      {s.label}
                    </p>
                    {isCurrent && (
                      <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>
                    )}
                  </div>
                  {isCurrent && (
                    <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>

          <button
            onClick={() => navigate(nextPath)}
            className="bg-indigo-600 text-white px-7 py-3 text-sm font-semibold hover:bg-indigo-500 transition-all duration-150 rounded-xl cursor-pointer shadow-sm shadow-indigo-200"
          >
            Continue to {step.label.toLowerCase()}
          </button>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="h-[3px] gradient-brand w-full" />
      <TopBar onLogout={logout} />

      <div className="sticky top-[53px] z-20 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto flex overflow-x-auto px-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-all duration-150 cursor-pointer ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main key={activeTab} className="max-w-7xl mx-auto px-8 py-5 animate-fade-up">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'requirements' && <RequirementsTab />}
        {activeTab === 'calgetc' && <RequirementsTab defaultFilter="__calgetc__" />}
        {activeTab === 'schedules' && <SchedulesTab />}
        {activeTab === 'targets' && <TransferTargetsTab />}
        {activeTab === 'classes' && <ClassesTab />}
      </main>

      <AdvisorChat />
    </div>
  )
}
