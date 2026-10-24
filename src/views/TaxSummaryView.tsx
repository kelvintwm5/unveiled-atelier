import { useEffect, useState } from 'react'
import { defaultYear, getIrasSummary, listTransactionYears } from '../lib/transactions'
import { formatSGD } from '../lib/money'
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
}

export default function TaxSummaryView({ mode }: Props) {
  const [years, setYears]     = useState<number[]>([])
  const [year, setYear]       = useState<number | null>(null)
  const [data, setData]       = useState<IrasSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // Open on the most recent year with data (or this year, before there is any).
  useEffect(() => {
    setLoading(true)
    setError(null)
    listTransactionYears(mode)
      .then(ys => {
        const y = defaultYear(ys)
        setYears(ys.includes(y) ? ys : [y, ...ys])
        setYear(y)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [mode])

  useEffect(() => {
    if (year === null) return
    let current = true
    setLoading(true)
    setError(null)
    setData(null)
    getIrasSummary(mode, year)
      .then(result => { if (current) setData(result) })
      .catch(e => { if (current) setError(e.message) })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [mode, year])

  return (
    <div className="h-full flex flex-col">

      <div className="px-4 py-4 md:px-8 md:py-6 border-b border-stone-200 bg-white shrink-0">
        <h2 className="text-xl font-semibold text-stone-800">Tax Summary</h2>
        <p className="text-stone-400 text-sm mt-0.5">
          {mode === 'demo'
            ? 'Sample data — sign in to see your real figures'
            : 'IRAS Form B/B1 · 4-Line Statement · Sole Proprietor'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">

        {/* Sole proprietors are taxed on the preceding year's income: what was
            earned in 2025 is filed for Year of Assessment 2026. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-6">
          <label htmlFor="tax-year" className="text-sm text-stone-600">Income year</label>
          <select
            id="tax-year"
            value={year ?? ''}
            onChange={e => setYear(Number(e.target.value))}
            disabled={years.length === 0}
            className="text-sm border border-stone-200 rounded-lg px-3 py-1.5 bg-white
                       text-stone-700 focus:outline-none focus:ring-2 focus:ring-rose-300"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {year !== null && (
            <span className="bg-stone-800 text-white text-sm font-semibold px-3 py-1 rounded-full">
              YA {year + 1}
            </span>
          )}
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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                  <div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeClass}`}>
                      Line {line}
                    </span>
                    <h3 className={`font-semibold text-base mt-2 ${labelClass}`}>{label}</h3>
                    <p className="text-xs text-stone-500 mt-0.5">{description}</p>
                  </div>
                  <div className="sm:text-right shrink-0">
                    {loading ? (
                      <div className="h-7 w-28 bg-stone-200 rounded animate-pulse" />
                    ) : amount !== null ? (
                      <p className={`text-2xl font-bold ${labelClass}`}>{formatSGD(amount)}</p>
                    ) : (
                      <p className="text-2xl font-bold text-stone-300">—</p>
                    )}
                    <p className="text-xs text-stone-400 mt-0.5">
                      {loading ? 'Loading…' : mode === 'demo' ? 'Sample data' : `Jan–Dec ${year}`}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-xs text-stone-400 mt-6 max-w-2xl">
          Line 1 counts every income transaction in the year and line 3 every expense; nothing
          is treated as cost of sales or as non-deductible. A reporting aid to prepare your
          Form B/B1, not tax advice.
          {mode === 'demo' && ' These are sample figures. Sign in to see your own.'}
        </p>

      </div>
    </div>
  )
}
