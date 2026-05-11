import { useEffect, useMemo, useState } from 'react'
import type { Transaction, MonthlySummary } from '../types'
import { fetchTransactions, formatSGD } from '../lib/sheets'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function computeMonthly(transactions: Transaction[], year: string): MonthlySummary[] {
  return MONTH_NAMES.map((month, idx) => {
    const monthStr = String(idx + 1).padStart(2, '0')
    const prefix = `${year}-${monthStr}`
    const txs = transactions.filter(tx => tx.date.startsWith(prefix))
    const income   = txs.filter(tx => tx.type === 'Income').reduce((s, tx) => s + tx.amount, 0)
    const expenses = txs.filter(tx => tx.type === 'Expense').reduce((s, tx) => s + tx.amount, 0)
    const netProfit = income - expenses
    return {
      month,
      income,
      expenses,
      netProfit,
      profitMargin: income > 0 ? netProfit / income : 0,
    }
  })
}

interface MonthlySummaryViewProps {
  mode: 'demo' | 'app'
  accessToken?: string
}

export default function MonthlySummaryView({ mode, accessToken }: MonthlySummaryViewProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState<string>('')

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchTransactions(mode, accessToken)
      .then(txs => {
        setTransactions(txs)
        // Default to the most recent year present in the data
        const years = [...new Set(txs.map(tx => tx.date.slice(0, 4)).filter(Boolean))].sort()
        setSelectedYear(years[years.length - 1] ?? String(new Date().getFullYear()))
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [mode, accessToken])

  const years = useMemo(() => {
    return [...new Set(transactions.map(tx => tx.date.slice(0, 4)).filter(Boolean))].sort()
  }, [transactions])

  const rows = useMemo(
    () => selectedYear ? computeMonthly(transactions, selectedYear) : [],
    [transactions, selectedYear]
  )

  const activeRows    = rows.filter(r => r.income > 0 || r.expenses > 0)
  const totalIncome   = rows.reduce((s, r) => s + r.income, 0)
  const totalExpenses = rows.reduce((s, r) => s + r.expenses, 0)
  const totalNet      = totalIncome - totalExpenses
  const maxAbsNet     = Math.max(...activeRows.map(r => Math.abs(r.netProfit)), 1)

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-stone-500">
        Loading monthly summary…
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-red-400 font-medium">Failed to load data</p>
          <p className="text-stone-500 text-sm">{error}</p>
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
            value={selectedYear}
            onChange={e => setSelectedYear(e.target.value)}
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
        <KpiCard label="Total Income" value={formatSGD(totalIncome)} positive />
        <KpiCard label="Total Expenses" value={formatSGD(totalExpenses)} />
        <KpiCard
          label="Net Profit"
          value={formatSGD(totalNet)}
          positive={totalNet >= 0}
          negative={totalNet < 0}
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
              <td className="px-5 py-3 text-right text-stone-700">{formatSGD(totalIncome)}</td>
              <td className="px-5 py-3 text-right text-stone-700">{formatSGD(totalExpenses)}</td>
              <td className={[
                'px-5 py-3 text-right',
                totalNet < 0 ? 'text-red-500' : 'text-emerald-600',
              ].join(' ')}>
                {formatSGD(totalNet)}
              </td>
              <td className="px-5 py-3 text-right text-stone-500">
                {totalIncome > 0
                  ? `${((totalNet / totalIncome) * 100).toFixed(1)}%`
                  : '—'}
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
