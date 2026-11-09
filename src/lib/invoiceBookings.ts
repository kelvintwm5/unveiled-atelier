// How invoices fit together: which ones belong to the same booking, and what's
// still to be billed. No I/O, so it's easy to test and works the same in demo mode.
//
// Everything here is read from the invoices as they stand, rather than copied onto
// the client. Voiding or reissuing an invoice then needs no clean-up anywhere else.

import { adjustmentsForReissue, balanceLeft, calcSubtotal, depositCollected, readPayment, toCents } from './invoiceTotals'
import { formatSGD } from './money'
import type { Client, Invoice, InvoiceDraft, InvoicePayment } from '../types'

/**
 * Issued deposits with money still to bill and no issued final. A deposit that
 * took the whole price has nothing left, so a final for it would be for $0, and a
 * closed booking won't have a final at all.
 */
export function depositsAwaitingFinal(invoices: Invoice[]): Invoice[] {
  const haveFinal = new Set(
    invoices.filter(i => i.kind === 'final' && i.status === 'issued').map(i => i.depositInvoiceId),
  )
  return invoices.filter(i => (
    i.kind === 'deposit' && i.status === 'issued' && !haveFinal.has(i.id) &&
    balanceLeft(i) > 0 && !i.payment?.bookingClosedOn
  ))
}

/**
 * How a payment on this invoice will divide up. This is the preview: the database
 * works the split out again itself when the payment is recorded.
 */
export function paymentSplit(inv: Invoice): { price: number; security: number } {
  const price = depositCollected(inv)
  return { price, security: (toCents(inv.amountPayable ?? 0) - toCents(price)) / 100 }
}

/** What's still being held for the client on this payment. */
export function securityHeld(payment: InvoicePayment | null): number {
  return payment && payment.securityAmount > 0 && !payment.securitySettledOn ? payment.securityAmount : 0
}

/** One line on what became of a security deposit, or null if there wasn't one. */
export function securityText(p: InvoicePayment): string | null {
  if (p.securityAmount <= 0) return null
  const amount = formatSGD(p.securityAmount)
  if (!p.securitySettledOn) return `Security deposit: ${amount} held`
  if (p.securityKept <= 0) return `Security deposit: ${amount} returned`
  if (toCents(p.securityKept) === toCents(p.securityAmount)) return `Security deposit: ${amount} kept`
  const returned = (toCents(p.securityAmount) - toCents(p.securityKept)) / 100
  return `Security deposit: ${formatSGD(p.securityKept)} kept, ${formatSGD(returned)} returned`
}

/**
 * All the security deposits Esther is holding. Her bank balance includes this money,
 * but it isn't hers. Invoices without a linked client each count as one client.
 */
export function heldDeposits(invoices: Invoice[]): { total: number; clients: number } {
  const holding = invoices.filter(i => securityHeld(i.payment) > 0)
  return {
    total: holding.reduce((sum, i) => sum + toCents(securityHeld(i.payment)), 0) / 100,
    clients: new Set(holding.map(i => i.clientId || i.id)).size,
  }
}

/**
 * One client's open deposits, one entry each. Never added together: a client with
 * two bookings owes each balance separately, and only Esther knows which one this
 * final is for.
 */
export function openDepositsFor(invoices: Invoice[], clientId: string): Invoice[] {
  return clientId ? depositsAwaitingFinal(invoices).filter(i => i.clientId === clientId) : []
}

/** An unfinished final for this deposit, other than the draft being edited. */
export function draftFinalFor(invoices: Invoice[], depositId: string, exceptId?: string | null): Invoice | undefined {
  return invoices.find(i => (
    i.status === 'draft' && i.kind === 'final' && i.depositInvoiceId === depositId && i.id !== exceptId
  ))
}

/**
 * A final invoice that collects the rest of a deposit invoice. Pass the client when
 * they're still in the tracker: a phone number or wedding date may have changed
 * since the deposit, and the final should print the current one.
 *
 * Charges and discounts carry over, because the balance was worked out after them.
 * A refundable security deposit doesn't: it was collected once already.
 */
