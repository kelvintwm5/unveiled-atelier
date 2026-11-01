import { describe, expect, it } from 'vitest'
import { amountPayable, buildTotalsRows, calcSubtotal, lineTotal, toCents } from './invoiceTotals'

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

describe('buildTotalsRows', () => {
  it('deposit: subtotal, then 50% payable now', () => {
    const rows = buildTotalsRows('rental', 'deposit', 1000)
    expect(rows).toEqual([
      { label: 'Subtotal',                       amount: 1000, bold: false },
      { label: 'Booking Deposit Required (50%)', amount: 500,  bold: false },
      { label: 'Amount Payable Now',             amount: 500,  bold: true  },
    ])
    // Same for bespoke.
    expect(buildTotalsRows('bespoke', 'deposit', 1000)).toEqual(rows)
  })

  it('bespoke final: the remaining 50%', () => {
    expect(buildTotalsRows('bespoke', 'final', 1000)).toEqual([
      { label: 'Remaining Balance (50%)', amount: 500, bold: false },
      { label: 'Amount Payable Now',      amount: 500, bold: true  },
    ])
  })

  it('rental final: the remaining 50% plus an equal refundable security deposit', () => {
    expect(buildTotalsRows('rental', 'final', 1000)).toEqual([
      { label: 'Remaining Balance (50%)',       amount: 500,  bold: false },
      { label: 'Security Deposit (Refundable)', amount: 500,  bold: false },
      { label: 'Amount Payable Now',            amount: 1000, bold: true  },
    ])
  })

  it('odd cents: the deposit rounds up and the balance takes the rest', () => {
    expect(amountPayable(buildTotalsRows('bespoke', 'deposit', 100.01))).toBe(50.01)
    expect(amountPayable(buildTotalsRows('bespoke', 'final', 100.01))).toBe(50)
    const rental = buildTotalsRows('rental', 'final', 100.01)
    expect(rental.map(r => r.amount)).toEqual([50, 50, 100])
  })

  it('deposit plus balance is always exactly the subtotal', () => {
    for (let cents = 1; cents <= 5000; cents++) {
      const subtotal = cents / 100
      const deposit  = amountPayable(buildTotalsRows('bespoke', 'deposit', subtotal))
      const balance  = amountPayable(buildTotalsRows('bespoke', 'final', subtotal))
      expect(toCents(deposit) + toCents(balance)).toBe(cents)
    }
  })

  it('never has more than 2 decimal places', () => {
    for (const subtotal of [0.01, 0.03, 33.33, 1234.57, 99999.99]) {
      for (const row of [
        ...buildTotalsRows('rental', 'deposit', subtotal),
        ...buildTotalsRows('rental', 'final', subtotal),
      ]) {
        expect(Math.round(row.amount * 100) / 100).toBe(row.amount)
      }
    }
  })
})
