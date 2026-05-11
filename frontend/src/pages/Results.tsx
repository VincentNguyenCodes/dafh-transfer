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
    <div className="flex items-start gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-semibold text-sm text-indigo-700">{course.course_code}</span>
          {course.in_progress && (
            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">In Progress</span>
          )}
        </div>
        <p className="text-sm text-gray-700 mt-0.5">{course.course_name}</p>
        <p className="text-xs text-gray-400 mt-1">
          Satisfies: {course.satisfies.join(', ')}
        </p>
      </div>
      {course.units && (
        <span className="text-xs text-gray-400 whitespace-nowrap">{course.units} units</span>
      )}
    </div>
  )
}

function SchoolSection({ title, courses }: { title: string; courses: Course[] }) {
  if (courses.length === 0) return null
  return (
    <div className="mb-8">
      <h2 className="text-base font-semibold text-gray-700 mb-3 uppercase tracking-wide">{title}</h2>
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
      .catch(() => setError('Failed to load results. Make sure you have added schools and a transcript.'))
      .finally(() => setLoading(false))
  }, [])

  const total = (results?.deanza.length ?? 0) + (results?.foothill.length ?? 0)
  const inProgress = [...(results?.deanza ?? []), ...(results?.foothill ?? [])].filter((c) => c.in_progress).length

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-400 hover:text-gray-600 mb-4">
          Back to dashboard
        </button>
        <h1 className="text-2xl font-bold mb-1">Classes You Still Need</h1>
        <p className="text-sm text-gray-500 mb-6">
          Based on your transcript and transfer targets
        </p>

        {loading && <p className="text-gray-500">Fetching your requirements from ASSIST.org...</p>}
        {error && <p className="text-red-500 text-sm">{error}</p>}

        {results && !loading && (
          <>
            {total === 0 ? (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
                <p className="text-green-700 font-semibold text-lg">You're all set!</p>
                <p className="text-green-600 text-sm mt-1">No remaining classes found for your selected schools and majors.</p>
              </div>
            ) : (
              <>
                <div className="flex gap-4 mb-6">
                  <div className="bg-white rounded-xl shadow-sm px-5 py-3 border border-gray-100">
                    <p className="text-2xl font-bold text-indigo-600">{total}</p>
                    <p className="text-xs text-gray-500">courses remaining</p>
                  </div>
                  {inProgress > 0 && (
                    <div className="bg-white rounded-xl shadow-sm px-5 py-3 border border-gray-100">
                      <p className="text-2xl font-bold text-yellow-500">{inProgress}</p>
                      <p className="text-xs text-gray-500">in progress</p>
                    </div>
                  )}
                </div>

                <SchoolSection title="De Anza College" courses={results.deanza} />
                <SchoolSection title="Foothill College" courses={results.foothill} />
              </>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => navigate('/transcript')}
                className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm hover:bg-gray-50 transition-colors"
              >
                Edit Transcript
              </button>
              <button
                onClick={() => navigate('/schools')}
                className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm hover:bg-gray-50 transition-colors"
              >
                Edit Schools
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
