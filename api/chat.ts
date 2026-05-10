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

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function buildSystemPrompt(transactions: Transaction[], monthly: MonthlySummary[]): string {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'Chat is not configured — add ANTHROPIC_API_KEY to your Vercel environment variables.',
    })
  }

  const { message, history, transactions, monthlySummary } = req.body as {
    message: string
    history: ChatMessage[]
    transactions: Transaction[]
    monthlySummary: MonthlySummary[]
  }

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required.' })
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: buildSystemPrompt(transactions ?? [], monthlySummary ?? []),
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
