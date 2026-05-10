import { useEffect, useState } from 'react'
import { fetchTransactions, formatSGD } from '../lib/sheets'
import type { Transaction } from '../types'

const COLUMNS = [
  { key: 'date',          label: 'Date' },
  { key: 'type',          label: 'Type' },
  { key: 'description',   label: 'Description' },
  { key: 'category',      label: 'Category' },
  { key: 'amount',        label: 'Amount (SGD)' },
  { key: 'paymentMethod', label: 'Payment Method' },
  { key: 'clientName',    label: 'Client Name' },
  { key: 'receiptNo',     label: 'Receipt No.' },
  { key: 'notes',         label: 'Notes' },
]

interface Props {
  mode: 'demo' | 'app'
  accessToken?: string
}

export default function TransactionsView({ mode, accessToken }: Props) {
  const [data, setData]       = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchTransactions(mode, accessToken)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [mode, accessToken]) // re-fetch if auth changes

  return (
    <div className="h-full flex flex-col">

      <div className="px-8 py-6 border-b border-stone-200 bg-white shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-stone-800">Transactions</h2>
          <p className="text-stone-400 text-sm mt-0.5">
            {mode === 'demo' ? 'Sample data — sign in to see your real transactions' : 'Live from Google Sheets'}
          </p>
        </div>
        {!loading && !error && (
          <span className="text-xs bg-stone-100 text-stone-500 px-3 py-1 rounded-full">
            {data.length} rows
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">

            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                {COLUMNS.map(col => (
                  <th key={col.key}
                    className="px-4 py-3 text-left text-xs font-semibold text-stone-500
                               uppercase tracking-wider whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-16 text-center">
                    <div className="flex items-center justify-center gap-2 text-stone-400">
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                      </svg>
                      Loading…
                    </div>
                  </td>
                </tr>
              )}

              {!loading && error && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-12 text-center">
                    <p className="text-red-500 text-sm font-medium">Failed to load</p>
                    <p className="text-stone-400 text-xs mt-1 max-w-sm mx-auto">{error}</p>
                  </td>
                </tr>
              )}

              {!loading && !error && data.map((tx, i) => (
                <tr key={i} className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
                  <td className="px-4 py-3 text-stone-500 whitespace-nowrap">{tx.date}</td>
                  <td className="px-4 py-3">
                    <span className={[
                      'text-xs font-semibold px-2 py-0.5 rounded-full',
                      tx.type === 'Income'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-600',
                    ].join(' ')}>
                      {tx.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-700 max-w-xs truncate">{tx.description}</td>
                  <td className="px-4 py-3 text-stone-500 whitespace-nowrap">{tx.category}</td>
                  <td className={[
                    'px-4 py-3 text-right font-medium whitespace-nowrap',
                    tx.type === 'Income' ? 'text-emerald-700' : 'text-stone-600',
                  ].join(' ')}>
                    {formatSGD(tx.amount)}
                  </td>
                  <td className="px-4 py-3 text-stone-500 whitespace-nowrap">{tx.paymentMethod}</td>
                  <td className="px-4 py-3 text-stone-600 whitespace-nowrap">{tx.clientName}</td>
                  <td className="px-4 py-3 text-stone-400 whitespace-nowrap">{tx.receiptNo}</td>
                  <td className="px-4 py-3 text-stone-400 max-w-xs truncate">{tx.notes}</td>
                </tr>
              ))}

              {!loading && !error && data.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-16 text-center text-stone-400 text-sm">
                    No transactions found
                  </td>
                </tr>
              )}
            </tbody>

          </table>
        </div>
      </div>

    </div>
  )
}
