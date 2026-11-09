// How invoices fit together: which ones belong to the same booking, and what's
// still to be billed. No I/O, so it's easy to test and works the same in demo mode.
//
// Everything here is read from the invoices as they stand, rather than copied onto
// the client. Voiding or reissuing an invoice then needs no clean-up anywhere else.

import { adjustmentsForReissue, balanceLeft, calcSubtotal, depositCollected, readPayment, toCents } from './invoiceTotals'
import type { Client, Invoice, InvoiceDraft } from '../types'

/**
 * Issued deposits with money still to bill and no issued final. A deposit that
 * took the whole price has nothing left, so a final for it would be for $0.
 */
export function depositsAwaitingFinal(invoices: Invoice[]): Invoice[] {
  const haveFinal = new Set(
    invoices.filter(i => i.kind === 'final' && i.status === 'issued').map(i => i.depositInvoiceId),
  )
  return invoices.filter(i => (
    i.kind === 'deposit' && i.status === 'issued' && !haveFinal.has(i.id) && balanceLeft(i) > 0
  ))
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

/**
 * What the profile's summary shows. This is what was billed, not what was paid:
 * the app doesn't record payments yet.
 */
export function clientInvoiceTotals(invoices: Invoice[], clientId: string): { invoiced: number; stillToInvoice: number } {
  const invoiced = invoices
    .filter(i => i.clientId === clientId && i.status === 'issued')
    .reduce((sum, i) => sum + toCents(i.amountPayable ?? 0), 0)
  const stillToInvoice = openDepositsFor(invoices, clientId)
    .reduce((sum, i) => sum + toCents(balanceLeft(i)), 0)
  return { invoiced: invoiced / 100, stillToInvoice: stillToInvoice / 100 }
}
