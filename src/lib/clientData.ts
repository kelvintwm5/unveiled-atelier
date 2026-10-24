// All client-tracker data access lives here. Views call these functions and never
// see the Supabase client or the database's snake_case column names.
//   demo → an in-memory copy of the fixtures; no network
//   app  → the clients and activities tables, guarded by RLS (is_app_owner())

import { getSupabase } from './supabase'
import { DEMO_CLIENTS, DEMO_ACTIVITIES } from './demoData'
import type { Client, ClientActivity, ClientStage, NewActivity, NewClient } from '../types'

type Mode = 'demo' | 'app'

// ── Demo store ─────────────────────────────────────────────────────────────────

// One copy shared by every view, so a client added in Pipeline can be picked in
// Activity. Lives until the page reloads; nothing is saved anywhere.
const demo = {
  clients: DEMO_CLIENTS.map(c => ({ ...c })),
  activities: DEMO_ACTIVITIES.map(a => ({ ...a })),
}

// ── Row mapping ────────────────────────────────────────────────────────────────

// The database stores "not set" as null; the UI uses '' (and 0 for budget),
// which is what form inputs hold. The conversion happens here and nowhere else.

interface ClientRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  wedding_date: string | null
  veil_type: Client['veilType']
  budget: number | string | null   // numeric: PostgREST may send it as a string
  stage: ClientStage
  notes: string | null
}

interface ActivityRow {
  id: string
  client_id: string
  activity_date: string
  type: ClientActivity['type']
  notes: string | null
  next_follow_up: string | null
}

const CLIENT_COLUMNS = 'id, name, email, phone, wedding_date, veil_type, budget, stage, notes'
const ACTIVITY_COLUMNS = 'id, client_id, activity_date, type, notes, next_follow_up'

function toClient(r: ClientRow): Client {
  return {
    id:          r.id,
    name:        r.name,
    email:       r.email ?? '',
    phone:       r.phone ?? '',
    weddingDate: r.wedding_date ?? '',
    veilType:    r.veil_type,
    budget:      Number(r.budget ?? 0),
    stage:       r.stage,
    notes:       r.notes ?? '',
  }
}

function fromNewClient(c: NewClient) {
  return {
    name:         c.name.trim(),
    email:        c.email.trim() || null,
    phone:        c.phone.trim() || null,
    wedding_date: c.weddingDate || null,
    veil_type:    c.veilType,
    budget:       c.budget > 0 ? c.budget : null,
    stage:        c.stage,
    notes:        c.notes.trim() || null,
  }
}

function toActivity(r: ActivityRow): ClientActivity {
  return {
    id:           r.id,
    clientId:     r.client_id,
    date:         r.activity_date,
    type:         r.type,
    notes:        r.notes ?? '',
    nextFollowUp: r.next_follow_up ?? '',
  }
}

function fromNewActivity(a: NewActivity) {
  return {
    client_id:      a.clientId,
    activity_date:  a.date,
    type:           a.type,
    notes:          a.notes.trim() || null,
    next_follow_up: a.nextFollowUp || null,
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function listClients(mode: Mode): Promise<Client[]> {
  if (mode === 'demo') return demo.clients.map(c => ({ ...c }))
  const { data, error } = await getSupabase()
    .from('clients')
    .select(CLIENT_COLUMNS)
    .order('created_at')
  if (error) throw new Error(`Couldn't load clients: ${error.message}`)
  return (data as ClientRow[]).map(toClient)
}

/** Newest first. */
export async function listActivities(mode: Mode): Promise<ClientActivity[]> {
  if (mode === 'demo') {
    return demo.activities.map(a => ({ ...a })).sort((a, b) => b.date.localeCompare(a.date))
  }
  const { data, error } = await getSupabase()
    .from('activities')
    .select(ACTIVITY_COLUMNS)
    .order('activity_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Couldn't load the activity log: ${error.message}`)
  return (data as ActivityRow[]).map(toActivity)
}

/** Saves a new client and returns it with the id the database assigned. */
export async function createClient(mode: Mode, input: NewClient): Promise<Client> {
  if (!input.name.trim()) throw new Error('Name is required.')
  if (mode === 'demo') {
    const client = { ...input, name: input.name.trim(), id: crypto.randomUUID() }
    demo.clients.push(client)
    return { ...client }
  }
  const { data, error } = await getSupabase()
    .from('clients')
    .insert(fromNewClient(input))
    .select(CLIENT_COLUMNS)
    .single()
  if (error) throw new Error(`Couldn't save the client: ${error.message}`)
  return toClient(data as ClientRow)
}

export async function updateClientStage(mode: Mode, clientId: string, stage: ClientStage): Promise<void> {
  if (mode === 'demo') {
    const client = demo.clients.find(c => c.id === clientId)
    if (client) client.stage = stage
    return
  }
  // .select() makes the update report which rows it touched. Without it, an id
  // that no longer exists (or that RLS hides) "succeeds" while changing nothing.
  const { data, error } = await getSupabase()
    .from('clients')
    .update({ stage })
    .eq('id', clientId)
    .select('id')
  if (error) throw new Error(`Couldn't change the stage: ${error.message}`)
  if (!data?.length) throw new Error("Couldn't change the stage: that client no longer exists. Reload the page.")
}

/** Saves a new activity and returns it with the id the database assigned. */
export async function createActivity(mode: Mode, input: NewActivity): Promise<ClientActivity> {
  if (!input.clientId) throw new Error('Select a client.')
  if (!input.notes.trim()) throw new Error('Notes are required.')
  if (mode === 'demo') {
    const activity = { ...input, notes: input.notes.trim(), id: crypto.randomUUID() }
    demo.activities.push(activity)
    return { ...activity }
  }
  const { data, error } = await getSupabase()
    .from('activities')
    .insert(fromNewActivity(input))
    .select(ACTIVITY_COLUMNS)
    .single()
  if (error) throw new Error(`Couldn't save the activity: ${error.message}`)
  return toActivity(data as ActivityRow)
}

// ── Display ────────────────────────────────────────────────────────────────────

/**
 * Client id → the name to show. Two clients can share a name, so a repeated
 * name gets its wedding date added to tell them apart.
 */
export function clientLabels(clients: Client[]): Map<string, string> {
  const nameCounts = new Map<string, number>()
  for (const c of clients) nameCounts.set(c.name, (nameCounts.get(c.name) ?? 0) + 1)
  return new Map(clients.map(c => [
    c.id,
    (nameCounts.get(c.name) ?? 0) > 1 ? `${c.name} · ${c.weddingDate || 'no date'}` : c.name,
  ]))
}
