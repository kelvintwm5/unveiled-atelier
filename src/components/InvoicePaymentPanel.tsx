import { useState } from 'react'
import { recordPayment, settleSecurityDeposit, undoPayment, undoSecuritySettlement } from '../lib/invoices'
import { paymentSplit, securityHeld, securityText } from '../lib/invoiceBookings'
import { toCents } from '../lib/invoiceTotals'
import { formatDate, todaySgt } from '../lib/dates'
import { formatSGD } from '../lib/money'
import type { Invoice } from '../types'

const inputCls = [
  'w-full min-w-0 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 bg-white',
  'focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent placeholder:text-stone-300',
].join(' ')
const primaryCls = 'px-4 py-2 bg-rose-800 hover:bg-rose-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50'
const secondaryCls = 'px-4 py-2 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50'
const linkCls = 'text-xs text-stone-500 hover:text-stone-700 underline disabled:opacity-50'

type OpenForm = 'pay' | 'return' | 'keep' | null

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// A correction to last year's income may no longer match what was filed with IRAS.
function earlierYearWarning(date: string): string {
  const year = date.slice(0, 4)
  return year === todaySgt().slice(0, 4)
    ? ''
    : `\n\nThis income is from ${year}. If that year has been filed, check with your accountant first.`
}

export default function InvoicePaymentPanel({ mode, invoice, onChanged }: {
  mode: 'demo' | 'app'
  invoice: Invoice
  onChanged: (inv: Invoice) => Promise<void>
}) {
  const [form, setForm]     = useState<OpenForm>(null)
  const [date, setDate]     = useState(todaySgt())
  const [method, setMethod] = useState('PayNow')
  const [kept, setKept]     = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')

  const canAct = mode === 'app'
  const p = invoice.payment
  const { price, security } = paymentSplit(invoice)

  const keptNumber = Number(kept)
  const heldCents  = toCents(securityHeld(p))
  const keptValid  = kept !== '' && keptNumber > 0 && toCents(keptNumber) <= heldCents

  function openForm(next: OpenForm) {
    setForm(next)
    setDate(todaySgt())
    setKept('')
    setReason('')
    setError('')
  }

  async function run(action: () => Promise<Invoice>) {
    setBusy(true)
    setError('')
    try {
      const updated = await action()
      setForm(null)
      await onChanged(updated)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  function handleUndoPayment() {
    if (!p) return
    const income = p.priceAmount > 0 ? `The ${formatSGD(p.priceAmount)} income comes out of Transactions.` : ''
    if (!window.confirm(`Undo this payment? ${income}${earlierYearWarning(p.paidOn)}`)) return
    run(() => undoPayment(mode, invoice.id))
  }

  function handleUndoSecurity() {
    if (!p) return
    const income = p.securityKept > 0
      ? `The ${formatSGD(p.securityKept)} income comes out of Transactions.${earlierYearWarning(p.securitySettledOn)}`
      : ''
    if (!window.confirm(`Undo this and mark the security deposit as held again? ${income}`)) return
    run(() => undoSecuritySettlement(mode, invoice.id))
  }

  const dateField = (label: string, min?: string) => (
    <label className="block">
      <span className="block text-sm text-stone-600 mb-1.5">{label}</span>
      <input type="date" value={date} min={min} max={todaySgt()} onChange={e => setDate(e.target.value)} className={inputCls} />
    </label>
  )

  const buttons = (label: string, disabled: boolean, onSave: () => void) => (
    <div className="flex gap-2">
      <button type="button" onClick={onSave} disabled={busy || disabled} className={primaryCls}>
        {busy ? 'Saving…' : label}
      </button>
      <button type="button" onClick={() => openForm(null)} disabled={busy} className={secondaryCls}>Cancel</button>
    </div>
  )

  const card = 'bg-white border border-stone-200 rounded-xl p-4 space-y-3'

  if (!p) {
    return (
      <div className={card}>
        <p className="text-sm text-stone-700">
          Not paid yet. {security > 0
            ? `${formatSGD(price)} becomes income, and ${formatSGD(security)} is held as a security deposit.`
            : `${formatSGD(price)} becomes income once it's paid.`}
        </p>
        {form === 'pay' ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {dateField('Date paid')}
              <label className="block">
                <span className="block text-sm text-stone-600 mb-1.5">Paid by</span>
                <input
                  type="text" list="payment-methods" value={method}
                  onChange={e => setMethod(e.target.value)} className={inputCls}
                />
                <datalist id="payment-methods">
                  <option value="PayNow" />
                  <option value="Bank transfer" />
                  <option value="Cash" />
                </datalist>
              </label>
            </div>
            {buttons('Save payment', !date, () => run(() => recordPayment(mode, invoice.id, date, method)))}
          </>
        ) : canAct ? (
          <button type="button" onClick={() => openForm('pay')} className={primaryCls}>Mark as paid</button>
        ) : (
          <p className="text-xs text-stone-400">Sign in as Owner to record payments.</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  const held = securityHeld(p) > 0
  const keepLeft = keptValid ? (heldCents - toCents(keptNumber)) / 100 : null
  const settled = p.securityAmount > 0 && !held

  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-800">
            Paid {formatDate(p.paidOn)}{p.method && ` by ${p.method}`}
          </p>
          {p.priceAmount > 0 && <p className="text-xs text-stone-500">{formatSGD(p.priceAmount)} recorded as income</p>}
        </div>
        {canAct && !settled && !p.bookingClosedOn && (
          <button type="button" onClick={handleUndoPayment} disabled={busy} className={linkCls}>Undo payment</button>
        )}
      </div>

      {p.bookingClosedOn && (
        <p className="text-sm text-stone-600">
          Booking closed {formatDate(p.bookingClosedOn)}{p.bookingClosedReason && `: ${p.bookingClosedReason}`}. The income stays.
        </p>
      )}

      {p.securityAmount > 0 && (
        <div className="border-t border-stone-100 pt-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-stone-800">{securityText(p)}</p>
              {p.securitySettledOn && (
                <p className="text-xs text-stone-500">
                  {formatDate(p.securitySettledOn)}{p.securityNote && `: ${p.securityNote}`}
                </p>
              )}
            </div>
            {canAct && settled && (
              <button type="button" onClick={handleUndoSecurity} disabled={busy} className={linkCls}>Undo</button>
            )}
          </div>

          {canAct && held && form === null && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => openForm('return')} className={secondaryCls}>Returned in full</button>
              <button type="button" onClick={() => openForm('keep')} className={secondaryCls}>Keep some or all</button>
            </div>
          )}

          {form === 'return' && (
            <>
              {dateField('Date returned', p.paidOn)}
              {buttons('Save', !date, () => run(() => settleSecurityDeposit(mode, invoice.id, date, 0, '')))}
            </>
          )}

          {form === 'keep' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-sm text-stone-600 mb-1.5">Amount kept (SGD)</span>
                  <input
                    type="number" min="0.01" step="0.01" max={p.securityAmount} value={kept}
                    onChange={e => setKept(e.target.value)} placeholder={String(p.securityAmount)} className={inputCls}
                  />
                </label>
                {dateField('Date kept', p.paidOn)}
              </div>
              <label className="block">
                <span className="block text-sm text-stone-600 mb-1.5">Reason</span>
                <input
                  type="text" value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Tear in the lace edge" className={inputCls}
                />
              </label>
              {kept !== '' && !keptValid && (
                <p className="text-sm text-red-600">Enter an amount up to {formatSGD(securityHeld(p))}.</p>
              )}
              {keepLeft !== null && (
                <p className="text-sm text-stone-600">
                  {formatSGD(keptNumber)} becomes income.{' '}
                  {keepLeft > 0 ? `Return ${formatSGD(keepLeft)} to the client.` : 'Nothing goes back to the client.'}
                </p>
              )}
              {buttons('Save', !keptValid || !reason.trim() || !date,
                () => run(() => settleSecurityDeposit(mode, invoice.id, date, keptNumber, reason)))}
            </>
          )}
        </div>
      )}

      {canAct && settled && (
        <p className="text-xs text-stone-400">To undo the payment, undo the security deposit first.</p>
      )}
      {!canAct && held && <p className="text-xs text-stone-400">Sign in as Owner to return or keep a security deposit.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
