// Which reminders are due, and the morning message that lists them. Pure and
// free of Vite-only imports: the views and api/send-reminders.ts both use it, so
// the app and the message can't disagree about what counts as due.

// The .js extension is required for the serverless function (see api/chat.ts).
import { formatDate } from './dates.js'

export interface DigestItem {
  clientName: string
  remindOn: string   // YYYY-MM-DD
  note: string
}

// Telegram rejects a message over 4,096 characters. Stopping short leaves room
// for the closing lines without having to count them exactly.
const MAX_MESSAGE_CHARS = 3900
const MAX_NOTE_CHARS = 300

/** Reminders dated today or earlier, oldest first. */
export function dueReminders<T extends { remindOn: string }>(reminders: T[], today: string): T[] {
  return reminders
    .filter(r => r.remindOn <= today)
    .sort((a, b) => a.remindOn.localeCompare(b.remindOn))
}

function digestLine(item: DigestItem, today: string): string {
  const flat = item.note.replace(/\s+/g, ' ').trim()
  const note = flat.length > MAX_NOTE_CHARS ? `${flat.slice(0, MAX_NOTE_CHARS)}…` : flat
  const overdue = item.remindOn < today ? ` (overdue since ${formatDate(item.remindOn)})` : ''
  return `• ${item.clientName}: ${note}${overdue}`
}

/** The message text, or null when nothing is due, so an empty day sends nothing. */
export function buildReminderDigest(items: DigestItem[], today: string): string | null {
  const due = dueReminders(items, today)
  if (due.length === 0) return null

  const header = `Unveiled Atelier follow-ups for ${formatDate(today)} (${due.length})`
  const lines: string[] = []
  let chars = header.length
  for (const item of due) {
    const line = digestLine(item, today)
    if (chars + line.length + 1 > MAX_MESSAGE_CHARS) break
    lines.push(line)
    chars += line.length + 1
  }

  const hidden = due.length - lines.length
  const footer = hidden > 0
    ? `…and ${hidden} more. Open the app to see them all.`
    : 'Mark each one Done in the client\'s profile to stop it repeating.'
  return [header, '', ...lines, '', footer].join('\n')
}
