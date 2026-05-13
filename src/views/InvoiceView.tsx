import { useState, useEffect } from 'react'
import {
  generateInvoice,
  fetchDepositInvoices,
  buildTotalsRows,
  calcSubtotal,
  fmtSGD,
  fmtDate,
  type LineItem,
  type TemplateType,
  type InvoiceType,
  type DepositInvoice,
} from '../lib/invoices'

interface Props {
  mode: 'demo' | 'app'
  accessToken?: string
}

const EMPTY_ITEM = (): LineItem => ({ title: '', description: '', quantity: 1, amount: 0 })

export default function InvoiceView({ mode, accessToken }: Props) {
  const [templateType, setTemplateType] = useState<TemplateType>('rental')
  const [invoiceType,  setInvoiceType]  = useState<InvoiceType>('deposit')
  const [clientName,    setClientName]    = useState('')
  const [clientEmail,   setClientEmail]   = useState('')
  const [clientContact, setClientContact] = useState('')
  const [pwsDate,       setPwsDate]       = useState('')
  const [weddingDate,   setWeddingDate]   = useState('')
  const [hasPws,        setHasPws]        = useState(true)
  const [hasWedding,    setHasWedding]    = useState(true)
  const [lineItems,     setLineItems]     = useState<LineItem[]>([EMPTY_ITEM()])
  const [generating,      setGenerating]      = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [result,          setResult]          = useState<{ invoiceNo: string; docUrl: string } | null>(null)
  const [deposits,        setDeposits]        = useState<DepositInvoice[]>([])
  const [loadingDeposits, setLoadingDeposits] = useState(false)
  const [depositSearch,   setDepositSearch]   = useState('')

  useEffect(() => {
    if (invoiceType !== 'final' || !accessToken || deposits.length > 0) return
    setLoadingDeposits(true)
    fetchDepositInvoices(accessToken)
      .then(setDeposits)
      .finally(() => setLoadingDeposits(false))
  }, [invoiceType, accessToken])

  const filteredDeposits = depositSearch.trim()
    ? deposits.filter(d => {
        const q = depositSearch.toLowerCase()
        return d.clientName.toLowerCase().includes(q) || d.invoiceNo.toLowerCase().includes(q)
      })
    : deposits

  function loadFromDeposit(dep: DepositInvoice) {
    setTemplateType(dep.templateType)
    setClientName(dep.clientName)
    setClientEmail(dep.clientEmail)
    setClientContact(dep.clientContact)
    setLineItems(dep.lineItems)
    setDepositSearch('')
  }

  // ── Line item helpers ──────────────────────────────────────────────────────

  function updateItem(idx: number, patch: Partial<LineItem>) {
    setLineItems(items => items.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }

  function addItem() {
    setLineItems(items => [...items, EMPTY_ITEM()])
  }

  function removeItem(idx: number) {
    setLineItems(items => items.filter((_, i) => i !== idx))
  }

  // ── Totals preview ─────────────────────────────────────────────────────────

  const subtotal = calcSubtotal(lineItems)
  const totals   = buildTotalsRows(templateType, invoiceType, subtotal)

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (!accessToken) return
    if (lineItems.some(i => !i.title || i.amount <= 0)) {
      setError('Each line item needs a title and a positive amount.')
      return
    }
    setGenerating(true)
    setError(null)
    setResult(null)
    try {
      const res = await generateInvoice(accessToken, {
        templateType,
        invoiceType,
        clientName,
        clientEmail,
        clientContact,
        pwsDate:    hasPws     ? pwsDate     : '',
        weddingDate: hasWedding ? weddingDate : '',
        lineItems,
      })
      setResult(res)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setGenerating(false)
    }
  }

  function resetForm() {
    setResult(null)
    setError(null)
    setClientName(''); setClientEmail(''); setClientContact('')
    setPwsDate(''); setWeddingDate('')
    setHasPws(true); setHasWedding(true)
    setLineItems([EMPTY_ITEM()])
    setTemplateType('rental')
    setInvoiceType('deposit')
    setDepositSearch('')
  }

  // ── Success state ──────────────────────────────────────────────────────────

  if (result) {
    return (
      <div className="h-full flex flex-col">
        <Header mode={mode} />
        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-stone-800 mb-1">Invoice Generated</h3>
            <p className="text-stone-500 text-sm mb-1">{result.invoiceNo}</p>
            <p className="text-stone-400 text-xs mb-6">Saved to your Invoices folder in Google Drive</p>
            <a
              href={result.docUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-rose-800 hover:bg-rose-700 text-white
                         text-sm font-medium px-5 py-2.5 rounded-xl transition-colors mb-3"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open Invoice
            </a>
            <br />
            <button
              onClick={resetForm}
              className="text-sm text-stone-400 hover:text-stone-600 transition-colors underline"
            >
              Generate another invoice
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col">
      <Header mode={mode} />

      <div className="flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-6">
        <form onSubmit={handleGenerate} className="max-w-2xl space-y-6">

          {/* ── Invoice type selectors ─────────────────────────────────────── */}
          <Section title="Invoice Type">
            <div className="grid grid-cols-2 gap-3">
              <SegmentGroup
                label="Template"
                options={[
                  { value: 'rental',  label: 'Rental' },
                  { value: 'bespoke', label: 'Bespoke' },
                ]}
                value={templateType}
                onChange={v => setTemplateType(v as TemplateType)}
              />
              <SegmentGroup
                label="Invoice"
                options={[
                  { value: 'deposit', label: '1st — Deposit' },
                  { value: 'final',   label: '2nd — Final' },
                ]}
                value={invoiceType}
                onChange={v => setInvoiceType(v as InvoiceType)}
              />
            </div>
          </Section>

          {/* ── Load from deposit ─────────────────────────────────────────── */}
          {invoiceType === 'final' && mode === 'app' && (
            <Section title="Load from Deposit Invoice">
              {loadingDeposits ? (
                <p className="text-sm text-stone-400">Fetching previous invoices…</p>
              ) : deposits.length === 0 ? (
                <p className="text-sm text-stone-400">
                  No deposit invoices found. Fill in the details below manually.
                </p>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={depositSearch}
                    onChange={e => setDepositSearch(e.target.value)}
                    placeholder="Search by client name or invoice number…"
                    className={inputCls}
                  />
                  {depositSearch && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-stone-200
                                    rounded-lg shadow-lg max-h-52 overflow-y-auto">
                      {filteredDeposits.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-stone-400">No matching invoices</p>
                      ) : filteredDeposits.map(d => (
                        <button
                          key={d.invoiceNo}
                          type="button"
                          onClick={() => loadFromDeposit(d)}
                          className="w-full text-left px-4 py-2.5 hover:bg-stone-50
                                     transition-colors border-b border-stone-100 last:border-0"
                        >
                          <span className="text-sm font-medium text-stone-800">{d.clientName}</span>
                          <span className="text-xs text-stone-400 ml-2">{d.invoiceNo} · {d.date}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Section>
          )}

          {/* ── Client details ─────────────────────────────────────────────── */}
          <Section title="Client Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Full Name *" className="sm:col-span-2">
                <input
                  type="text" value={clientName} required
                  onChange={e => setClientName(e.target.value)}
                  placeholder="e.g. Sarah Lim"
                  className={inputCls}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email" value={clientEmail}
                  onChange={e => setClientEmail(e.target.value)}
                  placeholder="sarah@email.com"
                  className={inputCls}
                />
              </Field>
              <Field label="Contact">
                <input
                  type="text" value={clientContact}
                  onChange={e => setClientContact(e.target.value)}
                  placeholder="+65 9123 4567"
                  className={inputCls}
                />
              </Field>
            </div>
          </Section>

          {/* ── Dates ─────────────────────────────────────────────────────── */}
          <Section title="Dates">
            <div className="space-y-3">
              <DateToggleField
                label="PWS Date"
                enabled={hasPws}
                onToggle={() => { setHasPws(v => !v); setPwsDate('') }}
                value={pwsDate}
                onChange={setPwsDate}
              />
              <DateToggleField
                label="Wedding Date"
                enabled={hasWedding}
                onToggle={() => { setHasWedding(v => !v); setWeddingDate('') }}
                value={weddingDate}
                onChange={setWeddingDate}
              />
            </div>
          </Section>

          {/* ── Line items ─────────────────────────────────────────────────── */}
          <Section title="Service Details">
            <div className="space-y-3">
              {lineItems.map((item, idx) => (
                <LineItemRow
                  key={idx}
                  item={item}
                  index={idx}
                  canRemove={lineItems.length > 1}
                  onChange={patch => updateItem(idx, patch)}
                  onRemove={() => removeItem(idx)}
                />
              ))}
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1.5 text-sm text-rose-700 hover:text-rose-900
                           transition-colors font-medium"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add line item
              </button>
            </div>
          </Section>

          {/* ── Totals preview ──────────────────────────────────────────────── */}
          {subtotal > 0 && (
            <Section title="Totals Preview">
              <div className="bg-stone-50 rounded-xl border border-stone-200 divide-y divide-stone-200">
                {totals.map(row => (
                  <div
                    key={row.label}
                    className={`flex justify-between px-4 py-2.5 text-sm ${
                      row.bold ? 'font-semibold text-stone-800' : 'text-stone-600'
                    }`}
                  >
                    <span>{row.label}</span>
                    <span>{fmtSGD(row.amount)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── Submit ─────────────────────────────────────────────────────── */}
          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}
          <button
            type="submit"
            disabled={generating || subtotal === 0 || mode === 'demo'}
            title={mode === 'demo' ? 'Sign in as Owner to generate invoices' : undefined}
            className="w-full py-3 bg-rose-800 hover:bg-rose-700 text-white font-medium text-sm
                       rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Generating…
              </>
            ) : mode === 'demo' ? (
              'Sign in to Generate'
            ) : (
              'Generate Invoice'
            )}
          </button>

        </form>
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Header({ mode }: { mode: 'demo' | 'app' }) {
  return (
    <div className="px-4 py-4 md:px-8 md:py-6 border-b border-stone-200 bg-white shrink-0">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-stone-800">Invoice Generator</h2>
          <p className="text-stone-400 text-sm mt-0.5">
            Generate a Google Doc invoice and save it to Drive
          </p>
        </div>
        {mode === 'app' && (
          <a
            href="https://drive.google.com/drive/folders/1XAaHgJBcXVeOP1Mvd-8Q0OX83sOWj81r"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-rose-700
                       border border-stone-200 hover:border-rose-300 rounded-lg px-3 py-1.5
                       transition-colors shrink-0"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.18 15l-2.18-3.77L8.18 3h7.64L6.18 15zm1.64 2.83L9.64 21H20l-4-6.93-8.18 3.76zM14.36 3L20 12.5 17.82 16 11.27 5.25 14.36 3z"/>
            </svg>
            View All Invoices
          </a>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, children, className = '' }: {
  label: string; children: React.ReactNode; className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-stone-500 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function SegmentGroup({ label, options, value, onChange }: {
  label: string
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <p className="text-xs font-medium text-stone-500 mb-1.5">{label}</p>
      <div className="flex rounded-lg border border-stone-200 overflow-hidden">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={[
              'flex-1 py-2 text-xs font-medium transition-colors',
              value === opt.value
                ? 'bg-rose-800 text-white'
                : 'bg-white text-stone-600 hover:bg-stone-50',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function DateToggleField({ label, enabled, onToggle, value, onChange }: {
  label: string; enabled: boolean; onToggle: () => void
  value: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onToggle}
        className={[
          'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent',
          'transition-colors focus:outline-none',
          enabled ? 'bg-rose-800' : 'bg-stone-200',
        ].join(' ')}
      >
        <span className={[
          'inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform',
          enabled ? 'translate-x-4' : 'translate-x-0',
        ].join(' ')} />
      </button>
      <span className="text-sm text-stone-600 w-28 shrink-0">{label}</span>
      {enabled && (
        <input
          type="date"
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`${inputCls} flex-1`}
        />
      )}
      {enabled && value && (
        <span className="text-xs text-stone-400 shrink-0">{fmtDate(value)}</span>
      )}
    </div>
  )
}

function LineItemRow({ item, index, canRemove, onChange, onRemove }: {
  item: LineItem; index: number; canRemove: boolean
  onChange: (p: Partial<LineItem>) => void; onRemove: () => void
}) {
  return (
    <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <span className="text-xs text-stone-400 font-medium pt-2.5 shrink-0">#{index + 1}</span>
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Title (bold in invoice) *" className="sm:col-span-2">
            <input
              type="text" value={item.title} required
              onChange={e => onChange({ title: e.target.value })}
              placeholder="e.g. Bespoke Veil Rental"
              className={inputCls}
            />
          </Field>
          <Field label="Description (italic in invoice)" className="sm:col-span-2">
            <textarea
              value={item.description} rows={2}
              onChange={e => onChange({ description: e.target.value })}
              placeholder="e.g. Custom-made for client use. Design as outlined in proposal dated 10 Apr 2026."
              className={`${inputCls} resize-none`}
            />
          </Field>
          <Field label="Quantity">
            <input
              type="number" min={1} step={1} value={item.quantity} required
              onChange={e => onChange({ quantity: parseInt(e.target.value) || 1 })}
              className={inputCls}
            />
          </Field>
          <Field label="Amount (SGD) *">
            <input
              type="number" min={0.01} step={0.01} value={item.amount || ''}
              onChange={e => onChange({ amount: parseFloat(e.target.value) || 0 })}
              placeholder="0.00" required
              className={inputCls}
            />
          </Field>
        </div>
        {canRemove && (
          <button
            type="button" onClick={onRemove}
            className="text-stone-300 hover:text-red-400 transition-colors pt-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      {item.amount > 0 && (
        <p className="text-xs text-stone-400 text-right">
          {fmtSGD(item.amount * item.quantity)}
        </p>
      )}
    </div>
  )
}

const inputCls = `w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800
  bg-white focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent
  placeholder:text-stone-300`
