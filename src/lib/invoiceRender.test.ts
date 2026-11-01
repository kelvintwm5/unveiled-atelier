import { describe, expect, it } from 'vitest'
import { renderFromDraft, renderFromIssued } from './invoiceRender'
import { DEMO_INVOICES, DEMO_INVOICE_SETTINGS } from './demoData'

const deposit = DEMO_INVOICES.find(i => i.invoiceNo === 'UA-2025-1801')!
const final   = DEMO_INVOICES.find(i => i.invoiceNo === 'UA-2025-1802')!

describe('renderFromIssued', () => {
  it('prints the frozen totals and business details, not today\'s', () => {
    const tampered = { ...final, totals: [{ label: 'Amount Payable Now', amount: 1, bold: true }] }
    const settingsNow = { ...DEMO_INVOICE_SETTINGS, paynow: 'NEW-UEN' }
    const r = renderFromIssued(tampered, DEMO_INVOICES)
    expect(r.totals).toEqual(tampered.totals)
    expect(r.business.paynow).toBe(final.business!.paynow)
    expect(r.business.paynow).not.toBe(settingsNow.paynow)
    expect(r.invoiceNo).toBe('UA-2025-1802')
    expect(r.date).toBe('2025-05-28')
    expect(r.depositInvoiceNo).toBe('UA-2025-1801')
  })

  it('refuses a draft', () => {
    const draft = DEMO_INVOICES.find(i => i.status === 'draft')!
    expect(() => renderFromIssued(draft, DEMO_INVOICES)).toThrow(/no issued record/)
  })
})

describe('renderFromDraft', () => {
  it('has no number, uses today and the current settings, and computes the totals', () => {
    const r = renderFromDraft({ ...final, kind: 'final' }, DEMO_INVOICE_SETTINGS, '2026-10-25', DEMO_INVOICES)
    expect(r.invoiceNo).toBe('')
    expect(r.date).toBe('2026-10-25')
    expect(r.business.businessName).toBe(DEMO_INVOICE_SETTINGS.businessName)
    expect(r.totals.map(t => t.amount)).toEqual([120, 120, 240])
  })

  it('names a deposit from before the app by its old number', () => {
    const r = renderFromDraft(
      { ...deposit, kind: 'final', depositInvoiceId: '', legacyDepositNo: ' UA-2026-1815 ' },
      DEMO_INVOICE_SETTINGS, '2026-10-25', DEMO_INVOICES,
    )
    expect(r.depositInvoiceNo).toBe('UA-2026-1815')
  })
})
