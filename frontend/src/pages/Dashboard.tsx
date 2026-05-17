import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import ClassesTab from './ClassesTab'
import RequirementsTab from './RequirementsTab'
import SchedulesTab from './SchedulesTab'
import TransferTargetsTab from './TransferTargetsTab'

const STEPS = [
  { num: 1, label: 'Add your classes', desc: 'Paste your De Anza and Foothill transcripts', path: '/transcript' },
  { num: 2, label: 'Choose schools and majors', desc: 'Select which schools and majors you are applying to', path: '/schools' },
  { num: 3, label: 'View your results', desc: 'See which classes you still need to take', path: '/dashboard' },
]

type Tab = 'requirements' | 'schedules' | 'targets' | 'classes'

const TABS: { id: Tab; label: string }[] = [
  { id: 'requirements', label: 'Requirements' },
  { id: 'schedules', label: 'Schedules' },
  { id: 'targets', label: 'Transfer Targets' },
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
      <>
        <LoadingBar />
        <div className="min-h-screen bg-white flex items-center justify-center">
          <p className="text-sm text-gray-300 font-mono tracking-widest">loading</p>
        </div>
      </>
    )
  }

  if (currentStep < 3) {
    const step = STEPS.find((s) => s.num === currentStep)!
    const nextPath = step?.path ?? '/transcript'

    return (
      <div className="min-h-screen bg-white">
        <TopBar onLogout={logout} />

        <main className="max-w-lg mx-auto px-6 py-16 animate-fade-up">
          <p className="text-[11px] font-mono text-gray-400 uppercase tracking-[0.15em] mb-10">
            Step {currentStep} of 3
          </p>

          <div className="mb-14">
            {STEPS.map((s) => {
              const isDone = s.num < currentStep
              const isCurrent = s.num === currentStep
              const isLocked = s.num > currentStep

              return (
                <button
                  key={s.num}
                  onClick={() => !isLocked && navigate(s.path)}
                  disabled={isLocked}
                  className={`w-full flex items-start gap-5 py-4 text-left border-l-2 pl-5 mb-1 transition-all duration-150 animate-fade-up stagger-${s.num} ${
                    isCurrent
                      ? 'border-indigo-500'
                      : isDone
                      ? 'border-gray-200 hover:border-gray-400'
                      : 'border-gray-100 cursor-not-allowed'
                  }`}
                >
                  <span className={`font-mono text-xs mt-0.5 w-5 shrink-0 ${isCurrent ? 'text-indigo-500' : isDone ? 'text-gray-300' : 'text-gray-200'}`}>
                    {isDone ? '✓' : `0${s.num}`}
                  </span>
                  <div>
                    <p className={`text-sm font-semibold tracking-tight ${isCurrent ? 'text-gray-900' : isDone ? 'text-gray-400' : 'text-gray-200'}`}>
                      {s.label}
                    </p>
                    {isCurrent && (
                      <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          <button
            onClick={() => navigate(nextPath)}
            className="bg-indigo-600 text-white px-6 py-2.5 text-sm font-semibold hover:bg-indigo-500 transition-colors duration-150 rounded-lg"
          >
            Continue to {step.label.toLowerCase()}
          </button>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <TopBar onLogout={logout} />

      <div className="sticky top-[53px] z-20 bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto flex overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-all duration-150 ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main key={activeTab} className="max-w-5xl mx-auto px-8 py-8 animate-fade-up">
        {activeTab === 'requirements' && <RequirementsTab />}
        {activeTab === 'schedules' && <SchedulesTab />}
        {activeTab === 'targets' && <TransferTargetsTab />}
        {activeTab === 'classes' && <ClassesTab />}
      </main>
    </div>
  )
}
