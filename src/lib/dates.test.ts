import { describe, expect, it } from 'vitest'
import { formatDate, todaySgt } from './dates'

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
