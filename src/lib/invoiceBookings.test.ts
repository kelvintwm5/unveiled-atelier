import { describe, expect, it } from 'vitest'
import {
  clientBookings, clientInvoiceTotals, depositsAwaitingFinal, draftFinalFor, finalFromDeposit, heldDeposits,
  openDepositsFor, paymentSplit, securityHeld, securityText,
} from './invoiceBookings'
import { amountPayable, balanceLeft, buildTotalsRows, calcSubtotal } from './invoiceTotals'
import type { Client, Invoice, InvoiceAdjustment, InvoiceDraft, InvoicePayment } from '../types'

const BALANCE = 'Balance due later'
const SECURITY = 'Refundable security deposit'

let n = 0
function invoice(patch: Partial<Invoice>): Invoice {
  n += 1
  const lines = patch.lines ?? [{ title: 'Veil', description: '', quantity: 1, unitAmount: 500 }]
  const adjustments = patch.adjustments ?? []
  const status = patch.status ?? 'issued'
  const totals = status === 'draft' ? null : buildTotalsRows(calcSubtotal(lines), adjustments)
  return {
    id: `inv-${n}`, status, template: 'bespoke', kind: 'full',
    clientId: 'c1', clientName: 'Sarah Lim', clientEmail: 'old@x.sg', clientPhone: '111',
    pwsDate: '2027-01-01', weddingDate: '2027-03-01', clientNote: '', terms: '',
    depositInvoiceId: '', legacyDepositNo: '', replacesInvoiceId: '',
    invoiceNo: status === 'draft' ? '' : `UA-2026-${1820 + n}`,
    issuedOn: status === 'draft' ? '' : '2026-11-01',
    subtotal: status === 'draft' ? null : calcSubtotal(lines),
    amountPayable: totals ? amountPayable(totals) : null,
    totals, business: null, pdfPath: '', voidedAt: '', voidReason: '',
    createdAt: `2026-11-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
    payment: null,
    ...patch,
    lines,
    adjustments,
  }
}

const row = (label: string, direction: InvoiceAdjustment['direction'], amount: number): InvoiceAdjustment => (
  { label, direction, amount }
)
const deposit = (patch: Partial<Invoice> = {}) => invoice({
  kind: 'deposit', adjustments: [row(BALANCE, 'deduct', 300)], ...patch,
})

const blank: InvoiceDraft = {
  template: 'rental', kind: 'full', clientId: '', clientName: '', clientEmail: '', clientPhone: '',
  pwsDate: '', weddingDate: '', clientNote: '', terms: '', depositInvoiceId: '', legacyDepositNo: '',
  replacesInvoiceId: '', lines: [], adjustments: [],
}

const payableOf = (d: InvoiceDraft) => amountPayable(buildTotalsRows(calcSubtotal(d.lines), d.adjustments))

const paid = (patch: Partial<InvoicePayment> = {}): InvoicePayment => ({
  paidOn: '2026-11-02', method: 'PayNow', priceAmount: 200, securityAmount: 0, securitySettledOn: '',
  securityKept: 0, securityNote: '', bookingClosedOn: '', bookingClosedReason: '', ...patch,
})

describe('balanceLeft', () => {
  it('is the balance row on a deposit', () => {
    expect(balanceLeft(deposit())).toBe(300)
  })

  it('is 0 when the deposit took the whole price', () => {
    expect(balanceLeft(deposit({ adjustments: [] }))).toBe(0)
  })

  it('works out an invoice from before payment rows from its frozen totals', () => {
    expect(balanceLeft(deposit({
      adjustments: [], subtotal: 1000, amountPayable: 500,
      totals: [{ label: 'Amount Payable Now', amount: 500, bold: true }],
    }))).toBe(500)
  })
})

describe('depositsAwaitingFinal', () => {
  it('offers an issued deposit with a balance', () => {
    const d = deposit()
    expect(depositsAwaitingFinal([d])).toEqual([d])
  })

  it('does not offer a deposit that took the whole price', () => {
    expect(depositsAwaitingFinal([deposit({ adjustments: [] })])).toEqual([])
  })

  it('does not offer a deposit once its final is issued', () => {
    const d = deposit()
    expect(depositsAwaitingFinal([d, invoice({ kind: 'final', depositInvoiceId: d.id })])).toEqual([])
  })

  it('offers it again if that final is voided', () => {
    const d = deposit()
    expect(depositsAwaitingFinal([d, invoice({ kind: 'final', depositInvoiceId: d.id, status: 'void' })])).toEqual([d])
  })

  it('does not offer a closed booking', () => {
    expect(depositsAwaitingFinal([deposit({ payment: paid({ bookingClosedOn: '2026-11-03' }) })])).toEqual([])
  })

  it('still offers a paid deposit that is not closed', () => {
    const d = deposit({ payment: paid() })
    expect(depositsAwaitingFinal([d])).toEqual([d])
  })

  it('does not offer a voided deposit, only its replacement', () => {
    const old = deposit({ status: 'void' })
    const replacement = deposit({ replacesInvoiceId: old.id })
    expect(depositsAwaitingFinal([old, replacement])).toEqual([replacement])
  })
})

describe('openDepositsFor', () => {
  it('only returns that client, matched by id so two Sarahs stay apart', () => {
    const mine = deposit()
    const theirs = deposit({ clientId: 'c2' })
    expect(openDepositsFor([mine, theirs], 'c1')).toEqual([mine])
  })

  it('returns each booking separately', () => {
    const a = deposit()
    const b = deposit()
    expect(openDepositsFor([a, b], 'c1')).toEqual([a, b])
  })

  it('finds nothing for an invoice with no client', () => {
    expect(openDepositsFor([deposit({ clientId: '' })], '')).toEqual([])
  })
})

describe('draftFinalFor', () => {
  it('finds an unfinished final, but not the one being edited', () => {
    const d = deposit()
    const draft = invoice({ status: 'draft', kind: 'final', depositInvoiceId: d.id })
    expect(draftFinalFor([d, draft], d.id)).toBe(draft)
    expect(draftFinalFor([d, draft], d.id, draft.id)).toBeUndefined()
  })
})

describe('finalFromDeposit', () => {
  it('$500 veil, $200 deposit: $300 left to collect', () => {
    const d = invoice({ kind: 'deposit', amountPayable: 200, adjustments: [row(BALANCE, 'deduct', 300)] })
    expect(payableOf(finalFromDeposit(blank, d))).toBe(300)
  })

  it('carries charges and discounts over, so the balance matches the deposit invoice', () => {
    const d = deposit({ adjustments: [row('Friends discount', 'deduct', 30), row(BALANCE, 'deduct', 370)] })
    expect(d.amountPayable).toBe(100)
    const final = finalFromDeposit(blank, d)
    expect(final.adjustments[0]).toEqual(row('Friends discount', 'deduct', 30))
    expect(payableOf(final)).toBe(370)
  })

  it('does not count or re-collect a security deposit taken on the deposit invoice', () => {
    const d = deposit({ adjustments: [row(BALANCE, 'deduct', 300), row(SECURITY, 'add', 50)] })
    expect(d.amountPayable).toBe(250)
    const final = finalFromDeposit(blank, d)
    expect(final.adjustments.some(a => a.label === SECURITY)).toBe(false)
    expect(payableOf(final)).toBe(300)
  })

  it('uses the client’s current details when given', () => {
    const client: Client = {
      id: 'c1', name: 'Sarah Tan', email: 'new@x.sg', phone: '222', weddingDate: '2027-05-05',
      veilType: 'TBD', budget: 0, stage: 'Confirmed', notes: '', activityNotes: '',
    }
    expect(finalFromDeposit(blank, deposit(), client)).toMatchObject({
      clientName: 'Sarah Tan', clientEmail: 'new@x.sg', clientPhone: '222', weddingDate: '2027-05-05',
    })
  })

  it('falls back to the deposit’s details without a client', () => {
    expect(finalFromDeposit(blank, deposit())).toMatchObject({ clientEmail: 'old@x.sg', weddingDate: '2027-03-01' })
  })

  it('keeps the deposit’s wedding date if the client has none', () => {
    const client = {
      id: 'c1', name: 'S', email: '', phone: '', weddingDate: '', veilType: 'TBD', budget: 0,
      stage: 'Confirmed', notes: '', activityNotes: '',
    } as Client
    expect(finalFromDeposit(blank, deposit(), client).weddingDate).toBe('2027-03-01')
  })
})

describe('clientBookings', () => {
  it('puts a deposit and its final in one booking, oldest first', () => {
    const d = deposit()
    const f = invoice({ kind: 'final', depositInvoiceId: d.id })
    const [b, ...rest] = clientBookings([f, d], 'c1')
    expect(rest).toEqual([])
    expect(b.active.map(i => i.id)).toEqual([d.id, f.id])
    expect(b.openDeposit).toBeNull()
  })

  it('joins a voided deposit, its replacement and the final', () => {
    const old = deposit({ status: 'void' })
    const replacement = deposit({ replacesInvoiceId: old.id })
    const f = invoice({ kind: 'final', depositInvoiceId: replacement.id })
    const [b, ...rest] = clientBookings([old, replacement, f], 'c1')
    expect(rest).toEqual([])
    expect(b.voided).toEqual([old])
    expect(b.active).toEqual([replacement, f])
  })

  it('keeps two bookings for one client apart, newest first', () => {
    const first = deposit({ createdAt: '2026-01-01T00:00:00Z' })
    const second = deposit({ createdAt: '2026-06-01T00:00:00Z' })
    expect(clientBookings([first, second], 'c1').map(b => b.active[0])).toEqual([second, first])
  })

  it('reports an open deposit and any final already started', () => {
    const d = deposit()
    const draft = invoice({ status: 'draft', kind: 'final', depositInvoiceId: d.id })
    const [b] = clientBookings([d, draft], 'c1')
    expect(b.openDeposit).toBe(d)
    expect(b.draftFinal).toBe(draft)
  })

  it('titles a booking after the service on its latest invoice', () => {
    const lines = [{ title: 'Cathedral veil', description: '', quantity: 1, unitAmount: 500 }]
    expect(clientBookings([deposit({ lines })], 'c1')[0].title).toBe('Cathedral veil')
  })

  it('leaves out other clients', () => {
    expect(clientBookings([deposit({ clientId: 'c2' })], 'c1')).toEqual([])
  })
})

describe('paymentSplit', () => {
  it('is all price with no security deposit', () => {
    expect(paymentSplit(invoice({}))).toEqual({ price: 500, security: 0 })
  })

  it('separates a security deposit from the price', () => {
    const d = deposit({ adjustments: [row(BALANCE, 'deduct', 300), row(SECURITY, 'add', 50)] })
    expect(paymentSplit(d)).toEqual({ price: 200, security: 50 })
  })

  it('splits cents exactly', () => {
    const inv = invoice({
      lines: [{ title: 'Veil', description: '', quantity: 1, unitAmount: 0.3 }],
      adjustments: [row(SECURITY, 'add', 0.1)],
    })
    expect(paymentSplit(inv)).toEqual({ price: 0.3, security: 0.1 })
  })
})

describe('security deposits', () => {
  it('is held until it is settled', () => {
    expect(securityHeld(paid({ securityAmount: 120 }))).toBe(120)
    expect(securityHeld(paid({ securityAmount: 120, securitySettledOn: '2026-11-05' }))).toBe(0)
  })

  it('is nothing with no payment or no deposit', () => {
    expect(securityHeld(null)).toBe(0)
    expect(securityHeld(paid())).toBe(0)
  })

  it('says what became of it', () => {
    const on = { securityAmount: 120, securitySettledOn: '2026-11-05' }
    expect(securityText(paid())).toBeNull()
    expect(securityText(paid({ securityAmount: 120 }))).toContain('$120.00 held')
    expect(securityText(paid({ ...on, securityKept: 0 }))).toContain('$120.00 returned')
    expect(securityText(paid({ ...on, securityKept: 120 }))).toContain('$120.00 kept')
    expect(securityText(paid({ ...on, securityKept: 40 }))).toContain('$40.00 kept, $80.00 returned')
  })

  it('totals what is held across clients', () => {
    expect(heldDeposits([
      invoice({ clientId: 'c1', payment: paid({ securityAmount: 100 }) }),
      invoice({ clientId: 'c1', payment: paid({ securityAmount: 20 }) }),
      invoice({ clientId: 'c2', payment: paid({ securityAmount: 50 }) }),
      invoice({ clientId: 'c3', payment: paid({ securityAmount: 90, securitySettledOn: '2026-11-05' }) }),
      invoice({ clientId: 'c4' }),
    ])).toEqual({ total: 170, clients: 2 })
  })

  it('counts invoices with no client separately', () => {
    expect(heldDeposits([
      invoice({ clientId: '', payment: paid({ securityAmount: 10 }) }),
      invoice({ clientId: '', payment: paid({ securityAmount: 10 }) }),
    ]).clients).toBe(2)
  })
})

describe('clientInvoiceTotals', () => {
  it('counts unpaid invoices and balances not yet invoiced as to collect', () => {
    // $200 deposit and $500 full payment, both unpaid, plus a $300 balance.
    expect(clientInvoiceTotals([deposit(), invoice({})], 'c1')).toEqual({
      invoiced: 700, received: 0, toCollect: 1000, securityHeld: 0,
    })
  })

  it('moves a paid invoice from to collect to received', () => {
    expect(clientInvoiceTotals([deposit({ payment: paid() })], 'c1')).toEqual({
      invoiced: 200, received: 200, toCollect: 300, securityHeld: 0,
    })
  })

  it('counts a security deposit as received and shows it as held', () => {
    const d = deposit({
      adjustments: [row(BALANCE, 'deduct', 300), row(SECURITY, 'add', 50)],
      payment: paid({ securityAmount: 50 }),
    })
    expect(clientInvoiceTotals([d], 'c1')).toEqual({ invoiced: 250, received: 250, toCollect: 300, securityHeld: 50 })
  })

  it('leaves out void invoices and drafts', () => {
    expect(clientInvoiceTotals([
      deposit({ status: 'void' }),
      invoice({ status: 'draft' }),
    ], 'c1')).toEqual({ invoiced: 0, received: 0, toCollect: 0, securityHeld: 0 })
  })

  it('stops counting the balance once the final is issued', () => {
    const d = deposit({ payment: paid() })
    const f = invoice({ kind: 'final', depositInvoiceId: d.id, adjustments: [row('Less: deposit paid', 'deduct', 200)] })
    expect(clientInvoiceTotals([d, f], 'c1')).toEqual({ invoiced: 500, received: 200, toCollect: 300, securityHeld: 0 })
  })

  it('collects nothing more on a closed booking', () => {
    const d = deposit({ payment: paid({ bookingClosedOn: '2026-11-03' }) })
    expect(clientInvoiceTotals([d], 'c1').toCollect).toBe(0)
  })

  it('adds cents exactly', () => {
    const a = invoice({ lines: [{ title: 'A', description: '', quantity: 1, unitAmount: 0.1 }] })
    const b = invoice({ lines: [{ title: 'B', description: '', quantity: 1, unitAmount: 0.2 }] })
    expect(clientInvoiceTotals([a, b], 'c1').invoiced).toBe(0.3)
  })
})
