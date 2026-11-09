import { describe, expect, it } from 'vitest'
import {
  adjustmentsForReissue, amountPayable, buildTotalsRows, calcSubtotal, depositCollected, lineTotal,
  paymentProblem, priceAfterExtras, readPayment, writePayment, type PaymentForm,
} from './invoiceTotals'
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

describe('the payment form', () => {
  const form = (patch: Partial<PaymentForm> = {}): PaymentForm => ({
    depositAmount: 0, depositLabel: '', securityDeposit: 0, extras: [], ...patch,
  })
  const payable = (subtotal: number, rows: InvoiceAdjustment[]) => amountPayable(buildTotalsRows(subtotal, rows))
  const charge = { label: 'Rush fee', direction: 'add', amount: 40 } as const
  const discount = { label: 'Returning client', direction: 'deduct', amount: 30 } as const
  const security = { label: 'Refundable security deposit', direction: 'add', amount: 50 } as const

  describe('writePayment', () => {
    it('adds no rows to a plain full payment', () => {
      expect(writePayment('full', 300, form())).toEqual([])
    })

    it('ignores a deposit amount on a full payment', () => {
      expect(writePayment('full', 300, form({ depositAmount: 100 }))).toEqual([])
    })

    it('holds back the balance so a deposit invoice collects the deposit', () => {
      const rows = writePayment('deposit', 300, form({ depositAmount: 100 }))
      expect(rows).toEqual([{ label: 'Balance due later', direction: 'deduct', amount: 200 }])
      expect(payable(300, rows)).toBe(100)
    })

    it('moves the balance, not the deposit, when the price changes', () => {
      expect(payable(450, writePayment('deposit', 450, form({ depositAmount: 100 })))).toBe(100)
    })

    it('collects exactly the deposit even with charges and discounts', () => {
      const rows = writePayment('deposit', 300, form({ depositAmount: 100, extras: [charge, discount] }))
      expect(rows[rows.length - 1]).toEqual({ label: 'Balance due later', direction: 'deduct', amount: 210 })
      expect(payable(300, rows)).toBe(100)
    })

    it('leaves out the balance when the deposit is the whole price', () => {
      expect(writePayment('deposit', 300, form({ depositAmount: 300 }))).toEqual([])
    })

    it('collects nothing yet while the deposit is empty', () => {
      expect(payable(300, writePayment('deposit', 300, form()))).toBe(0)
    })

    it('takes the deposit paid off a final, keeping a label that names the invoice', () => {
      const rows = writePayment('final', 300, form({ depositAmount: 100, depositLabel: 'Less: deposit paid (UA-2026-1825)' }))
      expect(rows).toEqual([{ label: 'Less: deposit paid (UA-2026-1825)', direction: 'deduct', amount: 100 }])
    })

    it('uses the plain label on a final with no linked deposit', () => {
      expect(writePayment('final', 300, form({ depositAmount: 100 }))[0].label).toBe('Less: deposit paid')
    })

    it('adds a security deposit on top, outside the balance', () => {
      const rows = writePayment('deposit', 300, form({ depositAmount: 100, securityDeposit: 50 }))
      expect(rows).toEqual([
        { label: 'Balance due later', direction: 'deduct', amount: 200 },
        security,
      ])
      expect(payable(300, rows)).toBe(150)
    })

    it('stays exact in cents', () => {
      expect(writePayment('deposit', 100.3, form({ depositAmount: 33.1 }))[0].amount).toBe(67.2)
    })

    it('keeps a deposit bigger than a price still being typed', () => {
      expect(writePayment('deposit', 5, form({ depositAmount: 100 }))).toEqual([])
      expect(writePayment('deposit', 500, form({ depositAmount: 100 }))[0].amount).toBe(400)
    })
  })

  describe('readPayment', () => {
    it('works the deposit back from the balance', () => {
      expect(readPayment('deposit', 300, [deduct('Balance due later', 200)]).depositAmount).toBe(100)
    })

    it('reads a deposit invoice with no balance as collecting the whole price', () => {
      expect(readPayment('deposit', 300, []).depositAmount).toBe(300)
    })

    it('reads a final deposit row and keeps its label', () => {
      const read = readPayment('final', 300, [deduct('Less: deposit paid (UA-2026-1825)', 100)])
      expect(read).toEqual(form({ depositAmount: 100, depositLabel: 'Less: deposit paid (UA-2026-1825)' }))
    })

    it('finds the security deposit whatever its case', () => {
      const read = readPayment('full', 300, [{ label: 'refundable Security Deposit ', direction: 'add', amount: 50 }])
      expect(read.securityDeposit).toBe(50)
      expect(read.extras).toEqual([])
    })

    it('keeps rows it does not recognise as charges and discounts', () => {
      expect(readPayment('full', 300, [charge, discount]).extras).toEqual([charge, discount])
    })

    it('treats a balance row on a full payment as a discount, so the amount holds', () => {
      const rows = [deduct('Balance due later', 200)]
      expect(readPayment('full', 300, rows).extras).toEqual(rows)
    })

    it('only claims the first matching row', () => {
      const rows = [deduct('Balance due later', 200), deduct('Balance due later', 10)]
      expect(readPayment('deposit', 300, rows).extras).toEqual([rows[1]])
    })
  })

  it('reads and writes back to the same amount payable', () => {
    const cases: [Parameters<typeof readPayment>[0], number, InvoiceAdjustment[]][] = [
      ['full', 300, []],
      ['full', 300, [security, charge]],
      ['deposit', 300, [deduct('Balance due later', 200), security]],
      ['deposit', 300, [discount, deduct('Balance due later', 170)]],
      ['deposit', 300, [deduct('Paid at collection', 150)]],
      ['final', 300, [deduct('Less: deposit paid (UA-1)', 100), security, charge]],
    ]
    for (const [kind, subtotal, rows] of cases) {
      const after = writePayment(kind, subtotal, readPayment(kind, subtotal, rows))
      expect(payable(subtotal, after)).toBe(payable(subtotal, rows))
    }
  })

  describe('paymentProblem', () => {
    it('never stops a full payment', () => {
      expect(paymentProblem('full', 300, form())).toBeNull()
    })

    it('needs a deposit amount on a deposit invoice', () => {
      expect(paymentProblem('deposit', 300, form())).toMatch(/enter the deposit/i)
    })

    it('accepts a deposit up to the whole price', () => {
      expect(paymentProblem('deposit', 300, form({ depositAmount: 300 }))).toBeNull()
    })

    it('refuses a deposit above the price after discounts', () => {
      expect(paymentProblem('deposit', 300, form({ depositAmount: 280, extras: [discount] }))).toMatch(/more than/)
      expect(paymentProblem('final', 300, form({ depositAmount: 301 }))).toMatch(/more than/)
    })

    it('lets a final have no deposit', () => {
      expect(paymentProblem('final', 300, form())).toBeNull()
    })
  })

  it('counts charges and discounts in the price', () => {
    expect(priceAfterExtras(300, [charge, discount])).toBe(310)
  })

  describe('depositCollected', () => {
    it('is what the deposit invoice billed', () => {
      expect(depositCollected({ amountPayable: 100, adjustments: [] })).toBe(100)
    })

    it('leaves out a refundable security deposit', () => {
      expect(depositCollected({ amountPayable: 150, adjustments: [security] })).toBe(100)
    })

    it('is zero for an invoice with no amount', () => {
      expect(depositCollected({ amountPayable: null, adjustments: [] })).toBe(0)
    })
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
