import { describe, expect, it } from 'vitest'
import { buildReminderDigest, dueReminders, type DigestItem } from './reminderDigest'

const TODAY = '2026-11-08'
const item = (clientName: string, remindOn: string, note = 'Call back'): DigestItem =>
  ({ clientName, remindOn, note })

describe('dueReminders', () => {
  it('keeps today and earlier, oldest first', () => {
    const due = dueReminders([item('C', TODAY), item('A', '2026-11-01'), item('Later', '2026-11-09')], TODAY)
    expect(due.map(r => r.clientName)).toEqual(['A', 'C'])
  })

  it('does not reorder the list it was given', () => {
    const input = [item('B', TODAY), item('A', '2026-11-01')]
    dueReminders(input, TODAY)
    expect(input.map(r => r.clientName)).toEqual(['B', 'A'])
  })
})

describe('buildReminderDigest', () => {
  it('returns null when nothing is due, so an empty day sends no message', () => {
    expect(buildReminderDigest([], TODAY)).toBeNull()
    expect(buildReminderDigest([item('Later', '2026-11-09')], TODAY)).toBeNull()
  })

  it('lists overdue reminders first and marks them', () => {
    const text = buildReminderDigest([item('Today', TODAY), item('Old', '2026-11-03')], TODAY)!
    expect(text.indexOf('Old')).toBeLessThan(text.indexOf('Today:'))
    expect(text).toContain('• Old: Call back (overdue since 03 Nov 2026)')
    expect(text).toContain('• Today: Call back\n')
    expect(text).toContain('(2)')
  })

  it('flattens a multi-line note onto one line', () => {
    const text = buildReminderDigest([item('A', TODAY, 'First\n\n  second')], TODAY)!
    expect(text).toContain('• A: First second')
  })

  it('shortens a very long note', () => {
    const text = buildReminderDigest([item('A', TODAY, 'x'.repeat(1000))], TODAY)!
    expect(text).toContain(`${'x'.repeat(300)}…`)
    expect(text).not.toContain('x'.repeat(301))
  })

  it('stays under the Telegram limit and says how many were left out', () => {
    const items = Array.from({ length: 100 }, (_, i) => item(`Client ${i}`, TODAY, 'y'.repeat(300)))
    const text = buildReminderDigest(items, TODAY)!
    expect(text.length).toBeLessThanOrEqual(4096)
    const shown = text.split('\n').filter(l => l.startsWith('• ')).length
    expect(shown).toBeLessThan(100)
    expect(text).toContain(`…and ${100 - shown} more.`)
  })
})
