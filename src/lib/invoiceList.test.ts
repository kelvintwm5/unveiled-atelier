import { describe, expect, it } from 'vitest'
import { byMonth, filterCounts, filterInvoices, toCollect } from './invoiceList'
import type { Invoice, InvoicePayment } from '../types'

const paid = { paidOn: '2026-11-02', priceAmount: 100 } as InvoicePayment

let n = 0
function invoice(patch: Partial<Invoice>): Invoice {
  n += 1
  return {
    id: `inv-${n}`, status: 'issued', clientName: 'Sarah Lim', invoiceNo: `UA-2026-${1820 + n}`,
    issuedOn: '2026-11-01', amountPayable: 100, payment: null, createdAt: '2026-11-01T02:00:00Z',
    ...patch,
  } as Invoice
}

const unpaid = invoice({})
const settled = invoice({ payment: paid })
const draft = invoice({ status: 'draft', invoiceNo: '', issuedOn: '', amountPayable: null })
const voided = invoice({ status: 'void' })
const all = [unpaid, settled, draft, voided]

describe('filterInvoices', () => {
  it('leaves void invoices out of All', () => {
    expect(filterInvoices(all, 'all', '')).toEqual([unpaid, settled, draft])
  })

  it('splits issued invoices into unpaid and paid', () => {
    expect(filterInvoices(all, 'unpaid', '')).toEqual([unpaid])
    expect(filterInvoices(all, 'paid', '')).toEqual([settled])
  })

  it('has a tab for drafts and one for void', () => {
    expect(filterInvoices(all, 'draft', '')).toEqual([draft])
    expect(filterInvoices(all, 'void', '')).toEqual([voided])
  })

  it('searches the client name, ignoring case and spaces', () => {
    const alex = invoice({ clientName: 'Alex Tan' })
    expect(filterInvoices([unpaid, alex], 'all', '  aLEX ')).toEqual([alex])
  })

  it('searches the invoice number', () => {
    const one = invoice({ invoiceNo: 'UA-2026-1999' })
    expect(filterInvoices([unpaid, one], 'all', '1999')).toEqual([one])
  })

  it('applies the search within the tab', () => {
    expect(filterInvoices(all, 'void', 'sarah')).toEqual([voided])
    expect(filterInvoices(all, 'void', 'nobody')).toEqual([])
  })
})

describe('filterCounts', () => {
  it('counts each tab', () => {
    expect(filterCounts(all)).toEqual({ all: 3, unpaid: 1, paid: 1, draft: 1, void: 1 })
  })
})

describe('toCollect', () => {
  it('adds issued invoices that are not paid, and nothing else', () => {
    expect(toCollect(all)).toEqual({ total: 100, count: 1 })
  })

  it('adds cents exactly', () => {
    expect(toCollect([invoice({ amountPayable: 0.1 }), invoice({ amountPayable: 0.2 })]).total).toBe(0.3)
  })

  it('is zero with nothing unpaid', () => {
    expect(toCollect([settled])).toEqual({ total: 0, count: 0 })
  })
})

describe('byMonth', () => {
  it('puts the newest month first, and the newest invoice first within it', () => {
    const oct = invoice({ issuedOn: '2026-10-20' })
    const early = invoice({ issuedOn: '2026-11-03' })
    const late = invoice({ issuedOn: '2026-11-09' })
    expect(byMonth([oct, early, late])).toEqual([
      { month: 'November 2026', invoices: [late, early] },
      { month: 'October 2026', invoices: [oct] },
    ])
  })

  it('orders invoices issued on the same day by when they were made', () => {
    const first = invoice({ createdAt: '2026-11-01T01:00:00Z' })
    const second = invoice({ createdAt: '2026-11-01T05:00:00Z' })
    expect(byMonth([first, second])[0].invoices).toEqual([second, first])
  })

  it('files a draft under the Singapore date it was started', () => {
    // 20:00 UTC on 31 Oct is already 1 Nov in Singapore.
    const d = invoice({ status: 'draft', issuedOn: '', createdAt: '2026-10-31T20:00:00Z' })
    expect(byMonth([d])[0].month).toBe('November 2026')
  })
})
