// The only caller of /api/chat. Views call sendChatMessage() and never fetch directly.
//   demo → no token and no data: the server answers from its own copy of the demo fixtures
//   app  → sends the Supabase access token, which the server checks before calling Claude

import { getAccessToken } from './supabase'
import type { Client, ClientActivity, MonthlySummary, Transaction } from '../types'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export type ChatContext =
  | { chatMode: 'finance'; transactions: Transaction[]; monthlySummary: MonthlySummary[] }
  | { chatMode: 'clients'; clients: Client[]; activities: ClientActivity[] }

// Whatever is sent here leaves our infrastructure for Anthropic's, so email and
// phone are dropped: no question about the pipeline needs them.
function clientContext(clients: Client[]) {
  return clients.map(({ name, weddingDate, veilType, budget, stage, notes }) =>
    ({ name, weddingDate, veilType, budget, stage, notes }))
}

/** Sends one message and returns Claude's reply. Throws an Error a user can read. */
export async function sendChatMessage(
  mode: 'demo' | 'app',
  message: string,
  history: ChatTurn[],
  context: ChatContext,
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  let body: Record<string, unknown> = { message, history, chatMode: context.chatMode }

  if (mode === 'app') {
    const token = await getAccessToken()
    if (!token) throw new Error('Your session has expired. Sign out and sign in again.')
    headers.Authorization = `Bearer ${token}`
    body = context.chatMode === 'clients'
      ? { ...body, clients: clientContext(context.clients), activities: context.activities }
      : { ...body, transactions: context.transactions, monthlySummary: context.monthlySummary }
  }

  let res: Response
  try {
    res = await fetch('/api/chat', { method: 'POST', headers, body: JSON.stringify(body) })
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.')
  }

  // Under plain `npm run dev` there's no /api, and Vite answers with an HTML page.
  const data: unknown = await res.json().catch(() => null)
  const field = (key: string) =>
    data && typeof data === 'object' && key in data ? (data as Record<string, unknown>)[key] : undefined

  if (!res.ok) {
    const error = field('error')
    throw new Error(typeof error === 'string' ? error : 'Something went wrong. Please try again.')
  }
  const reply = field('reply')
  if (typeof reply !== 'string') throw new Error('The chat server sent back an unexpected response.')
  return reply
}
