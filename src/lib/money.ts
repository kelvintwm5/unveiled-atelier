// The one place money is formatted: formatSGD on screen, formatAmount in the
// invoice PDF's columns.

/** Format a number as Singapore dollars: 3800 → "S$3,800.00" */
export function formatSGD(amount: number): string {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    currencyDisplay: 'narrowSymbol',
  }).format(amount)
}

/** The figures printed in an invoice's amount column: 3800 → "3,800.00" */
export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-SG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
