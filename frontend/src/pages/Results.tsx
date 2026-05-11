import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

type Course = {
  course_code: string
  course_name: string
  units: number | null
  school: 'deanza' | 'foothill'
  satisfies: string[]
  in_progress: boolean
}

type Results = {
  deanza: Course[]
  foothill: Course[]
}

function CourseCard({ course }: { course: Course }) {
  return (
    <div className="flex items-start gap-4 bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="font-mono font-bold text-sm text-indigo-700">{course.course_code}</span>
          {course.in_progress && (
            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
              In Progress
            </span>
          )}
        </div>
        <p className="text-sm text-gray-800 font-medium">{course.course_name}</p>
        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
          Satisfies: {course.satisfies.join(' · ')}
        </p>
      </div>
      {course.units != null && (
        <div className="shrink-0 text-right">
          <span className="text-xs font-semibold text-gray-400">{course.units}</span>
          <p className="text-xs text-gray-300">units</p>
        </div>
      )}
    </div>
  )
}

function SchoolSection({ title, color, courses }: { title: string; color: string; courses: Course[] }) {
  if (courses.length === 0) return null
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-2 h-6 rounded-full ${color}`}></div>
        <h2 className="text-base font-bold text-gray-800">{title}</h2>
        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-medium">
          {courses.length} courses
        </span>
      </div>
      <div className="space-y-2">
        {courses.map((c) => (
          <CourseCard key={`${c.school}-${c.course_code}`} course={c} />
        ))}
      </div>
    </div>
  )
}

export default function Results() {
  const navigate = useNavigate()
  const [results, setResults] = useState<Results | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/results/')
      .then(({ data }) => setResults(data))
      .catch(() => setError('Failed to load results. Make sure you have saved schools and a transcript.'))
      .finally(() => setLoading(false))
  }, [])

  const total = (results?.deanza.length ?? 0) + (results?.foothill.length ?? 0)
  const inProgress = [...(results?.deanza ?? []), ...(results?.foothill ?? [])].filter((c) => c.in_progress).length

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-gray-600 transition-colors">
              ←
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xs">D</span>
              </div>
              <span className="font-semibold text-gray-900">DAFH Transfer</span>
            </div>
          </div>
          <span className="text-sm text-gray-400">Results</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Classes You Still Need</h1>
          <p className="text-gray-500 text-sm">Based on your transcript and transfer targets.</p>
        </div>

        {loading && (
          <div className="text-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-500 text-sm">Fetching your requirements from ASSIST.org...</p>
            <p className="text-gray-400 text-xs mt-1">This may take a few seconds.</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 mb-6">
            <p className="text-red-700 font-medium text-sm mb-1">Could not load results</p>
            <p className="text-red-500 text-xs">{error}</p>
          </div>
        )}

        {results && !loading && (
          <>
            {total === 0 ? (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
                <div className="text-4xl mb-3">🎉</div>
                <p className="text-green-700 font-bold text-lg">You're all set!</p>
                <p className="text-green-600 text-sm mt-1">No remaining classes found for your selected schools and majors.</p>
              </div>
            ) : (
              <>
                <div className="flex gap-3 mb-8 flex-wrap">
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4">
                    <p className="text-3xl font-bold text-indigo-600">{total}</p>
                    <p className="text-xs text-gray-500 mt-0.5">courses remaining</p>
                  </div>
                  {inProgress > 0 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4">
                      <p className="text-3xl font-bold text-yellow-500">{inProgress}</p>
                      <p className="text-xs text-gray-500 mt-0.5">in progress</p>
                    </div>
                  )}
                  {total - inProgress > 0 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4">
                      <p className="text-3xl font-bold text-red-400">{total - inProgress}</p>
                      <p className="text-xs text-gray-500 mt-0.5">still needed</p>
                    </div>
                  )}
                </div>

                <SchoolSection title="De Anza College" color="bg-green-400" courses={results.deanza} />
                <SchoolSection title="Foothill College" color="bg-blue-400" courses={results.foothill} />
              </>
            )}

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => navigate('/transcript')}
                className="flex-1 border border-gray-200 text-gray-600 rounded-2xl py-3 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Edit Transcript
              </button>
              <button
                onClick={() => navigate('/schools')}
                className="flex-1 border border-gray-200 text-gray-600 rounded-2xl py-3 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Edit Schools
              </button>
              <button
                onClick={() => { setLoading(true); setResults(null); api.get('/results/').then(({ data }) => setResults(data)).finally(() => setLoading(false)) }}
                className="flex-1 bg-indigo-600 text-white rounded-2xl py-3 text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Refresh
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
