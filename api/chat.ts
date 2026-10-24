import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
// The .js extension is required: this function runs as a Node ES module, which
// doesn't guess extensions. TypeScript maps it to demoData.ts.
import {
  DEMO_ACTIVITIES, DEMO_CLIENTS, DEMO_MONTHLY, DEMO_PNL_TOTAL, DEMO_PNL_YEAR, DEMO_TRANSACTIONS,
} from '../src/lib/demoData.js'
import { clientChatContext, type ChatActivity, type ChatClient } from '../src/lib/clientChatContext.js'
import {
  financeChatContext, type ChatMonth, type ChatTransaction, type ChatYear,
} from '../src/lib/financeChatContext.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MODEL = 'claude-sonnet-4-6'

// Demo visitors aren't signed in, so these caps are what bounds the cost of a
// demo request, whoever sends it. Owners get more room.
const LIMITS = {
  demo:  { messageChars: 500, historyTurns: 10, turnChars: 2000, maxTokens: 512 },
  owner: { messageChars: 4000, historyTurns: 20, turnChars: 8000, maxTokens: 1024 },
}

// The same values the browser uses. Both are public by design; what protects the
// data is RLS, which sees the caller's own JWT below. No service_role key needed.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

// Only what a question about the numbers needs; both the browser (live data) and
// the demo branch below shape it with financeChatContext().
const DEMO_FINANCE_CONTEXT = financeChatContext(DEMO_TRANSACTIONS, [
  { year: DEMO_PNL_YEAR, months: DEMO_MONTHLY, total: DEMO_PNL_TOTAL },
])

// No email, phone or ids, and activities name their client: both the browser
// (live data) and the demo branch below shape them with clientChatContext().
type ClientRecord = ChatClient
type ActivityRecord = ChatActivity

const DEMO_CLIENT_CONTEXT = clientChatContext(DEMO_CLIENTS, DEMO_ACTIVITIES)

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function buildFinanceSystemPrompt(transactions: ChatTransaction[], monthly: ChatMonth[], years: ChatYear[]): string {
  const txLines = transactions.map(tx =>
    `${tx.date} | ${tx.type.padEnd(7)} | S$${String(tx.amount).padStart(6)} | ${tx.category} | ${tx.description}${tx.clientName ? ` (${tx.clientName})` : ''}`
  ).join('\n')

  const monthLines = monthly.map(m =>
    `${m.month.padEnd(14)} | Income S$${m.income.toLocaleString().padStart(6)} | Expenses S$${m.expenses.toLocaleString().padStart(6)} | Net S$${m.netProfit.toLocaleString()}`
  ).join('\n')

  const yearLines = years.map(y =>
    `${y.year} | Income S$${y.income.toLocaleString()} | Expenses S$${y.expenses.toLocaleString()} | Net S$${y.netProfit.toLocaleString()}`
  ).join('\n')

  return `You are a friendly financial assistant for Unveiled Atelier, a bridal boutique in Singapore run by a sole proprietor who files taxes with IRAS.

Answer questions about the business finances clearly and conversationally. Use Singapore dollar formatting (S$). Keep responses concise — a few sentences unless a detailed breakdown is needed. If asked something outside the financial data provided, say so honestly. The monthly and yearly totals below are exact; quote them rather than adding up transactions yourself.

## Transactions
${txLines || 'No transactions loaded.'}

## Monthly Summary (months with activity)
${monthLines || 'No monthly data loaded.'}

## Yearly Totals
${yearLines || 'No yearly data loaded.'}`
}

function buildClientSystemPrompt(clients: ClientRecord[], activities: ActivityRecord[]): string {
  const clientLines = clients.map(c =>
    `${c.name} | Stage: ${c.stage} | ${c.veilType} | Wedding: ${c.weddingDate || 'TBD'} | Budget: S$${c.budget}${c.notes ? ` | Notes: ${c.notes}` : ''}`
  ).join('\n')

  const activityLines = activities
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30)
    .map(a =>
      `${a.date} | ${a.clientName} | ${a.type} | ${a.notes}${a.nextFollowUp ? ` → Follow up: ${a.nextFollowUp}` : ''}`
    ).join('\n')

  return `You are a client relationship assistant for Unveiled Atelier, a bridal boutique in Singapore. Help Esther manage her veil clients — tracking pipeline stages, planning follow-ups, and nurturing leads.

Answer questions conversationally and keep responses concise. You can also draft WhatsApp or email messages when asked. Pipeline stages in order: Inquiry → Consultation → Fitting → Confirmed → Completed (or Lost).

## Client Pipeline
${clientLines || 'No clients loaded.'}

## Activity Log (most recent first)
${activityLines || 'No activity recorded.'}`
}

