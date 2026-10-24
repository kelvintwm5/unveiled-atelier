// The one way the app shows money on screen. (Invoices print "SGD 1,234.00"
// through fmtSGD in invoices.ts; that moves here with the invoice module.)

/** Format a number as Singapore dollars: 3800 → "S$3,800.00" */
export function formatSGD(amount: number): string {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    currencyDisplay: 'narrowSymbol',
  }).format(amount)
}
