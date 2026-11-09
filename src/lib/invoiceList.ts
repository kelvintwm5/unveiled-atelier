// What the Invoices screen shows: which invoices match a tab and a search, how they
// group by month, and how much is still to collect. No I/O, so it's easy to test.

import { formatMonth, todaySgt } from './dates'
import { toCents } from './invoiceTotals'
import type { Invoice } from '../types'

export type InvoiceFilter = 'all' | 'unpaid' | 'paid' | 'draft' | 'void'

// "All" leaves out void invoices: they stay on record under their own tab, but
// they're not what she's looking for day to day.
function inFilter(inv: Invoice, filter: InvoiceFilter): boolean {
  switch (filter) {
    case 'all':    return inv.status !== 'void'
    case 'unpaid': return inv.status === 'issued' && !inv.payment
    case 'paid':   return inv.status === 'issued' && inv.payment !== null
    case 'draft':  return inv.status === 'draft'
    case 'void':   return inv.status === 'void'
  }
}

export function filterInvoices(invoices: Invoice[], filter: InvoiceFilter, search: string): Invoice[] {
  const q = search.trim().toLowerCase()
  return invoices.filter(i => (
    inFilter(i, filter) &&
    (!q || i.clientName.toLowerCase().includes(q) || i.invoiceNo.toLowerCase().includes(q))
  ))
}

export function filterCounts(invoices: Invoice[]): Record<InvoiceFilter, number> {
  const count = (filter: InvoiceFilter) => invoices.filter(i => inFilter(i, filter)).length
  return { all: count('all'), unpaid: count('unpaid'), paid: count('paid'), draft: count('draft'), void: count('void') }
}

/** Issued invoices nobody has paid yet. Balances not yet invoiced aren't counted. */
export function toCollect(invoices: Invoice[]): { total: number; count: number } {
  const unpaid = invoices.filter(i => inFilter(i, 'unpaid'))
  return {
    total: unpaid.reduce((sum, i) => sum + toCents(i.amountPayable ?? 0), 0) / 100,
    count: unpaid.length,
  }
}

// A draft has no issue date, so it sits where it was started, in Singapore time.
function listDate(inv: Invoice): string {
  return inv.issuedOn || todaySgt(new Date(inv.createdAt))
}

/** Newest first, under month headings. */
export function byMonth(invoices: Invoice[]): { month: string; invoices: Invoice[] }[] {
  const sorted = [...invoices].sort((a, b) => (
    listDate(b).localeCompare(listDate(a)) || b.createdAt.localeCompare(a.createdAt)
  ))
  const groups: { month: string; invoices: Invoice[] }[] = []
  for (const inv of sorted) {
    const month = formatMonth(listDate(inv))
    const last = groups[groups.length - 1]
    if (last?.month === month) last.invoices.push(inv)
    else groups.push({ month, invoices: [inv] })
  }
  return groups
}
