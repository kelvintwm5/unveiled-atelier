import { describe, expect, it } from 'vitest'
import { DEMO_INVOICES } from './demoData'
import { paymentSplit } from './invoiceBookings'
import { amountPayable, buildTotalsRows, calcSubtotal } from './invoiceTotals'

// The demo's issued invoices are typed in by hand. This keeps them honest: they
// must show what the real rules would have produced.
describe('demo invoices', () => {
  for (const inv of DEMO_INVOICES.filter(i => i.status !== 'draft')) {
    it(`${inv.invoiceNo} follows the totals rules`, () => {
      const subtotal = calcSubtotal(inv.lines)
      const rows = buildTotalsRows(subtotal, inv.adjustments)
      expect(inv.subtotal).toBe(subtotal)
      expect(inv.totals).toEqual(rows)
      expect(inv.amountPayable).toBe(amountPayable(rows))
      if (inv.payment) {
        const { price, security } = paymentSplit(inv)
        expect(inv.payment.priceAmount).toBe(price)
        expect(inv.payment.securityAmount).toBe(security)
      }
    })
  }
})
