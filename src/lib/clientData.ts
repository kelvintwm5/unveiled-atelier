// All client-tracker data access lives here.
// Sheet tab "Clients"  — columns A-H: name, email, phone, weddingDate, veilType, budget, stage, notes
// Sheet tab "Activity" — columns A-E: date, clientName, type, notes, nextFollowUp

import type { Client, ClientActivity, ClientStage } from '../types'
import { DEMO_CLIENTS, DEMO_ACTIVITIES } from './demoData'

// ── Sheets helpers ─────────────────────────────────────────────────────────────

const SHEET_ID = import.meta.env.VITE_REAL_SHEET_ID as string

async function sheetsGet(range: string, token: string): Promise<(string | number)[][]> {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`
  )
  url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE')
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401) throw new Error('Session expired — please sign in again.')
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message ?? `Sheets API error ${res.status}`)
  }
  return (await res.json()).values ?? []
}

async function sheetsAppend(range: string, row: (string | number)[], token: string): Promise<void> {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append`
  )
  url.searchParams.set('valueInputOption', 'RAW')
  url.searchParams.set('insertDataOption', 'INSERT_ROWS')
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  })
  if (res.status === 401) throw new Error('Session expired — please sign in again.')
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message ?? `Sheets API error ${res.status}`)
  }
}

async function sheetsPut(range: string, value: string | number, token: string): Promise<void> {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`
  )
  url.searchParams.set('valueInputOption', 'RAW')
  const res = await fetch(url.toString(), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[value]] }),
  })
  if (res.status === 401) throw new Error('Session expired — please sign in again.')
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message ?? `Sheets API error ${res.status}`)
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function fetchClients(mode: 'demo' | 'app', accessToken?: string): Promise<Client[]> {
  if (mode === 'demo') return DEMO_CLIENTS
  const rows = await sheetsGet('Clients!A2:H', accessToken!)
  return rows.filter(r => r[0]).map(r => ({
    name:        String(r[0] ?? ''),
    email:       String(r[1] ?? ''),
    phone:       String(r[2] ?? ''),
    weddingDate: String(r[3] ?? ''),
    veilType:    String(r[4] ?? 'TBD') as Client['veilType'],
    budget:      Number(r[5]) || 0,
    stage:       String(r[6] ?? 'Inquiry') as ClientStage,
    notes:       String(r[7] ?? ''),
  }))
}

export async function fetchActivities(mode: 'demo' | 'app', accessToken?: string): Promise<ClientActivity[]> {
  if (mode === 'demo') return DEMO_ACTIVITIES
  const rows = await sheetsGet('Activity!A2:E', accessToken!)
  return rows.filter(r => r[0]).map(r => ({
    date:         String(r[0] ?? ''),
    clientName:   String(r[1] ?? ''),
    type:         String(r[2] ?? 'Note') as ClientActivity['type'],
    notes:        String(r[3] ?? ''),
    nextFollowUp: String(r[4] ?? ''),
  }))
}

export async function appendClient(accessToken: string, client: Client): Promise<void> {
  await sheetsAppend('Clients!A:H', [
    client.name, client.email, client.phone, client.weddingDate,
    client.veilType, client.budget, client.stage, client.notes,
  ], accessToken)
}

export async function appendActivity(accessToken: string, activity: ClientActivity): Promise<void> {
  await sheetsAppend('Activity!A:E', [
    activity.date, activity.clientName, activity.type, activity.notes, activity.nextFollowUp,
  ], accessToken)
}

export async function updateClientStage(
  accessToken: string,
  clientName: string,
  stage: ClientStage,
): Promise<void> {
  const rows = await sheetsGet('Clients!A2:A', accessToken)
  const idx = rows.findIndex(r => String(r[0]) === clientName)
  if (idx === -1) throw new Error(`Client "${clientName}" not found in sheet.`)
  await sheetsPut(`Clients!G${idx + 2}`, stage, accessToken)
}
