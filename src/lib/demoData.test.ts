import { describe, expect, it } from 'vitest'
import { DEMO_INVOICES } from './demoData'
import { amountPayable, buildTotalsRows, calcSubtotal } from './invoiceTotals'

// The demo's issued invoices are typed in by hand. This keeps them honest: they
// must show what the real rules would have produced.
describe('demo invoices', () => {
  for (const inv of DEMO_INVOICES.filter(i => i.status !== 'draft')) {
    it(`${inv.invoiceNo} follows the totals rules`, () => {
      const subtotal = calcSubtotal(inv.lines)
      const rows = buildTotalsRows(inv.template, inv.kind, subtotal)
      expect(inv.subtotal).toBe(subtotal)
      expect(inv.totals).toEqual(rows)
      expect(inv.amountPayable).toBe(amountPayable(rows))
    })
  }
})
