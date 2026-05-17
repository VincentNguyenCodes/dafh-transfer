import { useEffect, useRef, useState } from 'react'
import api from '../api/client'

type Message = { role: 'user' | 'assistant'; content: string }

const WELCOME: Message = {
  role: 'assistant',
  content: "Hi! I'm your transfer advisor. Ask me anything about transferring from De Anza or Foothill — course requirements, GE patterns, ASSIST.org, or anything else.",
}

export default function AdvisorChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 180)
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const userMsg: Message = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)
    try {
      const { data } = await api.post('/chat/', { message: text, history: messages })
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: "Sorry, I'm having trouble right now. Please try again in a moment." }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open transfer advisor"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full gradient-brand shadow-xl shadow-black/20 flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95"
      >
        {open ? (
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>

      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 w-[380px] flex flex-col rounded-3xl overflow-hidden animate-fade-up"
          style={{
            height: 540,
            background: 'rgba(255,255,255,0.78)',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
            border: '1px solid rgba(255,255,255,0.85)',
            boxShadow: '0 32px 64px -12px rgba(0,0,0,0.18), 0 8px 24px -6px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
          }}
        >
          <div
            className="flex items-center gap-3 px-5 py-4 shrink-0"
            style={{ background: 'rgba(255,255,255,0.55)', borderBottom: '1px solid rgba(255,255,255,0.6)' }}
          >
            <div className="w-9 h-9 rounded-xl gradient-brand flex items-center justify-center shrink-0 shadow-sm">
              <svg className="w-[18px] h-[18px] text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 tracking-tight">Transfer Advisor</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <p className="text-[11px] text-gray-400 font-medium">Powered by Claude AI</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/5 transition-all cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
            {messages.map((msg, i) =>
              msg.role === 'assistant' ? (
                <div key={i} className="flex gap-2.5 max-w-[88%] animate-fade-up">
                  <div className="w-6 h-6 rounded-lg gradient-brand shrink-0 mt-0.5" />
                  <div
                    className="rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-gray-800 leading-relaxed shadow-sm"
                    style={{
                      background: 'rgba(255,255,255,0.88)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255,255,255,0.75)',
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-end animate-fade-up">
                  <div className="bg-indigo-500 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm max-w-[88%]">
                    {msg.content}
                  </div>
                </div>
              )
            )}

            {loading && (
              <div className="flex gap-2.5 animate-fade-up">
                <div className="w-6 h-6 rounded-lg gradient-brand shrink-0 mt-0.5" />
                <div
                  className="rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm"
                  style={{ background: 'rgba(255,255,255,0.88)', border: '1px solid rgba(255,255,255,0.75)' }}
                >
                  <div className="flex gap-1 items-center h-4">
                    {[0, 1, 2].map((j) => (
                      <span
                        key={j}
                        className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block"
                        style={{ animation: `advisorBounce 1.2s ease-in-out ${j * 0.18}s infinite` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div
            className="px-4 py-3.5 shrink-0"
            style={{ background: 'rgba(255,255,255,0.45)', borderTop: '1px solid rgba(255,255,255,0.55)' }}
          >
            <div className="flex gap-2 items-center">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Ask about transfer requirements..."
                disabled={loading}
                className="flex-1 text-sm text-gray-800 placeholder-gray-400 focus:outline-none disabled:opacity-50 transition-all duration-150"
                style={{
                  background: 'rgba(255,255,255,0.7)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: '14px',
                  padding: '10px 14px',
                }}
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className="w-10 h-10 rounded-xl gradient-brand flex items-center justify-center cursor-pointer disabled:opacity-35 hover:opacity-90 active:scale-95 transition-all duration-150 shrink-0 shadow-sm"
              >
                <svg className="w-[17px] h-[17px] text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes advisorBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </>
  )
}
