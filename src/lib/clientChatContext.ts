// Shapes client data for the chat prompt. Shared by src/lib/chat.ts (live data,
// built in the browser) and api/chat.ts (demo fixtures, built on the server), so
// both send the model the same thing. No Vite-only imports: the serverless
// function imports this file too.

import type { Client, ClientActivity, ClientReminder } from '../types'

export interface ChatClient {
  name: string; weddingDate: string; veilType: string; budget: number; stage: string; notes: string
  activityNotes: string
}

export interface ChatActivity {
  date: string; clientName: string; type: string; notes: string; nextFollowUp: string
}

export interface ChatReminder {
  remindOn: string; clientName: string; note: string
}

// Whatever goes into the prompt leaves our infrastructure for Anthropic's, so
// email, phone and ids are dropped: no question about the pipeline needs them.
// Activities and reminders carry the client's name instead of the id, because
// names are what the model (and Esther) can read.
export function clientChatContext(
  clients: Client[],
  activities: ClientActivity[],
  reminders: ClientReminder[],
): { clients: ChatClient[]; activities: ChatActivity[]; reminders: ChatReminder[] } {
  const nameById = new Map(clients.map(c => [c.id, c.name]))
  const nameOf = (clientId: string) => nameById.get(clientId) ?? 'Unknown client'
  return {
    clients: clients.map(({ name, weddingDate, veilType, budget, stage, notes, activityNotes }) =>
      ({ name, weddingDate, veilType, budget, stage, notes, activityNotes })),
    activities: activities.map(({ date, clientId, type, notes, nextFollowUp }) =>
      ({ date, clientName: nameOf(clientId), type, notes, nextFollowUp })),
    reminders: reminders.map(({ remindOn, clientId, note }) =>
      ({ remindOn, clientName: nameOf(clientId), note })),
  }
}
