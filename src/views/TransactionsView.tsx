import { useEffect, useMemo, useState } from 'react'
import {
  listTransactions, createTransaction, updateTransaction, deleteTransaction,
  getAttachmentUrl, validateAttachment, type AttachmentChange,
} from '../lib/transactions'
import { openPdf } from '../lib/invoicePdf'
import { listClients, clientLabels } from '../lib/clientData'
import { formatSGD } from '../lib/money'
import { todaySgt } from '../lib/dates'
import type { Client, Transaction } from '../types'

const COLUMNS = [
  { key: 'date',          label: 'Date' },
  { key: 'type',          label: 'Type' },
  { key: 'description',   label: 'Description' },
  { key: 'category',      label: 'Category' },
  { key: 'amount',        label: 'Amount (SGD)' },
  { key: 'paymentMethod', label: 'Payment Method' },
  { key: 'clientName',    label: 'Client Name' },
  { key: 'referenceNo',   label: 'Invoice No.' },
  { key: 'notes',         label: 'Notes' },
]

// The expense categories from the Google Sheet's IRAS tab. Suggestions only: any
// text is accepted, and categories already used in the ledger are offered too.
const EXPENSE_CATEGORIES = [
  'Cost of Goods', 'Alterations & Tailoring', 'Rental & Utilities',
  'Marketing & Advertising', 'Professional Services', 'Transport',
  'Packaging & Supplies', 'Equipment & Tools', 'Training & Development',
  'Bank & Payment Fees', 'Miscellaneous',
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface Props {
  mode: 'demo' | 'app'
}

export default function TransactionsView({ mode }: Props) {
  const [data, setData]       = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [filterYear, setFilterYear]   = useState<string>('all')
  const [filterMonth, setFilterMonth] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [deletingId, setDeletingId]   = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [blockedFile, setBlockedFile] = useState<{ url: string; name: string } | null>(null)

  // Demo mode is read-only, so there is nothing to edit or delete there.
  const canEdit = mode === 'app'
  const colCount = COLUMNS.length + (canEdit ? 1 : 0)

  function reload() {
    setLoading(true)
    setError(null)
    listTransactions(mode)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [mode])

  const categories = useMemo(() => {
    const used = data.map(tx => tx.category).filter(Boolean)
    return Array.from(new Set([...EXPENSE_CATEGORIES, ...used])).sort()
  }, [data])

  async function handleDelete(tx: Transaction) {
    const ok = window.confirm(
      `Delete "${tx.description}" (${formatSGD(tx.amount)} on ${tx.date})? This can't be undone.`
    )
    if (!ok) return
    setDeletingId(tx.id)
    setActionError(null)
    try {
      await deleteTransaction(mode, tx.id)
      reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeletingId(null)
    }
  }

  async function handleOpenAttachment(attachment: NonNullable<Transaction['attachment']>) {
    setActionError(null)
    setBlockedFile(null)
    try {
      // openPdf is about tabs, not PDFs: it opens one inside the tap so phones
      // don't block it, and hands back the link if the browser blocks it anyway.
      const url = await openPdf(() => getAttachmentUrl(mode, attachment))
      if (url) setBlockedFile({ url, name: attachment.name })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

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

      {(showAdd || editing) && (
        <TransactionModal
          mode={mode}
          transaction={editing ?? undefined}
          categories={categories}
          onClose={() => { setShowAdd(false); setEditing(null) }}
          onSaved={() => { setShowAdd(false); setEditing(null); reload() }}
        />
      )}

      <div className="px-4 py-4 md:px-8 md:py-6 border-b border-stone-200 bg-white shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-stone-800">Transactions</h2>
            <p className="text-stone-400 text-sm mt-0.5">
              {mode === 'demo' ? 'Sample data — sign in to see your real transactions' : 'Newest first'}
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
        {actionError && (
          <p className="mb-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-red-600 text-sm">
            {actionError}
          </p>
        )}
        {blockedFile && (
          <p className="mb-3 bg-stone-100 border border-stone-200 rounded-lg px-4 py-2.5 text-stone-600 text-sm">
            Your browser blocked the new tab.{' '}
            <a href={blockedFile.url} target="_blank" rel="noreferrer" className="text-rose-800 underline">
              Open {blockedFile.name}
            </a>
          </p>
        )}
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
                {canEdit && (
                  <th className="px-2 py-3 sticky right-0 bg-stone-50 border-l border-stone-200">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan={colCount} className="px-4 py-16 text-center">
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
                  <td colSpan={colCount} className="px-4 py-12 text-center">
                    <p className="text-red-500 text-sm font-medium">Failed to load</p>
                    <p className="text-stone-400 text-xs mt-1 max-w-sm mx-auto">{error}</p>
                  </td>
                </tr>
              )}

              {!loading && !error && filtered.map(tx => (
                <tr key={tx.id} className="group border-b border-stone-100 hover:bg-stone-50 transition-colors">
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
                  <td className="px-4 py-3 text-stone-400 whitespace-nowrap">{tx.referenceNo}</td>
                  <td className="px-4 py-3 text-stone-400 max-w-xs truncate">{tx.notes}</td>
                  {canEdit && (
                    // Sticky because this column sits past nine others: on a phone
                    // it would otherwise take a long sideways scroll to reach.
                    <td className="px-2 py-3 sticky right-0 bg-white group-hover:bg-stone-50
                                   transition-colors border-l border-stone-100">
                      <div className="flex items-center justify-end gap-0.5">
                        {tx.attachment && (
                          <button
                            onClick={() => handleOpenAttachment(tx.attachment!)}
                            aria-label={`Open ${tx.attachment.name}`}
                            title={tx.attachment.name}
                            className="p-1.5 rounded-md text-rose-800 hover:bg-rose-50 transition-colors"
                          >
                            <PaperclipIcon />
                          </button>
                        )}
                        <button
                          onClick={() => setEditing(tx)}
                          disabled={deletingId !== null}
                          aria-label={`Edit ${tx.description}`}
                          title="Edit"
                          className="p-1.5 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100
                                     transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                          </svg>
                        </button>
                        {!tx.fromInvoice && (
                          <button
                            onClick={() => handleDelete(tx)}
                            disabled={deletingId !== null}
                            aria-label={`Delete ${tx.description}`}
                            title="Delete"
                            className="p-1.5 rounded-md text-stone-300 hover:text-red-600 hover:bg-red-50
                                       transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}

              {!loading && !error && filtered.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-4 py-16 text-center text-stone-400 text-sm">
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
// Add / Edit Transaction Modal
// ---------------------------------------------------------------------------

const EMPTY_FORM = {
  date: '',
  type: 'Income' as 'Income' | 'Expense',
  description: '',
  category: '',
  amount: '',
  paymentMethod: '',
  clientName: '',
  clientId: '',
  referenceNo: '',
  notes: '',
}

function formFromTransaction(tx: Transaction): typeof EMPTY_FORM {
  return {
    date:          tx.date,
    type:          tx.type,
    description:   tx.description,
    category:      tx.category,
    amount:        tx.amount.toFixed(2),
    paymentMethod: tx.paymentMethod,
    clientName:    tx.clientName,
    clientId:      tx.clientId,
    referenceNo:   tx.referenceNo,
    notes:         tx.notes,
  }
}

function TransactionModal({
  mode,
  transaction,
  categories,
  onClose,
  onSaved,
}: {
  mode: 'demo' | 'app'
  transaction?: Transaction     // present when editing, absent when adding
  categories: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const locked = transaction?.fromInvoice === true
  // Today in Singapore: the UTC date is still yesterday before 08:00 SGT.
  const [form, setForm] = useState(
    () => transaction ? formFromTransaction(transaction) : { ...EMPTY_FORM, date: todaySgt() },
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [clientsError, setClientsError] = useState<string | null>(null)
  // Nothing happens to files until Save, so Cancel always leaves things as they were.
  const [newFile, setNewFile] = useState<File | null>(null)
  const [removeExisting, setRemoveExisting] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  const existingFile = transaction?.attachment
  // A client deleted since this row was saved isn't in the list, but the row is
  // still linked to them. Without its own option the dropdown would show "Not in
  // client list" and saving would quietly drop the link.
  const linkedClientMissing = Boolean(
    transaction?.clientId && !clients.some(c => c.id === transaction.clientId),
  )

  // An upload can take a while on a phone, and closing the form wouldn't stop it.
  function close() {
    if (!saving) onClose()
  }

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Cleared so that choosing the same file again still fires this handler.
    e.target.value = ''
    if (!file) return
    const problem = validateAttachment(file)
    setFileError(problem)
    if (!problem) setNewFile(file)
  }

  // Linking to a tracked client is optional, so if the list can't load the form
  // still works with a typed name.
  useEffect(() => {
    listClients(mode)
      .then(setClients)
      .catch(err => setClientsError(err instanceof Error ? err.message : String(err)))
  }, [mode])

  const labels = useMemo(() => clientLabels(clients), [clients])
  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => (labels.get(a.id) ?? '').localeCompare(labels.get(b.id) ?? '')),
    [clients, labels],
  )

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
    // A linked client's name is saved as it is today, so the ledger still reads
    // correctly if the client record is renamed later. An edit that leaves the
    // client alone keeps the name from the day, and doesn't need the client list,
    // which may have failed to load or no longer include them.
    const keptLink = transaction && form.clientId !== '' && form.clientId === transaction.clientId
    const linked = clients.find(c => c.id === form.clientId)
    const input = {
      date:          form.date,
      type:          form.type,
      description:   form.description,
      category:      form.category,
      amount,
      paymentMethod: form.paymentMethod,
      clientName:    keptLink ? transaction.clientName : linked ? linked.name : form.clientName,
      clientId:      keptLink ? transaction.clientId : linked ? linked.id : '',
      referenceNo:   form.referenceNo,
      notes:         form.notes,
    }
    const change: AttachmentChange = newFile
      ? { kind: 'replace', file: newFile }
      : removeExisting ? { kind: 'remove' } : { kind: 'keep' }
    try {
      if (transaction) {
        await updateTransaction(mode, transaction, input, change)
      } else {
        await createTransaction(mode, input, newFile ?? undefined)
      }
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={close} />

      {/* Card */}
      <div className="relative w-full sm:max-w-lg bg-white sm:rounded-2xl rounded-t-2xl
                      shadow-xl max-h-[90dvh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 shrink-0">
          <h3 className="text-base font-semibold text-stone-800">
            {transaction ? 'Edit Transaction' : 'Add Transaction'}
          </h3>
          <button onClick={close} aria-label="Close" className="text-stone-400 hover:text-stone-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="px-6 py-5 grid grid-cols-2 gap-4">

            {locked && (
              <p className="col-span-2 text-sm bg-stone-100 border border-stone-200 text-stone-700 rounded-lg px-3 py-2">
                Recorded from invoice {form.referenceNo}. To change the date, type or amount, undo it on the invoice.
                You can still edit the notes and attach a file.
              </p>
            )}

            <Field label="Date *" className="col-span-1">
              <input
                type="date"
                value={form.date}
                onChange={e => set('date', e.target.value)}
                required
                disabled={locked}
                className={inputCls}
              />
            </Field>

            <Field label="Type *" className="col-span-1">
              <select value={form.type} disabled={locked} onChange={e => set('type', e.target.value as 'Income' | 'Expense')} className={inputCls}>
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
                disabled={locked}
                className={inputCls}
              />
            </Field>

            <Field label="Category" className="col-span-1">
              <input
                type="text"
                list="transaction-categories"
                value={form.category}
                onChange={e => set('category', e.target.value)}
                placeholder="e.g. Veil Rental"
                className={inputCls}
              />
              <datalist id="transaction-categories">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
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

            <Field label="Invoice No." className="col-span-1">
              <input
                type="text"
                value={form.referenceNo}
                onChange={e => set('referenceNo', e.target.value)}
                placeholder="e.g. RCP-001"
                className={inputCls}
              />
            </Field>

            <Field label="Client" className="col-span-2">
              <select
                value={form.clientId}
                onChange={e => set('clientId', e.target.value)}
                className={inputCls}
              >
                <option value="">Not in client list</option>
                {linkedClientMissing && (
                  <option value={transaction?.clientId}>{transaction?.clientName || 'Linked client'}</option>
                )}
                {sortedClients.map(c => (
                  <option key={c.id} value={c.id}>{labels.get(c.id)}</option>
                ))}
              </select>
              {clientsError && (
                <p className="text-red-500 text-xs mt-1">Couldn't load clients: {clientsError}</p>
              )}
            </Field>

            {form.clientId === '' && (
              <Field label="Name (optional)" className="col-span-2">
                <input
                  type="text"
                  value={form.clientName}
                  onChange={e => set('clientName', e.target.value)}
                  placeholder="e.g. a walk-in client, or a supplier"
                  className={inputCls}
                />
              </Field>
            )}

            <Field label="Notes" className="col-span-2">
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Optional notes…"
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </Field>

            <Field label="Receipt or file" className="col-span-2">
              {(newFile || (existingFile && !removeExisting)) && (
                <div className="flex items-center gap-2 mb-2 text-sm text-stone-700">
                  <span className="text-stone-400 shrink-0"><PaperclipIcon /></span>
                  <span className="truncate min-w-0">{newFile ? newFile.name : existingFile?.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setFileError(null)
                      if (newFile) setNewFile(null)
                      else setRemoveExisting(true)
                    }}
                    className="ml-auto shrink-0 text-xs text-stone-400 hover:text-red-600 underline transition-colors"
                  >
                    Remove
                  </button>
                </div>
              )}
              {!newFile && existingFile && removeExisting && (
                <p className="mb-2 text-xs text-stone-500">
                  {existingFile.name} will be deleted when you save.{' '}
                  <button
                    type="button"
                    onClick={() => { setFileError(null); setRemoveExisting(false) }}
                    className="underline hover:text-stone-700"
                  >
                    Undo
                  </button>
                </p>
              )}
              {newFile && existingFile && !removeExisting && (
                <p className="mb-2 text-xs text-stone-500">Replaces {existingFile.name} when you save.</p>
              )}
              {/* A real file input, visually hidden: on a phone this is what offers
                  the camera, photo library or Files. */}
              <label className="inline-block cursor-pointer rounded-lg border border-stone-200 px-3 py-2 text-sm
                                text-stone-600 hover:bg-stone-50 transition-colors focus-within:ring-2 focus-within:ring-rose-300">
                {newFile || (existingFile && !removeExisting) ? 'Choose a different file' : 'Choose photo or PDF'}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileChosen}
                  className="sr-only"
                />
              </label>
              <p className="text-stone-400 text-xs mt-1.5">Photo or PDF, up to 10 MB.</p>
              {fileError && <p className="text-red-500 text-xs mt-1">{fileError}</p>}
            </Field>

          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-stone-200 shrink-0 space-y-3">
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={close}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 text-sm
                           text-stone-600 hover:bg-stone-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-rose-800 hover:bg-rose-700 text-white
                           text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? (newFile ? 'Uploading…' : 'Saving…') : transaction ? 'Save Changes' : 'Save Transaction'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

function PaperclipIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32a1.5 1.5 0 01-2.121-2.121l7.81-7.81" />
    </svg>
  )
}

const inputCls = `w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800
  focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent
  placeholder:text-stone-300 bg-white disabled:bg-stone-100 disabled:text-stone-500`

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
