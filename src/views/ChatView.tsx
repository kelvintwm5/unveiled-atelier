import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { fetchTransactions, fetchMonthlySummary } from '../lib/sheets'
import type { Transaction, MonthlySummary } from '../types'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  mode: 'demo' | 'app'
  accessToken?: string
}

export default function ChatView({ mode, accessToken }: Props) {
  const [messages, setMessages]     = useState<Message[]>([])
  const [input, setInput]           = useState('')
  const [sending, setSending]       = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [transactions, setTransactions]     = useState<Transaction[]>([])
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load financial data once so it can be passed to Claude as context
  useEffect(() => {
    setLoadingData(true)
    Promise.all([
      fetchTransactions(mode, accessToken),
      fetchMonthlySummary(mode, accessToken),
    ]).then(([txs, monthly]) => {
      setTransactions(txs)
      setMonthlySummary(monthly)
    }).finally(() => setLoadingData(false))
  }, [mode, accessToken])

  // Keep the latest message in view
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || sending) return

    const userMsg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setSending(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages,
          transactions,
          monthlySummary,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `⚠️ ${data.error ?? 'Something went wrong. Please try again.'}`,
        }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ Could not reach the server. Check your connection and try again.',
      }])
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="h-full flex flex-col">

      {/* Header */}
      <div className="px-4 py-4 md:px-8 md:py-6 border-b border-stone-200 bg-white shrink-0">
        <h2 className="text-xl font-semibold text-stone-800">Chat</h2>
        <p className="text-stone-400 text-sm mt-0.5">
          {loadingData
            ? 'Loading your financial data…'
            : `Ask questions about your finances — ${mode === 'demo' ? 'demo data loaded' : 'live data loaded'}`}
        </p>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6 space-y-5">

        {/* Welcome */}
        <AssistantBubble>
          Hi! I'm your Unveiled Atelier assistant. Ask me anything about your finances —
          like "What was my best month?" or "Which expense category is highest?" or
          "How much did I earn from gown sales?"
          {mode === 'demo' && (
            <span className="block mt-2 text-stone-400 text-xs">
              You're on demo data. Sign in with Google to ask about your real transactions.
            </span>
          )}
        </AssistantBubble>

        {messages.map((msg, i) =>
          msg.role === 'user' ? (
            <UserBubble key={i}>{msg.content}</UserBubble>
          ) : (
            <AssistantBubble key={i} markdown={msg.content} />
          )
        )}

        {sending && (
          <AssistantBubble>
            <span className="flex items-center gap-2 text-stone-400">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
              Thinking…
            </span>
          </AssistantBubble>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 px-4 py-3 md:px-8 md:py-4 border-t border-stone-200 bg-white">
        <div className="flex gap-3 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask something about your business…"
            rows={1}
            disabled={loadingData || sending}
            className="flex-1 resize-none border border-stone-300 rounded-xl px-4 py-3
                       text-sm focus:outline-none focus:ring-2 focus:ring-rose-300
                       focus:border-transparent placeholder:text-stone-400
                       disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending || loadingData}
            className="px-5 py-3 bg-rose-800 text-white text-sm rounded-xl shrink-0
                       hover:bg-rose-700 transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
        <p className="text-xs text-stone-400 mt-2">Enter to send · Shift+Enter for new line</p>
      </div>

    </div>
  )
}

function AssistantBubble({ children, markdown }: { children?: React.ReactNode; markdown?: string }) {
  return (
    <div className="flex gap-3 max-w-2xl">
      <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center
                      shrink-0 text-rose-700 text-xs font-bold mt-0.5">
        UA
      </div>
      <div className="bg-white border border-stone-200 rounded-2xl rounded-tl-none
                      px-4 py-3 text-sm text-stone-700 leading-relaxed">
        {markdown != null ? (
          <ReactMarkdown
            components={{
              p:      ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold text-stone-800">{children}</strong>,
              ul:     ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
              ol:     ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
              li:     ({ children }) => <li>{children}</li>,
              h3:     ({ children }) => <h3 className="font-semibold text-stone-800 mt-2 mb-1">{children}</h3>,
            }}
          >
            {markdown}
          </ReactMarkdown>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="bg-rose-800 text-white rounded-2xl rounded-tr-none
                      px-4 py-3 text-sm leading-relaxed max-w-xl whitespace-pre-wrap">
        {children}
      </div>
    </div>
  )
}
