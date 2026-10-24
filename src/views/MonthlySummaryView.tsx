import { useEffect, useState } from 'react'
import type { MonthlyPnl } from '../types'
import { defaultYear, getMonthlyPnl, listTransactionYears } from '../lib/transactions'
import { formatSGD } from '../lib/money'

interface MonthlySummaryViewProps {
  mode: 'demo' | 'app'
}

export default function MonthlySummaryView({ mode }: MonthlySummaryViewProps) {
  const [years, setYears]     = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [pnl, setPnl]         = useState<MonthlyPnl | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // Open on the most recent year with data (or this year, before there is any).
  useEffect(() => {
    setLoading(true)
    setError(null)
    listTransactionYears(mode)
      .then(ys => {
        const year = defaultYear(ys)
        setYears(ys.includes(year) ? ys : [year, ...ys])
        setSelectedYear(year)
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [mode])

  // Every figure on this screen, totals included, is summed by the database.
  useEffect(() => {
    if (selectedYear === null) return
    let current = true
    setLoading(true)
    setError(null)
    getMonthlyPnl(mode, selectedYear)
      .then(result => { if (current) setPnl(result) })
      .catch(err => { if (current) setError(err.message) })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [mode, selectedYear])

  const rows       = pnl?.months ?? []
  const total      = pnl?.total
  const activeRows = rows.filter(r => r.income > 0 || r.expenses > 0)
  // Only scales the bar heights; no money is computed here.
  const maxAbsNet  = Math.max(...activeRows.map(r => Math.abs(r.netProfit)), 1)

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-stone-500">
        Loading monthly summary…
      </div>
    )
  }

  if (error || !total) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-red-400 font-medium">Failed to load data</p>
          <p className="text-stone-500 text-sm">{error ?? 'No data'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4 md:px-8 md:py-8">

      {/* Header + year selector */}
      <div className="flex items-start justify-between mb-6 md:mb-8">
        <div>
          <h2 className="text-2xl font-semibold text-stone-800">Monthly Summary</h2>
          <p className="text-stone-500 text-sm mt-1">
            Income, expenses, and net profit by month{selectedYear ? ` — ${selectedYear}` : ''}
          </p>
        </div>
        {years.length > 0 && (
          <select
            value={selectedYear ?? ''}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="text-sm border border-stone-200 rounded-lg px-3 py-1.5 bg-white
                       text-stone-700 focus:outline-none focus:ring-2 focus:ring-rose-300"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6 md:mb-8">
        <KpiCard label="Total Income" value={formatSGD(total.income)} positive />
        <KpiCard label="Total Expenses" value={formatSGD(total.expenses)} />
        <KpiCard
          label="Net Profit"
          value={formatSGD(total.netProfit)}
          positive={total.netProfit >= 0}
          negative={total.netProfit < 0}
        />
      </div>

      {/* Chart */}
      {activeRows.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone-200 p-4 md:p-6 mb-6 md:mb-8">
          <h3 className="text-sm font-medium text-stone-600 mb-5">Net profit by month</h3>
          <div className="flex items-end gap-3 h-40">
            {activeRows.map(row => {
              const barHeight = Math.round((Math.abs(row.netProfit) / maxAbsNet) * 128)
              const isLoss = row.netProfit < 0
              return (
                <div key={row.month} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className={[
                    'text-xs font-medium',
                    isLoss ? 'text-red-500' : 'text-emerald-600',
                  ].join(' ')}>
                    {row.netProfit >= 0 ? '+' : ''}{formatSGD(row.netProfit).replace('S$', '$')}
                  </span>
                  <div className="w-full flex flex-col items-center justify-end" style={{ height: 128 }}>
                    <div
                      className={[
                        'w-full rounded-t-md transition-all',
                        isLoss ? 'bg-red-300' : 'bg-emerald-400',
                      ].join(' ')}
                      style={{ height: barHeight }}
                    />
                  </div>
                  <span className="text-xs text-stone-400">{row.month.slice(0, 3)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-stone-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50">
              <Th>Month</Th>
              <Th right>Income</Th>
              <Th right>Expenses</Th>
              <Th right>Net Profit</Th>
              <Th right>Margin</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-50">
            {rows.map((row, i) => {
              const isEmpty = row.income === 0 && row.expenses === 0
              return (
                <tr
                  key={row.month}
                  className={[
                    'transition-colors',
                    isEmpty ? 'opacity-35' : 'hover:bg-stone-50',
                    i % 2 === 0 ? '' : 'bg-stone-50/40',
                  ].join(' ')}
                >
                  <td className="px-5 py-3 text-stone-700 font-medium">{row.month}</td>
                  <td className="px-5 py-3 text-right text-stone-600">{formatSGD(row.income)}</td>
                  <td className="px-5 py-3 text-right text-stone-600">{formatSGD(row.expenses)}</td>
                  <td className={[
                    'px-5 py-3 text-right font-medium',
                    row.netProfit < 0 ? 'text-red-500' : 'text-emerald-600',
                  ].join(' ')}>
                    {isEmpty ? '—' : formatSGD(row.netProfit)}
                  </td>
                  <td className="px-5 py-3 text-right text-stone-500">
                    {isEmpty ? '—' : `${(row.profitMargin * 100).toFixed(1)}%`}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-stone-200 bg-stone-50 font-semibold">
              <td className="px-5 py-3 text-stone-700">Total</td>
              <td className="px-5 py-3 text-right text-stone-700">{formatSGD(total.income)}</td>
              <td className="px-5 py-3 text-right text-stone-700">{formatSGD(total.expenses)}</td>
              <td className={[
                'px-5 py-3 text-right',
                total.netProfit < 0 ? 'text-red-500' : 'text-emerald-600',
              ].join(' ')}>
                {formatSGD(total.netProfit)}
              </td>
              <td className="px-5 py-3 text-right text-stone-500">
                {total.income > 0 ? `${(total.profitMargin * 100).toFixed(1)}%` : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

    </div>
  )
}

function KpiCard({
  label,
  value,
  positive,
  negative,
}: {
  label: string
  value: string
  positive?: boolean
  negative?: boolean
}) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 px-5 py-4">
      <p className="text-xs text-stone-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={[
        'text-2xl font-semibold',
        negative ? 'text-red-500' : positive ? 'text-emerald-600' : 'text-stone-800',
      ].join(' ')}>
        {value}
      </p>
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={[
      'px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide',
      right ? 'text-right' : 'text-left',
    ].join(' ')}>
      {children}
    </th>
  )
}
