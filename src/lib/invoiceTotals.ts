// The money rules of an invoice: what the lines add up to, and what is payable now.
// This is the one copy of these rules. It draws the live totals while Esther
// types, and the rows it returns are what issue_invoice() stores and prints.
// No I/O, so it's easy to test and works the same in demo mode.
//
// Everything is worked out in whole cents. JS numbers are binary floats, where
// 0.1 + 0.2 is 0.30000000000000004 and 50% of 100.01 is 50.005000000000003;
// whole numbers of cents are exact.

import type { InvoiceAdjustment, InvoiceKind, TotalsRow } from '../types'

export interface PricedLine {
  quantity:   number
  unitAmount: number   // SGD per unit
}

/** 12.34 → 1234. Rounds away float noise such as 0.29 * 100 = 28.999999999999996. */
export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

function fromCents(cents: number): number {
  return cents / 100
}

/** Quantity × unit amount for one line. */
export function lineTotal(line: PricedLine): number {
  return fromCents(toCents(line.unitAmount) * line.quantity)
}

export function calcSubtotal(lines: PricedLine[]): number {
  return fromCents(lines.reduce((sum, l) => sum + toCents(l.unitAmount) * l.quantity, 0))
}

const BALANCE_LABEL      = 'Balance due later'
const DEPOSIT_PAID_LABEL = 'Less: deposit paid'
const SECURITY_LABEL     = 'Refundable security deposit'

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.toLowerCase()

const isBalanceRow  = (a: InvoiceAdjustment) => a.direction === 'deduct' && sameText(a.label, BALANCE_LABEL)
const isSecurityRow = (a: InvoiceAdjustment) => a.direction === 'add' && sameText(a.label, SECURITY_LABEL)

// 0 - x rather than -x: an empty deduction would otherwise be -0, which prints as "-$0.00".
const signedCents = (a: InvoiceAdjustment) => (a.direction === 'deduct' ? 0 - toCents(a.amount) : toCents(a.amount))

const adjustmentRow = (a: InvoiceAdjustment): TotalsRow => ({
  label: a.label.trim(), amount: fromCents(signedCents(a)), bold: false,
})

/**
 * The totals block printed under the line items. There's no fixed deposit rule:
 * every row is one Esther added, and the amount payable is what they add up to.
 *   no payment rows : just the amount payable, which is the subtotal
 *   payment rows    : Subtotal, each row (a deduction is a negative amount), then
 *                     the amount payable
 *   a balance left  : see depositTotalsRows
 *
 * issue_invoice() works the amount payable out again from the stored rows and
 * refuses to issue if it disagrees with the last row here.
 *
 * The last row is always the amount payable now.
 */
export function buildTotalsRows(subtotal: number, adjustments: InvoiceAdjustment[]): TotalsRow[] {
  const total   = toCents(subtotal)
  const payable = adjustments.reduce((sum, a) => sum + signedCents(a), total)

  const balance = adjustments.find(isBalanceRow)
  if (balance) return depositTotalsRows(total, payable, balance, adjustments)

  const payableRow: TotalsRow = { label: 'Amount Payable Now', amount: fromCents(payable), bold: true }
  if (adjustments.length === 0) return [payableRow]
  return [{ label: 'Subtotal', amount: fromCents(total), bold: false }, ...adjustments.map(adjustmentRow), payableRow]
}

/**
 * A deposit with a balance still to come. The balance is stored as a deduction so
 * the sums work, but printing it as -$200 would read like money taken off the
 * price. It's still owed, so it shows as a plain figure under the amount payable,
 * for information.
 *
 * The balance row comes before the payable row here and memo moves it below when
 * printed, because issue_invoice() reads the last row as the amount payable.
 */
function depositTotalsRows(
  total: number,
  payable: number,
  balance: InvoiceAdjustment,
  adjustments: InvoiceAdjustment[],
): TotalsRow[] {
  const security = adjustments.filter(isSecurityRow)
  const extras   = adjustments.filter(a => a !== balance && !isSecurityRow(a))
  const deposit  = payable - security.reduce((sum, a) => sum + toCents(a.amount), 0)
  const hasSecurity = security.length > 0

  return [
    ...(extras.length > 0
      ? [{ label: 'Subtotal', amount: fromCents(total), bold: false }, ...extras.map(adjustmentRow)]
      : []),
    { label: 'Total', amount: fromCents(deposit + toCents(balance.amount)), bold: false },
    // With a security deposit the amount payable is more than the deposit, so
    // both are shown for the rows to add up.
    ...(hasSecurity
      ? [{ label: 'Deposit', amount: fromCents(deposit), bold: false }, ...security.map(adjustmentRow)]
      : []),
    { label: balance.label.trim(), amount: fromCents(toCents(balance.amount)), bold: false, memo: true },
    { label: hasSecurity ? 'Amount Payable Now' : 'Deposit Payable Now', amount: fromCents(payable), bold: true },
  ]
}

export function amountPayable(rows: TotalsRow[]): number {
  return rows[rows.length - 1]?.amount ?? 0
}

/** The totals rows in printed order, around the amount payable. */
export function splitTotals(rows: TotalsRow[]): { above: TotalsRow[]; payable: TotalsRow | undefined; below: TotalsRow[] } {
  const others = rows.slice(0, -1)
  return {
    above: others.filter(r => !r.memo),
    payable: rows[rows.length - 1],
    below: others.filter(r => r.memo),
  }
}

// ── The Payment section ────────────────────────────────────────────────────────

/**
 * What Esther fills in under Payment. She knows how much she's collecting, so
 * that's what the form asks for; the rows that print and get stored are worked
 * out from it by writePayment.
 */
