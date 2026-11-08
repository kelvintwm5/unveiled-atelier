// All client-tracker data access lives here. Views call these functions and never
// see the Supabase client or the database's snake_case column names.
//   demo → an in-memory copy of the fixtures; no network
//   app  → the clients, activities and client_reminders tables, guarded by RLS
//          (is_app_owner())

import { getSupabase } from './supabase'
import { todaySgt } from './dates'
import { DEMO_CLIENTS, DEMO_ACTIVITIES, demoReminders } from './demoData'
import type {
  Client, ClientActivity, ClientReminder, ClientStage, NewActivity, NewClient, NewReminder,
} from '../types'

type Mode = 'demo' | 'app'

// ── Demo store ─────────────────────────────────────────────────────────────────

// One copy shared by every view, so a client added in Pipeline can be picked in
// Activity. Lives until the page reloads; nothing is saved anywhere.
const demo = {
  clients: DEMO_CLIENTS.map(c => ({ ...c })),
  archived: [] as Client[],
  activities: DEMO_ACTIVITIES.map(a => ({ ...a })),
  reminders: demoReminders(todaySgt()),
}

function isDemoArchived(clientId: string): boolean {
  return demo.archived.some(c => c.id === clientId)
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
  activity_notes: string | null
}

interface ActivityRow {
  id: string
  client_id: string
  activity_date: string
  type: ClientActivity['type']
  notes: string | null
  next_follow_up: string | null
}

interface ReminderRow {
  id: string
  client_id: string
  remind_on: string
  note: string
}

const CLIENT_COLUMNS = 'id, name, email, phone, wedding_date, veil_type, budget, stage, notes, activity_notes'
const ACTIVITY_COLUMNS = 'id, client_id, activity_date, type, notes, next_follow_up'
const REMINDER_COLUMNS = 'id, client_id, remind_on, note'

// "Deleted" clients keep their rows, so anything joined to a client has to skip
// the hidden ones itself. The inner join is what makes the filter drop the row
// rather than only blanking the embedded client.
const ACTIVE_CLIENT_JOIN = 'clients!inner(archived_at)'

function toClient(r: ClientRow): Client {
  return {
    id:            r.id,
    name:          r.name,
    email:         r.email ?? '',
    phone:         r.phone ?? '',
    weddingDate:   r.wedding_date ?? '',
    veilType:      r.veil_type,
    budget:        Number(r.budget ?? 0),
    stage:         r.stage,
    notes:         r.notes ?? '',
    activityNotes: r.activity_notes ?? '',
  }
}

