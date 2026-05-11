import { useEffect, useMemo, useState } from 'react'
import { fetchTransactions, appendTransaction, formatSGD } from '../lib/sheets'
import type { Transaction } from '../types'

const COLUMNS = [
  { key: 'date',          label: 'Date' },
  { key: 'type',          label: 'Type' },
  { key: 'description',   label: 'Description' },
  { key: 'category',      label: 'Category' },
  { key: 'amount',        label: 'Amount (SGD)' },
  { key: 'paymentMethod', label: 'Payment Method' },
  { key: 'clientName',    label: 'Client Name' },
  { key: 'receiptNo',     label: 'Invoice No.' },
  { key: 'notes',         label: 'Notes' },
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface Props {
  mode: 'demo' | 'app'
  accessToken?: string
}

export default function TransactionsView({ mode, accessToken }: Props) {
  const [data, setData]       = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [filterYear, setFilterYear]   = useState<string>('all')
  const [filterMonth, setFilterMonth] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(false)

  function reload() {
    setLoading(true)
    setError(null)
    fetchTransactions(mode, accessToken)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [mode, accessToken])

  // Derive available years from the data
  const years = useMemo(() => {
    const set = new Set(data.map(tx => tx.date.slice(0, 4)).filter(Boolean))
    return Array.from(set).sort()
  }, [data])

  const filtered = useMemo(() => {
    return data.filter(tx => {
      const [year, month] = tx.date.split('-')
      if (filterYear !== 'all' && year !== filterYear) return false
      if (filterMonth !== 'all' && parseInt(month) !== parseInt(filterMonth)) return false
      return true
    })
  }, [data, filterYear, filterMonth])

  return (
    <div className="h-full flex flex-col">

      {showAdd && (
        <AddTransactionModal
          accessToken={accessToken!}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); reload() }}
        />
      )}

      <div className="px-4 py-4 md:px-8 md:py-6 border-b border-stone-200 bg-white shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-stone-800">Transactions</h2>
            <p className="text-stone-400 text-sm mt-0.5">
              {mode === 'demo' ? 'Sample data — sign in to see your real transactions' : 'Live from Google Sheets'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!loading && !error && (
              <span className="text-xs bg-stone-100 text-stone-500 px-3 py-1 rounded-full">
                {filtered.length}{filtered.length !== data.length ? ` of ${data.length}` : ''} rows
              </span>
            )}
            <button
              onClick={() => mode === 'app' && setShowAdd(true)}
              disabled={mode === 'demo'}
              title={mode === 'demo' ? 'Sign in as Owner to add transactions' : undefined}
              className="flex items-center gap-1.5 bg-rose-800 text-white text-sm font-medium
                         px-3 py-1.5 rounded-lg transition-colors
                         hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add
            </button>
          </div>
        </div>

        {/* Filters */}
        {!loading && !error && data.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-3 md:mt-4">
            <select
              value={filterYear}
              onChange={e => { setFilterYear(e.target.value); setFilterMonth('all') }}
              className="text-sm border border-stone-200 rounded-lg px-3 py-1.5 bg-white
                         text-stone-700 focus:outline-none focus:ring-2 focus:ring-rose-300"
            >
              <option value="all">All years</option>
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <select
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              disabled={filterYear === 'all'}
              className="text-sm border border-stone-200 rounded-lg px-3 py-1.5 bg-white
                         text-stone-700 focus:outline-none focus:ring-2 focus:ring-rose-300
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <option value="all">All months</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={String(i + 1)}>{m}</option>
              ))}
            </select>

            {(filterYear !== 'all' || filterMonth !== 'all') && (
              <button
                onClick={() => { setFilterYear('all'); setFilterMonth('all') }}
                className="text-xs text-stone-400 hover:text-stone-600 transition-colors underline"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto px-4 py-4 md:px-8 md:py-6">
        <div className="bg-white rounded-xl border border-stone-200 overflow-x-auto">
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

              {!loading && !error && filtered.map((tx, i) => (
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

              {!loading && !error && filtered.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-16 text-center text-stone-400 text-sm">
                    {data.length > 0 ? 'No transactions match the selected filters' : 'No transactions found'}
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

// ---------------------------------------------------------------------------
// Add Transaction Modal
// ---------------------------------------------------------------------------

const today = () => new Date().toISOString().slice(0, 10)

const EMPTY_FORM = {
  date: today(),
  type: 'Income' as 'Income' | 'Expense',
  description: '',
  category: '',
  amount: '',
  paymentMethod: '',
  clientName: '',
  receiptNo: '',
  notes: '',
}

function AddTransactionModal({
  accessToken,
  onClose,
  onSaved,
}: {
  accessToken: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM, date: today() })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  function set(field: keyof typeof EMPTY_FORM, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(form.amount)
    if (!form.date || !form.description || isNaN(amount) || amount <= 0) {
      setError('Date, description, and a positive amount are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await appendTransaction(accessToken, {
        date:          form.date,
        type:          form.type,
        description:   form.description,
        category:      form.category,
        amount,
        paymentMethod: form.paymentMethod,
        clientName:    form.clientName,
        receiptNo:     form.receiptNo,
        notes:         form.notes,
      })
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Card */}
      <div className="relative w-full sm:max-w-lg bg-white sm:rounded-2xl rounded-t-2xl
                      shadow-xl max-h-[90dvh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 shrink-0">
          <h3 className="text-base font-semibold text-stone-800">Add Transaction</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="px-6 py-5 grid grid-cols-2 gap-4">

            <Field label="Date *" className="col-span-1">
              <input
                type="date"
                value={form.date}
                onChange={e => set('date', e.target.value)}
                required
                className={inputCls}
              />
            </Field>

            <Field label="Type *" className="col-span-1">
              <select value={form.type} onChange={e => set('type', e.target.value as 'Income' | 'Expense')} className={inputCls}>
                <option value="Income">Income</option>
                <option value="Expense">Expense</option>
              </select>
            </Field>

            <Field label="Description *" className="col-span-2">
              <input
                type="text"
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="e.g. Gown rental — Sarah Lim"
                required
                className={inputCls}
              />
            </Field>

            <Field label="Amount (SGD) *" className="col-span-1">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                placeholder="0.00"
                required
                className={inputCls}
              />
            </Field>

            <Field label="Category" className="col-span-1">
              <input
                type="text"
                value={form.category}
                onChange={e => set('category', e.target.value)}
                placeholder="e.g. Gown Rental"
                className={inputCls}
              />
            </Field>

            <Field label="Payment Method" className="col-span-1">
              <input
                type="text"
                value={form.paymentMethod}
                onChange={e => set('paymentMethod', e.target.value)}
                placeholder="e.g. PayNow"
                className={inputCls}
              />
            </Field>

            <Field label="Client Name" className="col-span-1">
              <input
                type="text"
                value={form.clientName}
                onChange={e => set('clientName', e.target.value)}
                placeholder="e.g. Sarah Lim"
                className={inputCls}
              />
            </Field>

            <Field label="Invoice No." className="col-span-1">
              <input
                type="text"
                value={form.receiptNo}
                onChange={e => set('receiptNo', e.target.value)}
                placeholder="e.g. RCP-001"
                className={inputCls}
              />
            </Field>

            <Field label="Notes" className="col-span-2">
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Optional notes…"
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </Field>

          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-stone-200 shrink-0 space-y-3">
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 text-sm
                           text-stone-600 hover:bg-stone-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-rose-800 hover:bg-rose-700 text-white
                           text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Transaction'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputCls = `w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800
  focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent
  placeholder:text-stone-300 bg-white`

function Field({
  label,
  children,
  className = '',
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-stone-500 mb-1.5">{label}</label>
      {children}
    </div>
  )
}
