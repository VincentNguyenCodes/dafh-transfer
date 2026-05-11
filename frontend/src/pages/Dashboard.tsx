import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

const STEPS = [
  { num: 1, label: 'Add Your Transcripts', path: '/transcript' },
  { num: 2, label: 'Choose Schools and Majors', path: '/schools' },
  { num: 3, label: 'View Your Results', path: '/results' },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(1)

  useEffect(() => {
    api.get('/progress/').then(({ data }) => setCurrentStep(data.current_step))
  }, [])

  const logout = () => {
    localStorage.removeItem('access')
    localStorage.removeItem('refresh')
    navigate('/')
  }

  const nextPath = STEPS.find((s) => s.num === currentStep)?.path ?? '/transcript'

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">DAFH Transfer</h1>
          <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700">
            Log out
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Your Transfer Plan</h2>
          <div className="space-y-3">
            {STEPS.map((step) => (
              <div
                key={step.num}
                className={`flex items-center gap-4 p-3 rounded-lg ${step.num < currentStep ? 'bg-green-50' : step.num === currentStep ? 'bg-indigo-50 border border-indigo-200' : 'bg-gray-50 opacity-50'}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step.num < currentStep ? 'bg-green-500 text-white' : step.num === currentStep ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'}`}
                >
                  {step.num < currentStep ? '✓' : step.num}
                </div>
                <span className="text-sm font-medium">{step.label}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => navigate(nextPath)}
          className="w-full bg-indigo-600 text-white rounded-xl py-3 font-medium hover:bg-indigo-700 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
