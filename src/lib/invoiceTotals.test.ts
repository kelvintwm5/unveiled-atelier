import { describe, expect, it } from 'vitest'
import { adjustmentsForReissue, amountPayable, buildTotalsRows, calcSubtotal, halfBalance, lineTotal } from './invoiceTotals'
import type { InvoiceAdjustment } from '../types'

describe('calcSubtotal', () => {
  it('multiplies each line by its quantity', () => {
    expect(calcSubtotal([
      { quantity: 2, unitAmount: 400 },
      { quantity: 1, unitAmount: 200 },
    ])).toBe(1000)
  })

  it('adds cents exactly', () => {
    // In plain floats this is 0.30000000000000004.
    expect(calcSubtotal([
      { quantity: 1, unitAmount: 0.1 },
      { quantity: 1, unitAmount: 0.2 },
    ])).toBe(0.3)
    expect(lineTotal({ quantity: 3, unitAmount: 19.99 })).toBe(59.97)
  })

  it('is zero with no lines', () => {
    expect(calcSubtotal([])).toBe(0)
  })
})

const deduct = (label: string, amount: number): InvoiceAdjustment => ({ label, direction: 'deduct', amount })
const add    = (label: string, amount: number): InvoiceAdjustment => ({ label, direction: 'add', amount })

describe('buildTotalsRows', () => {
  it('full payment: with no rows, just the amount payable', () => {
    expect(buildTotalsRows(800, [])).toEqual([
      { label: 'Amount Payable Now', amount: 800, bold: true },
    ])
  })

  it('a deposit of any size: the subtotal less what is due later', () => {
    expect(buildTotalsRows(1000, [deduct('Balance due later', 700)])).toEqual([
      { label: 'Subtotal',           amount: 1000, bold: false },
      { label: 'Balance due later',  amount: -700, bold: false },
      { label: 'Amount Payable Now', amount: 300,  bold: true  },
    ])
  })

  it('a final: takes off the deposit paid', () => {
    expect(amountPayable(buildTotalsRows(800, [deduct('Less: deposit paid', 400)]))).toBe(400)
  })

  it('a rental final: takes off the deposit and adds a security deposit', () => {
    expect(buildTotalsRows(800, [deduct('Less: deposit paid', 400), add('Refundable security deposit', 300)])).toEqual([
      { label: 'Subtotal',                    amount: 800,  bold: false },
      { label: 'Less: deposit paid',          amount: -400, bold: false },
      { label: 'Refundable security deposit', amount: 300,  bold: false },
      { label: 'Amount Payable Now',          amount: 700,  bold: true  },
    ])
  })

  it('adds cents exactly', () => {
    // In plain floats 0.3 - 0.1 is 0.19999999999999998.
    expect(amountPayable(buildTotalsRows(0.3, [deduct('Less', 0.1)]))).toBe(0.2)
    expect(amountPayable(buildTotalsRows(100.1, [add('A', 0.2), deduct('B', 0.1)]))).toBe(100.2)
  })

  it('never has more than 2 decimal places', () => {
    for (const subtotal of [0.03, 33.33, 1234.57, 99999.99]) {
      for (const row of buildTotalsRows(subtotal, [deduct('A', 0.01), add('B', 19.99)])) {
        expect(Math.round(row.amount * 100) / 100).toBe(row.amount)
      }
    }
  })

  it('an empty deduction is plain zero, not -0', () => {
    expect(Object.is(buildTotalsRows(10, [deduct('New row', 0)])[1].amount, 0)).toBe(true)
  })

  it('tidies a label', () => {
    expect(buildTotalsRows(10, [add('  Fee ', 1)])[1].label).toBe('Fee')
  })
})

describe('halfBalance', () => {
  it('is half, with an odd cent going to the deposit', () => {
    expect(halfBalance(1000)).toBe(500)
    expect(halfBalance(100.01)).toBe(50)
  })
})

describe('adjustmentsForReissue', () => {
  const old = { adjustments: [] as InvoiceAdjustment[] }
  const payableAfter = (inv: Parameters<typeof adjustmentsForReissue>[0]) =>
    amountPayable(buildTotalsRows(inv.subtotal!, adjustmentsForReissue(inv)))

  it('keeps the rows of an invoice that has them', () => {
    const adjustments = [deduct('Balance due later', 100)]
    expect(adjustmentsForReissue({
      kind: 'deposit', subtotal: 300, amountPayable: 200, totals: [], adjustments,
    })).toEqual(adjustments)
  })

  it('an old 50% deposit still bills 50%', () => {
    const inv = {
      ...old, kind: 'deposit' as const, subtotal: 1000, amountPayable: 500,
      totals: [
        { label: 'Subtotal', amount: 1000, bold: false },
        { label: 'Booking Deposit Required (50%)', amount: 500, bold: false },
        { label: 'Amount Payable Now', amount: 500, bold: true },
      ],
    }
    expect(adjustmentsForReissue(inv)).toEqual([deduct('Balance due later', 500)])
    expect(payableAfter(inv)).toBe(500)
  })

  it('an old bespoke final still bills the balance', () => {
    const inv = {
      ...old, kind: 'final' as const, subtotal: 100.01, amountPayable: 50,
      totals: [
        { label: 'Remaining Balance (50%)', amount: 50, bold: false },
        { label: 'Amount Payable Now', amount: 50, bold: true },
      ],
    }
    expect(adjustmentsForReissue(inv)).toEqual([deduct('Less: deposit paid', 50.01)])
    expect(payableAfter(inv)).toBe(50)
  })

  it('an old rental final keeps its security deposit', () => {
    const inv = {
      ...old, kind: 'final' as const, subtotal: 1000, amountPayable: 1000,
      totals: [
        { label: 'Remaining Balance (50%)', amount: 500, bold: false },
        { label: 'Security Deposit (Refundable)', amount: 500, bold: false },
        { label: 'Amount Payable Now', amount: 1000, bold: true },
      ],
    }
    expect(adjustmentsForReissue(inv)).toEqual([
      deduct('Less: deposit paid', 500),
      add('Refundable security deposit', 500),
    ])
    expect(payableAfter(inv)).toBe(1000)
  })

  it('a draft has nothing to carry over', () => {
    expect(adjustmentsForReissue({ ...old, kind: 'full', subtotal: null, amountPayable: null, totals: null })).toEqual([])
  })
})
