import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient } from '@supabase/supabase-js'
// The .js extensions are required: see the note in api/chat.ts.
import { todaySgt } from '../src/lib/dates.js'
import { buildReminderDigest, type DigestItem } from '../src/lib/reminderDigest.js'

// The morning follow-up message. Vercel Cron calls this once a day (vercel.json);
// the message is built from a plain date query, with no AI involved, because a
// reminder has to be exact and arrive every time.

type ApiResponse = ServerResponse & {
  status(code: number): ApiResponse
  json(body: unknown): ApiResponse
}

interface ReminderRow {
  remind_on: string
  note: string
  clients: { name: string }
}

export default async function handler(req: IncomingMessage, res: ApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Vercel sends this header on cron calls when CRON_SECRET is set. An unset
  // secret must refuse everything, or "Bearer undefined" would open the endpoint.
  const secret = process.env.CRON_SECRET
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET is not set.' })
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!supabaseUrl || !serviceKey || !botToken || !chatId) {
    return res.status(503).json({ error: 'Reminder delivery is not configured. Check the Vercel environment variables.' })
  }

  // service_role bypasses RLS, and it has to here: nobody is signed in at 9am, so
  // the owner policies would return nothing. This is its only use in the app.
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const today = todaySgt()
  const { data, error } = await supabase
    .from('client_reminders')
    .select('remind_on, note, clients!inner(name, archived_at)')
    .is('done_at', null)
    .is('clients.archived_at', null)
    .lte('remind_on', today)
    .order('remind_on')
  if (error) return res.status(502).json({ error: `Couldn't load reminders: ${error.message}` })

  // Name and note only: this text passes through Telegram, so the client's email
  // and phone stay out of it.
  const items: DigestItem[] = (data as unknown as ReminderRow[]).map(r => ({
    clientName: r.clients.name,
    remindOn: r.remind_on,
    note: r.note,
  }))

  const text = buildReminderDigest(items, today)
  if (text === null) return res.json({ sent: 0 })

  // Plain text on purpose (no parse_mode): with Markdown on, a stray * or _ in a
  // client's note makes Telegram reject the whole message.
  let telegram: Response
  try {
    telegram = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
  } catch {
    // Not the caught error's text: anything mentioning the URL would carry the token.
    return res.status(502).json({ error: 'Could not reach Telegram.' })
  }
  if (!telegram.ok) {
    return res.status(502).json({ error: `Telegram refused the message (HTTP ${telegram.status}).` })
  }

  return res.json({ sent: items.length })
}
