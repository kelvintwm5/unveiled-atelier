import { useEffect, useState } from 'react'
import { fetchIrasSummary, formatSGD } from '../lib/sheets'
import type { IrasSummary } from '../types'

const IRAS_LINES = [
  {
    line: 1, key: 'revenue' as keyof IrasSummary,
    label: 'Revenue',
    description: 'Total receipts from the business for the year',
    cardClass: 'bg-blue-50 border-blue-200', labelClass: 'text-blue-800',
    badgeClass: 'bg-blue-100 text-blue-600',
  },
  {
    line: 2, key: 'grossProfit' as keyof IrasSummary,
    label: 'Gross Profit / Loss',
    description: 'Same as Revenue for a service business — no cost of goods to deduct',
    cardClass: 'bg-emerald-50 border-emerald-200', labelClass: 'text-emerald-800',
    badgeClass: 'bg-emerald-100 text-emerald-600',
  },
  {
    line: 3, key: 'expenses' as keyof IrasSummary,
    label: 'Allowable Business Expenses',
    description: 'Total deductible expenses for the year',
    cardClass: 'bg-amber-50 border-amber-200', labelClass: 'text-amber-800',
    badgeClass: 'bg-amber-100 text-amber-600',
  },
  {
    line: 4, key: 'adjustedProfit' as keyof IrasSummary,
    label: 'Adjusted Profit / Loss',
    description: 'Revenue minus allowable expenses — your taxable income',
    cardClass: 'bg-rose-50 border-rose-200', labelClass: 'text-rose-800',
    badgeClass: 'bg-rose-100 text-rose-600',
  },
]

interface Props {
  mode: 'demo' | 'app'
  accessToken?: string
}

export default function TaxSummaryView({ mode, accessToken }: Props) {
  const [data, setData]       = useState<IrasSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchIrasSummary(mode, accessToken)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [mode, accessToken])

  return (
    <div className="h-full flex flex-col">

      <div className="px-8 py-6 border-b border-stone-200 bg-white shrink-0">
        <h2 className="text-xl font-semibold text-stone-800">Tax Summary</h2>
        <p className="text-stone-400 text-sm mt-0.5">
          {mode === 'demo'
            ? 'Sample data — sign in to see your real figures'
            : 'IRAS Form B/B1 · 4-Line Statement · Sole Proprietor'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">

        <div className="flex items-center gap-3 mb-6">
          <span className="text-sm text-stone-600">Year of Assessment</span>
          <span className="bg-stone-800 text-white text-sm font-semibold px-3 py-1 rounded-full">2025</span>
        </div>

        {!loading && error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-5 py-4 max-w-2xl">
            <p className="text-red-600 text-sm font-medium">Failed to load</p>
            <p className="text-red-400 text-xs mt-0.5">{error}</p>
          </div>
        )}

        <div className="flex flex-col gap-4 max-w-2xl">
          {IRAS_LINES.map(({ line, key, label, description, cardClass, labelClass, badgeClass }) => {
            const amount = data?.[key] ?? null
            return (
              <div key={line} className={`border rounded-xl px-6 py-5 ${cardClass}`}>
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeClass}`}>
                      Line {line}
                    </span>
                    <h3 className={`font-semibold text-base mt-2 ${labelClass}`}>{label}</h3>
                    <p className="text-xs text-stone-500 mt-0.5">{description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {loading ? (
                      <div className="h-7 w-28 bg-stone-200 rounded animate-pulse" />
                    ) : amount !== null ? (
                      <p className={`text-2xl font-bold ${labelClass}`}>{formatSGD(amount)}</p>
                    ) : (
                      <p className="text-2xl font-bold text-stone-300">—</p>
                    )}
                    <p className="text-xs text-stone-400 mt-0.5">
                      {loading ? 'Loading…' : mode === 'demo' ? 'Sample data' : 'From Google Sheets'}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-xs text-stone-400 mt-6 max-w-2xl">
          {mode === 'demo'
            ? 'These figures are pre-computed sample data. Connect your Google Sheet to see real numbers.'
            : 'Figures are computed by your Google Sheet and refreshed each session.'}
        </p>

      </div>
    </div>
  )
}
