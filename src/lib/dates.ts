// Calendar dates for a business that runs on Singapore time.
// new Date().toISOString() gives the UTC date, which is still "yesterday" in
// Singapore until 08:00, so every "today" in the app comes from here instead.

// en-CA formats as YYYY-MM-DD, the same shape as a Postgres `date` and <input type="date">.
const sgtDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Singapore',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today's date in Singapore, as YYYY-MM-DD. */
export function todaySgt(now: Date = new Date()): string {
  return sgtDate.format(now)
}

/**
 * Adds whole days to a YYYY-MM-DD date. Done in UTC on purpose: a calendar date
 * has no time zone, and UTC has no daylight saving to skip or repeat an hour.
 */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const displayDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

/** '2026-04-10' → '10 Apr 2026', as printed on invoices. '' stays ''. */
export function formatDate(date: string): string {
  return date ? displayDate.format(new Date(`${date}T00:00:00Z`)) : ''
}
