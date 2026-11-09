import { describe, expect, it } from 'vitest'
import { daysBetween, formatDate, formatDayMonth, formatMonth, todaySgt } from './dates'

describe('daysBetween', () => {
  it('counts whole calendar days', () => {
    expect(daysBetween('2026-11-03', '2026-11-09')).toBe(6)
    expect(daysBetween('2026-11-09', '2026-11-09')).toBe(0)
  })

  it('crosses months and years', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
  })
})

describe('list date formats', () => {
  it('prints day and month, and month and year', () => {
    expect(formatDayMonth('2026-11-09')).toBe('09 Nov')
    expect(formatDayMonth('')).toBe('')
    expect(formatMonth('2026-11-09')).toBe('November 2026')
  })
})

describe('todaySgt', () => {
  it('is already tomorrow in Singapore from 16:00 UTC', () => {
    expect(todaySgt(new Date('2026-12-31T15:59:00Z'))).toBe('2026-12-31')
    expect(todaySgt(new Date('2026-12-31T16:00:00Z'))).toBe('2027-01-01')
  })
})

describe('formatDate', () => {
  it('prints the calendar date as given, whatever the device time zone', () => {
    expect(formatDate('2026-04-10')).toBe('10 Apr 2026')
    expect(formatDate('')).toBe('')
  })
})