function bearerToken(header: string | undefined): string | null {
  const match = header?.match(/^Bearer (.+)$/)
  return match ? match[1] : null
}

/**
 * Asks Supabase, as the caller, whether they're in app_owners. PostgREST verifies
 * the JWT's signature and expiry before running is_app_owner(), so a forged or
 * stale token fails here with a 401. Returns null when the caller is an owner.
 */
async function checkOwner(token: string): Promise<{ status: number; error: string } | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { status: 503, error: 'Chat is not configured — add the Supabase URL and anon key to the Vercel environment variables.' }
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error, status } = await supabase.rpc('is_app_owner')
  if (status === 401) return { status: 401, error: 'Your session has expired. Sign out and sign in again.' }
  if (error) return { status: 502, error: `Couldn't check your access: ${error.message}` }
  if (data !== true) return { status: 403, error: "This account isn't set up as an owner of Unveiled Atelier." }
  return null
}

/** Keeps only well-formed turns, the most recent `maxTurns`, starting on a user turn. */
function parseHistory(value: unknown, maxTurns: number): ChatMessage[] {
  if (!Array.isArray(value)) return []
  const turns = value.filter((m): m is ChatMessage =>
    m !== null && typeof m === 'object'
    && (m.role === 'user' || m.role === 'assistant')
    && typeof m.content === 'string')
  const recent = turns.slice(-maxTurns).map(m => ({ role: m.role, content: m.content }))
  // Claude expects the conversation to open with the user.
  while (recent.length > 0 && recent[0].role !== 'user') recent.shift()
  return recent
}

// Owner context comes from our own signed-in browser and only shapes the prompt,
// so a shape check is enough.
function arrayOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'Chat is not configured — add ANTHROPIC_API_KEY to your Vercel environment variables.',
    })
  }

  // Everything below trusts nothing about the body until it has been checked.
  const body: Record<string, unknown> = req.body && typeof req.body === 'object' ? req.body : {}

  // A request with a token claims to be the owner and must prove it. One without
  // is a demo visitor and gets demo data and demo limits, whatever it sends.
  const token = bearerToken(req.headers.authorization)
  const isOwner = token !== null
  if (isOwner) {
    const denied = await checkOwner(token)
    if (denied) return res.status(denied.status).json({ error: denied.error })
  }
  const limits = isOwner ? LIMITS.owner : LIMITS.demo

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) {
    return res.status(400).json({ error: 'Message is required.' })
  }
  if (message.length > limits.messageChars) {
    return res.status(400).json({ error: `Please keep messages under ${limits.messageChars} characters.` })
  }

  const history = parseHistory(body.history, limits.historyTurns)
  if (history.some(m => m.content.length > limits.turnChars)) {
    return res.status(400).json({ error: 'The conversation is too long. Reload the page to start a new one.' })
  }

  const chatMode = body.chatMode === 'clients' ? 'clients' : 'finance'
  const systemPrompt = chatMode === 'clients'
    ? isOwner
      ? buildClientSystemPrompt(arrayOf<ClientRecord>(body.clients), arrayOf<ActivityRecord>(body.activities))
      : buildClientSystemPrompt(DEMO_CLIENT_CONTEXT.clients, DEMO_CLIENT_CONTEXT.activities)
    : isOwner
      ? buildFinanceSystemPrompt(
          arrayOf<ChatTransaction>(body.transactions), arrayOf<ChatMonth>(body.months), arrayOf<ChatYear>(body.years))
      : buildFinanceSystemPrompt(
          DEMO_FINANCE_CONTEXT.transactions, DEMO_FINANCE_CONTEXT.months, DEMO_FINANCE_CONTEXT.years)

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: limits.maxTokens,
      system: systemPrompt,
      messages: [...history, { role: 'user', content: message }],
    })

    const reply = response.content[0].type === 'text' ? response.content[0].text : ''
    res.json({ reply })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: `Claude API error: ${message}` })
  }
}
