import { useEffect, useMemo, useState } from 'react'
import InvoiceStatusBadge from './InvoiceStatusBadge'
import { closeBooking, listInvoices, payableOf, reopenBooking, replacementOf } from '../lib/invoices'
import { clientBookings, clientInvoiceTotals, securityText } from '../lib/invoiceBookings'
import { balanceLeft } from '../lib/invoiceTotals'
import { formatSGD } from '../lib/money'
import { formatDate, todaySgt } from '../lib/dates'
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
  const [closing, setClosing]   = useState<string | null>(null)   // the deposit being closed
  const [reason, setReason]     = useState('')
  const [busy, setBusy]         = useState(false)

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

  async function change(action: () => Promise<Invoice>) {
    setBusy(true)
    setError('')
    try {
      const updated = await action()
      setInvoices(list => (list ?? []).map(i => (i.id === updated.id ? updated : i)))
      setClosing(null)
      setReason('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'That didn’t save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">Invoices</h3>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {!invoices ? (
        !error && <p className="text-sm text-stone-400">Loading invoices…</p>
      ) : bookings.length === 0 ? (
        <p className="text-sm text-stone-400">No invoices linked to this client yet.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="grid grid-cols-3 gap-2">
              <Figure label="Invoiced" amount={totals.invoiced} />
              <Figure label="Received" amount={totals.received} />
              <Figure label="To collect" amount={totals.toCollect} />
            </div>
            {totals.securityHeld > 0 && (
              <p className="text-xs text-stone-500 mt-2">
                {formatSGD(totals.securityHeld)} of what's received is a security deposit still held for this client.
              </p>
            )}
          </div>

          {bookings
            .filter(b => showVoid || b.active.length > 0)
            .map(b => {
              const closed = b.active.find(i => i.payment?.bookingClosedOn)
              const open = b.openDeposit
              return (
                <div key={b.id}>
                  <p className="text-sm font-medium text-stone-800 mb-1">{b.title}</p>
                  <ul className="border border-stone-200 rounded-xl divide-y divide-stone-100">
                    {[...b.active, ...(showVoid ? b.voided : [])].map(inv => (
                      <li key={inv.id}>
                        <button
                          type="button"
                          onClick={() => onGo({ action: 'open', invoiceId: inv.id })}
                          className="w-full text-left pl-3 pr-2 py-2.5 hover:bg-stone-50 transition-colors rounded-xl
                                     flex items-center gap-2"
                        >
                          <span className="flex-1 min-w-0 flex items-start justify-between gap-3">
                            <span className="min-w-0">
                              <span className={`block text-sm ${inv.status === 'void' ? 'text-stone-400 line-through' : 'text-stone-800'}`}>
                                {KIND_LABEL[inv.kind]}{inv.invoiceNo && ` · ${inv.invoiceNo}`}
                              </span>
                              <span className="block text-xs text-stone-500">{detail(inv, invoices)}</span>
                              {inv.payment && securityText(inv.payment) && (
                                <span className="block text-xs text-stone-500">{securityText(inv.payment)}</span>
                              )}
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="block text-sm text-stone-700">{formatSGD(payableOf(inv))}</span>
                              <InvoiceStatusBadge status={inv.status} paid={inv.payment !== null} />
                            </span>
                          </span>
                          {/* There's no hover on a phone, so this is what says the row opens. */}
                          <svg className="w-5 h-5 shrink-0 text-rose-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </li>
                    ))}

                    {open && !b.draftFinal && (
                      <li className="px-3 py-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block text-sm text-stone-800">Final payment</span>
                            <span className="block text-xs text-stone-500">{formatSGD(balanceLeft(open))} still to invoice</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => onGo({ action: 'final', invoiceId: open.id })}
                            className="shrink-0 text-sm font-medium text-rose-800 border border-rose-200
                                       hover:bg-rose-50 rounded-lg px-3 py-1.5 transition-colors"
                          >
                            Create final
                          </button>
                        </div>
                        {mode === 'app' && open.payment && closing !== open.id && (
                          <button
                            type="button"
                            onClick={() => { setClosing(open.id); setReason('') }}
                            className="text-xs text-stone-500 hover:text-stone-700 underline"
                          >
                            Client cancelled? Close booking
                          </button>
                        )}
                        {closing === open.id && (
                          <div className="space-y-2">
                            <input
                              type="text" value={reason} onChange={e => setReason(e.target.value)}
                              placeholder="Reason (optional)"
                              className="w-full min-w-0 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800
                                         bg-white placeholder:text-stone-300 focus:outline-none focus:ring-2
                                         focus:ring-rose-300 focus:border-transparent"
                            />
                            <p className="text-xs text-stone-500">
                              The deposit stays as income, and no final will be expected.
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button" disabled={busy}
                                onClick={() => change(() => closeBooking(mode, open.id, todaySgt(), reason))}
                                className="px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white text-sm font-medium
                                           rounded-lg transition-colors disabled:opacity-50"
                              >
                                {busy ? 'Saving…' : 'Close booking'}
                              </button>
                              <button
                                type="button" disabled={busy} onClick={() => setClosing(null)}
                                className="px-3 py-1.5 text-sm text-stone-600 hover:text-stone-800 transition-colors"
                              >
                                Keep open
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    )}

                    {closed && (
                      <li className="px-3 py-2.5 flex items-center justify-between gap-3">
                        <span className="min-w-0 text-xs text-stone-500">
                          Booking closed {formatDate(closed.payment?.bookingClosedOn ?? '')}
                          {closed.payment?.bookingClosedReason && `: ${closed.payment.bookingClosedReason}`}
                        </span>
                        {mode === 'app' && (
                          <button
                            type="button" disabled={busy}
                            onClick={() => change(() => reopenBooking(mode, closed.id))}
                            className="shrink-0 text-xs text-stone-500 hover:text-stone-700 underline disabled:opacity-50"
                          >
                            Reopen
                          </button>
                        )}
                      </li>
                    )}
                  </ul>
                </div>
              )
            })}

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
  if (inv.status === 'issued') {
    return inv.payment
      ? `Paid ${formatDate(inv.payment.paidOn)}${inv.payment.method ? ` by ${inv.payment.method}` : ''}`
      : `Issued ${formatDate(inv.issuedOn)}`
  }
  const replacement = replacementOf(invoices, inv.id)
  return [
    `Void${inv.voidReason ? `: ${inv.voidReason}` : ''}`,
    replacement?.invoiceNo && `Replaced by ${replacement.invoiceNo}`,
  ].filter(Boolean).join('. ')
}

function Figure({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="bg-stone-50 rounded-lg px-2.5 py-2 min-w-0">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="text-sm font-semibold text-stone-800 break-words">{formatSGD(amount)}</p>
    </div>
  )
}
