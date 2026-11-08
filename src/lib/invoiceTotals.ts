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

/**
 * The totals block printed under the line items. There's no fixed deposit rule:
 * every row is one Esther added, and the amount payable is what they add up to.
 *   no payment rows : just the amount payable, which is the subtotal
 *   payment rows    : Subtotal, each row (a deduction is a negative amount), then
 *                     the amount payable
 *
 * issue_invoice() works the amount payable out again from the stored rows and
 * refuses to issue if it disagrees with the last row here.
 *
 * The last row is always the amount payable now.
 */
export function buildTotalsRows(subtotal: number, adjustments: InvoiceAdjustment[]): TotalsRow[] {
  const total   = toCents(subtotal)
  // 0 - x rather than -x: an empty deduction would otherwise be -0, which prints as "-$0.00".
  const signed  = adjustments.map(a => (a.direction === 'deduct' ? 0 - toCents(a.amount) : toCents(a.amount)))
  const payable = signed.reduce((sum, cents) => sum + cents, total)
  const payableRow: TotalsRow = { label: 'Amount Payable Now', amount: fromCents(payable), bold: true }

  if (adjustments.length === 0) return [payableRow]
  return [
    { label: 'Subtotal', amount: fromCents(total), bold: false },
    ...adjustments.map((a, i) => ({ label: a.label.trim(), amount: fromCents(signed[i]), bold: false })),
    payableRow,
  ]
}

export function amountPayable(rows: TotalsRow[]): number {
  return rows[rows.length - 1]?.amount ?? 0
}

/**
 * What "Balance due later" starts at when Esther adds it: the part left after a
 * half deposit rounded up to the cent. Only a starting figure she can overwrite.
 */
export function halfBalance(subtotal: number): number {
  const total = toCents(subtotal)
  return fromCents(total - Math.round(total / 2))
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
      label: inv.kind === 'final' ? 'Less: deposit paid' : 'Balance due later',
      direction: 'deduct',
      amount: fromCents(heldBack),
    })
  }
  if (security > 0) {
    rows.push({ label: 'Refundable security deposit', direction: 'add', amount: fromCents(security) })
  }
  if (heldBack < 0) {
    rows.push({ label: 'Additional amount', direction: 'add', amount: fromCents(-heldBack) })
  }
  return rows
}