export interface PaymentForm {
  depositAmount: number    // deposit: to collect now. final: already paid. full: unused.
  depositLabel: string     // final only: the printed label when it names the deposit invoice, or ''
  securityDeposit: number
  extras: InvoiceAdjustment[]   // charges (add) and discounts (deduct)
}

/** The price once charges and discounts are counted. A deposit is a part of this. */
export function priceAfterExtras(subtotal: number, extras: InvoiceAdjustment[]): number {
  return fromCents(extras.reduce(
    (sum, e) => (e.direction === 'deduct' ? sum - toCents(e.amount) : sum + toCents(e.amount)),
    toCents(subtotal),
  ))
}

/**
 * Reads saved rows back into the form. Rows it doesn't recognise become charges
 * and discounts, so no amount is lost from a draft made before this form existed.
 */
export function readPayment(kind: InvoiceKind, subtotal: number, adjustments: InvoiceAdjustment[]): PaymentForm {
  const depositRow = adjustments.find(a => a.direction === 'deduct' && (
    (kind === 'deposit' && sameText(a.label, BALANCE_LABEL)) ||
    (kind === 'final' && a.label.trim().toLowerCase().startsWith(DEPOSIT_PAID_LABEL.toLowerCase()))
  ))
  const securityRow = adjustments.find(isSecurityRow)
  const extras = adjustments.filter(a => a !== depositRow && a !== securityRow).map(a => ({ ...a }))

  let depositAmount = 0
  if (kind === 'final') depositAmount = depositRow?.amount ?? 0
  if (kind === 'deposit') {
    // No balance row means nothing is left for later, so the deposit is the whole price.
    const price = toCents(priceAfterExtras(subtotal, extras))
    depositAmount = fromCents(Math.max(0, price - toCents(depositRow?.amount ?? 0)))
  }

  return {
    depositAmount,
    depositLabel: kind === 'final' && depositRow ? depositRow.label : '',
    securityDeposit: securityRow?.amount ?? 0,
    extras,
  }
}

/**
 * The rows for what's on the form. Worked out afresh each time, so the balance
 * follows when a service price changes. A security deposit stays out of the
 * balance: it's handed back, so it isn't part of the price.
 */
export function writePayment(kind: InvoiceKind, subtotal: number, form: PaymentForm): InvoiceAdjustment[] {
  const rows = form.extras.map(e => ({ ...e }))
  const deposit = toCents(form.depositAmount)

  if (kind === 'deposit') {
    const balance = toCents(priceAfterExtras(subtotal, form.extras)) - deposit
    if (balance > 0) rows.push({ label: BALANCE_LABEL, direction: 'deduct', amount: fromCents(balance) })
  }
  if (kind === 'final' && deposit > 0) {
    rows.push({ label: form.depositLabel || DEPOSIT_PAID_LABEL, direction: 'deduct', amount: fromCents(deposit) })
  }
  if (toCents(form.securityDeposit) > 0) {
    rows.push({ label: SECURITY_LABEL, direction: 'add', amount: fromCents(toCents(form.securityDeposit)) })
  }
  return rows
}

/** Why the payment form can't be issued yet, or null if it can. */
export function paymentProblem(kind: InvoiceKind, subtotal: number, form: PaymentForm): string | null {
  if (kind === 'full') return null
  const deposit = toCents(form.depositAmount)
  if (kind === 'deposit' && deposit <= 0) return 'Enter the deposit to collect on this invoice.'
  if (deposit > toCents(priceAfterExtras(subtotal, form.extras))) {
    return 'The deposit is more than the invoice total.'
  }
  return null
}

/**
 * How much of a deposit invoice counts towards the price. A refundable security
 * deposit collected on it doesn't: that money is handed back, not spent on the veil.
 */
export function depositCollected(inv: { amountPayable: number | null; adjustments: InvoiceAdjustment[] }): number {
  const security = inv.adjustments
    .filter(isSecurityRow)
    .reduce((sum, a) => sum + toCents(a.amount), 0)
  return fromCents(toCents(inv.amountPayable ?? 0) - security)
}

// The label the old fixed rule printed on a rental final.
const OLD_SECURITY_LABEL = 'Security Deposit (Refundable)'

/**
 * The payment rows to start a replacement with. Invoices issued before payment
 * rows existed have none stored, only their frozen totals, so without this a
 * "void & reissue" of a 50% deposit would quietly bill the full price.
 */
export function adjustmentsForReissue(inv: {
  kind: InvoiceKind
  subtotal: number | null
  amountPayable: number | null
  totals: TotalsRow[] | null
  adjustments: InvoiceAdjustment[]
}): InvoiceAdjustment[] {
  if (inv.adjustments.length > 0 || inv.subtotal === null || inv.amountPayable === null) {
    return inv.adjustments.map(a => ({ ...a }))
  }
  const security = toCents(inv.totals?.find(r => r.label === OLD_SECURITY_LABEL)?.amount ?? 0)
  const heldBack = toCents(inv.subtotal) + security - toCents(inv.amountPayable)

  const rows: InvoiceAdjustment[] = []
  if (heldBack > 0) {
    rows.push({
      label: inv.kind === 'final' ? DEPOSIT_PAID_LABEL : BALANCE_LABEL,
      direction: 'deduct',
      amount: fromCents(heldBack),
    })
  }
  if (security > 0) {
    rows.push({ label: SECURITY_LABEL, direction: 'add', amount: fromCents(security) })
  }
  if (heldBack < 0) {
    rows.push({ label: 'Additional amount', direction: 'add', amount: fromCents(-heldBack) })
  }
  return rows
}