function fromNewClient(c: NewClient) {
  return {
    name:           c.name.trim(),
    email:          c.email.trim() || null,
    phone:          c.phone.trim() || null,
    wedding_date:   c.weddingDate || null,
    veil_type:      c.veilType,
    budget:         c.budget > 0 ? c.budget : null,
    stage:          c.stage,
    notes:          c.notes.trim() || null,
    activity_notes: c.activityNotes.trim() || null,
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

function toReminder(r: ReminderRow): ClientReminder {
  return { id: r.id, clientId: r.client_id, remindOn: r.remind_on, note: r.note }
}

/**
 * Updates one client. .select() makes the update report which rows it touched.
 * Without it, an id that no longer exists (or that RLS hides) "succeeds" while
 * changing nothing.
 */
async function updateClientRow(clientId: string, values: Record<string, unknown>, action: string): Promise<void> {
  const { data, error } = await getSupabase()
    .from('clients')
    .update(values)
    .eq('id', clientId)
    .select('id')
  if (error) throw new Error(`Couldn't ${action}: ${error.message}`)
  if (!data?.length) throw new Error(`Couldn't ${action}: that client no longer exists. Reload the page.`)
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Every client except the ones Esther has deleted. */
export async function listClients(mode: Mode): Promise<Client[]> {
  if (mode === 'demo') return demo.clients.map(c => ({ ...c }))
  const { data, error } = await getSupabase()
    .from('clients')
    .select(CLIENT_COLUMNS)
    .is('archived_at', null)
    .order('created_at')
  if (error) throw new Error(`Couldn't load clients: ${error.message}`)
  return (data as ClientRow[]).map(toClient)
}

/** Deleted clients, most recently deleted first, for the Restore list. */
export async function listArchivedClients(mode: Mode): Promise<Client[]> {
  if (mode === 'demo') return demo.archived.map(c => ({ ...c }))
  const { data, error } = await getSupabase()
    .from('clients')
    .select(CLIENT_COLUMNS)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
  if (error) throw new Error(`Couldn't load deleted clients: ${error.message}`)
  return (data as ClientRow[]).map(toClient)
}

/** Newest first. Skips deleted clients, so the log never shows "Unknown client". */
export async function listActivities(mode: Mode): Promise<ClientActivity[]> {
  if (mode === 'demo') {
    return demo.activities
      .filter(a => !isDemoArchived(a.clientId))
      .map(a => ({ ...a }))
      .sort((a, b) => b.date.localeCompare(a.date))
  }
  const { data, error } = await getSupabase()
    .from('activities')
    .select(`${ACTIVITY_COLUMNS}, ${ACTIVE_CLIENT_JOIN}`)
    .is('clients.archived_at', null)
    .order('activity_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Couldn't load the activity log: ${error.message}`)
  return (data as unknown as ActivityRow[]).map(toActivity)
}

/** Open reminders, soonest first. Skips deleted clients. */
export async function listReminders(mode: Mode): Promise<ClientReminder[]> {
  if (mode === 'demo') {
    return demo.reminders
      .filter(r => !isDemoArchived(r.clientId))
      .map(r => ({ ...r }))
      .sort((a, b) => a.remindOn.localeCompare(b.remindOn))
  }
  const { data, error } = await getSupabase()
    .from('client_reminders')
    .select(`${REMINDER_COLUMNS}, ${ACTIVE_CLIENT_JOIN}`)
    .is('done_at', null)
    .is('clients.archived_at', null)
    .order('remind_on')
  if (error) throw new Error(`Couldn't load reminders: ${error.message}`)
  return (data as unknown as ReminderRow[]).map(toReminder)
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

/** Saves every field on the profile and returns the client as stored. */
export async function updateClient(mode: Mode, clientId: string, input: NewClient): Promise<Client> {
  if (!input.name.trim()) throw new Error('Name is required.')
  if (mode === 'demo') {
    const client = demo.clients.find(c => c.id === clientId)
    if (!client) throw new Error("Couldn't save the client: that client no longer exists. Reload the page.")
    Object.assign(client, input, { name: input.name.trim() })
    return { ...client }
  }
  const { data, error } = await getSupabase()
    .from('clients')
    .update(fromNewClient(input))
    .eq('id', clientId)
    .select(CLIENT_COLUMNS)
  if (error) throw new Error(`Couldn't save the client: ${error.message}`)
  if (!data?.length) throw new Error("Couldn't save the client: that client no longer exists. Reload the page.")
  return toClient(data[0] as ClientRow)
}

export async function updateClientStage(mode: Mode, clientId: string, stage: ClientStage): Promise<void> {
  if (mode === 'demo') {
    const client = demo.clients.find(c => c.id === clientId)
    if (client) client.stage = stage
    return
  }
  await updateClientRow(clientId, { stage }, 'change the stage')
}

/**
 * "Delete" in the app. Hides the client rather than erasing the row: invoices and
 * transactions reference clients and must be kept, and a mistaken tap can be undone.
 */
export async function archiveClient(mode: Mode, clientId: string): Promise<void> {
  if (mode === 'demo') {
    const index = demo.clients.findIndex(c => c.id === clientId)
    if (index >= 0) demo.archived.unshift(...demo.clients.splice(index, 1))
    return
  }
  await updateClientRow(clientId, { archived_at: new Date().toISOString() }, 'delete the client')
}

export async function restoreClient(mode: Mode, clientId: string): Promise<void> {
  if (mode === 'demo') {
    const index = demo.archived.findIndex(c => c.id === clientId)
    if (index >= 0) demo.clients.push(...demo.archived.splice(index, 1))
    return
  }
  await updateClientRow(clientId, { archived_at: null }, 'restore the client')
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

/** Saves a new reminder and returns it with the id the database assigned. */
export async function createReminder(mode: Mode, input: NewReminder): Promise<ClientReminder> {
  if (!input.remindOn) throw new Error('Pick a date for the reminder.')
  if (!input.note.trim()) throw new Error('Say what the reminder is for.')
  if (mode === 'demo') {
    const reminder = { ...input, note: input.note.trim(), id: crypto.randomUUID() }
    demo.reminders.push(reminder)
    return { ...reminder }
  }
  const { data, error } = await getSupabase()
    .from('client_reminders')
    .insert({ client_id: input.clientId, remind_on: input.remindOn, note: input.note.trim() })
    .select(REMINDER_COLUMNS)
    .single()
  if (error) throw new Error(`Couldn't save the reminder: ${error.message}`)
  return toReminder(data as ReminderRow)
}

/** Marks a reminder done, which stops it appearing in the app and the morning message. */
export async function completeReminder(mode: Mode, reminderId: string): Promise<void> {
  if (mode === 'demo') {
    demo.reminders = demo.reminders.filter(r => r.id !== reminderId)
    return
  }
  const { data, error } = await getSupabase()
    .from('client_reminders')
    .update({ done_at: new Date().toISOString() })
    .eq('id', reminderId)
    .select('id')
  if (error) throw new Error(`Couldn't update the reminder: ${error.message}`)
  if (!data?.length) throw new Error("Couldn't update the reminder: it no longer exists. Reload the page.")
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