export function finalFromDeposit(current: InvoiceDraft, deposit: Invoice, client?: Client): InvoiceDraft {
  const { extras } = readPayment('deposit', calcSubtotal(deposit.lines), adjustmentsForReissue(deposit))
  return {
    ...current,
    template:         deposit.template,
    kind:             'final',
    clientId:         deposit.clientId,
    clientName:       client?.name ?? deposit.clientName,
    clientEmail:      client?.email ?? deposit.clientEmail,
    clientPhone:      client?.phone ?? deposit.clientPhone,
    pwsDate:          deposit.pwsDate,
    weddingDate:      client?.weddingDate || deposit.weddingDate,
    depositInvoiceId: deposit.id,
    legacyDepositNo:  '',
    lines:            deposit.lines.map(l => ({ ...l })),
    adjustments: [
      ...extras,
      {
        label:     `Less: deposit paid (${deposit.invoiceNo})`,
        direction: 'deduct',
        amount:    depositCollected(deposit),
      },
    ],
  }
}

/** A deposit, its final, and anything voided or replaced along the way. */
export interface Booking {
  id: string
  title: string                 // the first service on the latest invoice
  active: Invoice[]             // oldest first: issued and draft
  voided: Invoice[]
  openDeposit: Invoice | null   // the deposit still waiting for its final
  draftFinal: Invoice | null    // set when that final has already been started
}

const byCreated = (a: Invoice, b: Invoice) => a.createdAt.localeCompare(b.createdAt)

/** A client's invoices grouped by booking, newest booking first. */
export function clientBookings(invoices: Invoice[], clientId: string): Booking[] {
  const mine = invoices.filter(i => i.clientId === clientId)
  const open = new Set(openDepositsFor(invoices, clientId))

  // Invoices are one booking if a link joins them, however many steps apart: a
  // final can point at a replacement that points at a voided deposit.
  const parent = new Map(mine.map(i => [i.id, i.id]))
  const root = (id: string): string => {
    let at = id
    while (parent.get(at) !== at) at = parent.get(at) as string
    return at
  }
  const join = (a: string, b: string) => {
    if (parent.has(a) && parent.has(b)) parent.set(root(a), root(b))
  }
  for (const i of mine) {
    join(i.id, i.depositInvoiceId)
    join(i.id, i.replacesInvoiceId)
  }

  const groups = new Map<string, Invoice[]>()
  for (const i of mine) {
    const key = root(i.id)
    groups.set(key, [...(groups.get(key) ?? []), i])
  }

  return [...groups.entries()]
    .map(([id, group]) => {
      const all    = [...group].sort(byCreated)
      const active = all.filter(i => i.status !== 'void')
      const latest = active[active.length - 1] ?? all[all.length - 1]
      const openDeposit = active.find(i => open.has(i)) ?? null
      return {
        id,
        title: latest.lines[0]?.title.trim() || 'Booking',
        active,
        voided: all.filter(i => i.status === 'void'),
        openDeposit,
        draftFinal: openDeposit ? draftFinalFor(invoices, openDeposit.id) ?? null : null,
        latestAt: all[all.length - 1].createdAt,
      }
    })
    .sort((a, b) => b.latestAt.localeCompare(a.latestAt))
    .map(({ latestAt: _latestAt, ...booking }) => booking)
}

export interface ClientMoney {
  invoiced: number       // issued invoices, security deposits included
  received: number       // what she's been paid, security deposits included
  toCollect: number      // issued but unpaid, plus balances not yet invoiced
  securityHeld: number   // the part of received that's still the client's
}

/** What the profile's summary shows. */
export function clientInvoiceTotals(invoices: Invoice[], clientId: string): ClientMoney {
  const issued = invoices.filter(i => i.clientId === clientId && i.status === 'issued')
  const total  = (list: Invoice[], cents: (i: Invoice) => number) => list.reduce((sum, i) => sum + cents(i), 0) / 100
  const paid   = issued.filter(i => i.payment)
  const unpaid = issued.filter(i => !i.payment)

  return {
    invoiced:     total(issued, i => toCents(i.amountPayable ?? 0)),
    received:     total(paid, i => toCents(i.payment?.priceAmount ?? 0) + toCents(i.payment?.securityAmount ?? 0)),
    toCollect:    (toCents(total(unpaid, i => toCents(i.amountPayable ?? 0))) +
                   toCents(total(openDepositsFor(invoices, clientId), i => toCents(balanceLeft(i))))) / 100,
    securityHeld: total(paid, i => toCents(securityHeld(i.payment))),
  }
}
