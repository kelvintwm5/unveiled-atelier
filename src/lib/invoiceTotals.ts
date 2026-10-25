// The money rules of an invoice: what the lines add up to, and what is payable now.
// This is the one copy of these rules. It draws the live totals while Esther
// types, and the rows it returns are what issue_invoice() stores and prints.
// No I/O, so it's easy to test and works the same in demo mode.
//
// Everything is worked out in whole cents. JS numbers are binary floats, where
// 0.1 + 0.2 is 0.30000000000000004 and 50% of 100.01 is 50.005000000000003;
// whole numbers of cents are exact.

import type { InvoiceKind, InvoiceTemplate, TotalsRow } from '../types'

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
 * The totals block printed under the line items.
 *   deposit       : Subtotal, then 50% booking deposit, payable now.
 *   bespoke final : the remaining 50%.
 *   rental final  : the remaining 50% plus a refundable security deposit of the
 *                   same amount, so the amount payable equals the subtotal.
 *
 * The booking deposit is 50% rounded to the nearest cent (half a cent rounds up),
 * and the remaining balance is the subtotal minus that deposit. So for an odd
 * number of cents the deposit is a cent more than the balance, and the two
 * invoices always add up to exactly the subtotal.
 *
 * The last row is always the amount payable now.
 */
export function buildTotalsRows(
  template: InvoiceTemplate,
  kind: InvoiceKind,
  subtotal: number,
): TotalsRow[] {
  const total     = toCents(subtotal)
  const deposit   = Math.round(total / 2)
  const remaining = total - deposit

  if (kind === 'deposit') {
    return [
      { label: 'Subtotal',                       amount: fromCents(total),   bold: false },
      { label: 'Booking Deposit Required (50%)', amount: fromCents(deposit), bold: false },
      { label: 'Amount Payable Now',             amount: fromCents(deposit), bold: true  },
    ]
  }
  if (template === 'rental') {
    return [
      { label: 'Remaining Balance (50%)',       amount: fromCents(remaining),     bold: false },
      { label: 'Security Deposit (Refundable)', amount: fromCents(remaining),     bold: false },
      { label: 'Amount Payable Now',            amount: fromCents(remaining * 2), bold: true  },
    ]
  }
  return [
    { label: 'Remaining Balance (50%)', amount: fromCents(remaining), bold: false },
    { label: 'Amount Payable Now',      amount: fromCents(remaining), bold: true  },
  ]
}

export function amountPayable(rows: TotalsRow[]): number {
  return rows[rows.length - 1]?.amount ?? 0
}
