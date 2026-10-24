// Shapes client data for the chat prompt. Shared by src/lib/chat.ts (live data,
// built in the browser) and api/chat.ts (demo fixtures, built on the server), so
// both send the model the same thing. No Vite-only imports: the serverless
// function imports this file too.

import type { Client, ClientActivity } from '../types'

export interface ChatClient {
  name: string; weddingDate: string; veilType: string; budget: number; stage: string; notes: string
}

export interface ChatActivity {
  date: string; clientName: string; type: string; notes: string; nextFollowUp: string
}

// Whatever goes into the prompt leaves our infrastructure for Anthropic's, so
// email, phone and ids are dropped: no question about the pipeline needs them.
// Activities carry the client's name instead of the id, because names are what
// the model (and Esther) can read.
export function clientChatContext(
  clients: Client[],
  activities: ClientActivity[],
): { clients: ChatClient[]; activities: ChatActivity[] } {
  const nameById = new Map(clients.map(c => [c.id, c.name]))
  return {
    clients: clients.map(({ name, weddingDate, veilType, budget, stage, notes }) =>
      ({ name, weddingDate, veilType, budget, stage, notes })),
    activities: activities.map(({ date, clientId, type, notes, nextFollowUp }) =>
      ({ date, clientName: nameById.get(clientId) ?? 'Unknown client', type, notes, nextFollowUp })),
  }
}
