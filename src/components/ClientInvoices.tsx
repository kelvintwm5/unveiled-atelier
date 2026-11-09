import { useEffect, useMemo, useState } from 'react'
import InvoiceStatusBadge from './InvoiceStatusBadge'
import { listInvoices, payableOf, replacementOf } from '../lib/invoices'
import { clientBookings, clientInvoiceTotals } from '../lib/invoiceBookings'
import { balanceLeft } from '../lib/invoiceTotals'
import { formatSGD } from '../lib/money'
import { formatDate } from '../lib/dates'
import type { Invoice, InvoiceIntent } from '../types'

const KIND_LABEL: Record<Invoice['kind'], string> = { full: 'Full payment', deposit: 'Deposit', final: 'Final payment' }

// A client's invoices on their profile, grouped by booking. Void ones stay reachable
// behind a toggle: they're part of the record, but rarely what she's looking for.
export default function ClientInvoices({ mode, clientId, onGo }: {
  mode: 'demo' | 'app'
  clientId: string
  onGo: (intent: InvoiceIntent) => void
}) {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [error, setError]       = useState('')
  const [showVoid, setShowVoid] = useState(false)

  useEffect(() => {
    let cancelled = false
    listInvoices(mode)
      .then(list => { if (!cancelled) setInvoices(list) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load invoices.') })
    return () => { cancelled = true }
  }, [mode])

  const bookings = useMemo(() => clientBookings(invoices ?? [], clientId), [invoices, clientId])
  const totals   = useMemo(() => clientInvoiceTotals(invoices ?? [], clientId), [invoices, clientId])
  const voidCount = bookings.reduce((n, b) => n + b.voided.length, 0)

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">Invoices</h3>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !invoices ? (
        <p className="text-sm text-stone-400">Loading invoices…</p>
      ) : bookings.length === 0 ? (
        <p className="text-sm text-stone-400">No invoices linked to this client yet.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Figure label="Invoiced" amount={totals.invoiced} />
            <Figure label="Still to invoice" amount={totals.stillToInvoice} />
          </div>

          {bookings
            .filter(b => showVoid || b.active.length > 0)
            .map(b => (
              <div key={b.id}>
                <p className="text-sm font-medium text-stone-800 mb-1">{b.title}</p>
                <ul className="border border-stone-200 rounded-xl divide-y divide-stone-100">
                  {[...b.active, ...(showVoid ? b.voided : [])].map(inv => (
                    <li key={inv.id}>
                      <button
                        type="button"
                        onClick={() => onGo({ action: 'open', invoiceId: inv.id })}
                        className="w-full text-left px-3 py-2.5 hover:bg-stone-50 transition-colors rounded-xl
                                   flex items-start justify-between gap-3"
                      >
                        <span className="min-w-0">
                          <span className={`block text-sm ${inv.status === 'void' ? 'text-stone-400 line-through' : 'text-stone-800'}`}>
                            {KIND_LABEL[inv.kind]}{inv.invoiceNo && ` · ${inv.invoiceNo}`}
                          </span>
                          <span className="block text-xs text-stone-500">{detail(inv, invoices)}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm text-stone-700">{formatSGD(payableOf(inv))}</span>
                          <InvoiceStatusBadge status={inv.status} />
                        </span>
                      </button>
                    </li>
                  ))}
                  {b.openDeposit && !b.draftFinal && (
                    <li className="px-3 py-2.5 flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-sm text-stone-800">Final payment</span>
                        <span className="block text-xs text-stone-500">
                          {formatSGD(balanceLeft(b.openDeposit))} still to invoice
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onGo({ action: 'final', invoiceId: (b.openDeposit as Invoice).id })}
                        className="shrink-0 text-sm font-medium text-rose-800 border border-rose-200
                                   hover:bg-rose-50 rounded-lg px-3 py-1.5 transition-colors"
                      >
                        Create final
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            ))}

          {voidCount > 0 && (
            <button
              type="button"
              onClick={() => setShowVoid(v => !v)}
              className="text-xs text-stone-500 hover:text-stone-700 underline"
            >
              {showVoid ? 'Hide void invoices' : `Show ${voidCount} void ${voidCount === 1 ? 'invoice' : 'invoices'}`}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function detail(inv: Invoice, invoices: Invoice[]): string {
  if (inv.status === 'draft') return 'Not issued yet'
  if (inv.status === 'issued') return `Issued ${formatDate(inv.issuedOn)}`
  const replacement = replacementOf(invoices, inv.id)
  return [
    `Void${inv.voidReason ? `: ${inv.voidReason}` : ''}`,
    replacement?.invoiceNo && `Replaced by ${replacement.invoiceNo}`,
  ].filter(Boolean).join('. ')
}

function Figure({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="bg-stone-50 rounded-lg px-3 py-2">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="text-base font-semibold text-stone-800">{formatSGD(amount)}</p>
    </div>
  )
}
