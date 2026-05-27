import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface Transaction {
  date: string; type: string; description: string; category: string
  amount: number; paymentMethod: string; clientName: string
}

interface MonthlySummary {
  month: string; income: number; expenses: number; netProfit: number
}

interface ClientRecord {
  name: string; email: string; phone: string; weddingDate: string
  veilType: string; budget: number; stage: string; notes: string
}

interface ActivityRecord {
  date: string; clientName: string; type: string; notes: string; nextFollowUp: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function buildFinanceSystemPrompt(transactions: Transaction[], monthly: MonthlySummary[]): string {
  const txLines = transactions.map(tx =>
    `${tx.date} | ${tx.type.padEnd(7)} | S$${String(tx.amount).padStart(6)} | ${tx.category} | ${tx.description}${tx.clientName ? ` (${tx.clientName})` : ''}`
  ).join('\n')

  const monthLines = monthly
    .filter(m => m.income > 0 || m.expenses > 0)
    .map(m =>
      `${m.month.padEnd(10)} | Income S$${m.income.toLocaleString().padStart(6)} | Expenses S$${m.expenses.toLocaleString().padStart(6)} | Net S$${m.netProfit.toLocaleString()}`
    ).join('\n')

  return `You are a friendly financial assistant for Unveiled Atelier, a bridal boutique in Singapore run by a sole proprietor who files taxes with IRAS.

Answer questions about the business finances clearly and conversationally. Use Singapore dollar formatting (S$). Keep responses concise — a few sentences unless a detailed breakdown is needed. If asked something outside the financial data provided, say so honestly.

## Transactions
${txLines || 'No transactions loaded.'}

## Monthly Summary
${monthLines || 'No monthly data loaded.'}`
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'Chat is not configured — add ANTHROPIC_API_KEY to your Vercel environment variables.',
    })
  }

  const { message, history, transactions, monthlySummary, chatMode, clients, activities } = req.body as {
    message: string
    history: ChatMessage[]
    transactions?: Transaction[]
    monthlySummary?: MonthlySummary[]
    chatMode?: 'finance' | 'clients'
    clients?: ClientRecord[]
    activities?: ActivityRecord[]
  }

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required.' })
  }

  const systemPrompt = chatMode === 'clients'
    ? buildClientSystemPrompt(clients ?? [], activities ?? [])
    : buildFinanceSystemPrompt(transactions ?? [], monthlySummary ?? [])

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message },
      ],
    })

    const reply = response.content[0].type === 'text' ? response.content[0].text : ''
    res.json({ reply })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: `Claude API error: ${message}` })
  }
}
