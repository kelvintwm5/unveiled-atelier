// All client-tracker data access lives here.
// Sheet tab "Clients"  — columns A-H: name, email, phone, weddingDate, veilType, budget, stage, notes
// Sheet tab "Activity" — columns A-E: date, clientName, type, notes, nextFollowUp

import type { Client, ClientActivity, ClientStage } from '../types'

// ── Demo data ──────────────────────────────────────────────────────────────────

export const DEMO_CLIENTS: Client[] = [
  {
    name: 'Rachel Tan',
    email: 'rachel.tan@gmail.com',
    phone: '+65 9123 4567',
    weddingDate: '2025-04-12',
    veilType: 'Bespoke Veil',
    budget: 450,
    stage: 'Fitting',
    notes: 'Cathedral length, French lace trim. 2nd fitting done, minor adjustments pending.',
  },
  {
    name: 'Priya Nair',
    email: 'priya.n@hotmail.com',
    phone: '+65 8234 5678',
    weddingDate: '2025-06-07',
    veilType: 'Rental',
    budget: 180,
    stage: 'Consultation',
    notes: 'Traditional Indian-Chinese wedding. Likes the pearl edge rental.',
  },
  {
    name: 'Amanda Goh',
    email: 'amanda.goh@outlook.com',
    phone: '+65 9345 6789',
    weddingDate: '2025-03-22',
    veilType: 'Bespoke Veil',
    budget: 600,
    stage: 'Confirmed',
    notes: 'Elbow length, silk organza. Deposit paid. Pickup 8 March.',
  },
  {
    name: 'Jessica Lim',
    email: 'jess.lim@gmail.com',
    phone: '+65 8456 7890',
    weddingDate: '2025-07-19',
    veilType: 'Rental',
    budget: 150,
    stage: 'Inquiry',
    notes: 'Contacted via Instagram. Interested in floor-length options.',
  },
  {
    name: 'Sarah Wong',
    email: 'sarah.wong@yahoo.com',
    phone: '+65 9567 8901',
    weddingDate: '2024-12-14',
    veilType: 'Bespoke Veil',
    budget: 520,
    stage: 'Completed',
    notes: 'Fingertip length, applique flowers. Delivered and very happy.',
  },
  {
    name: 'Mei Ling Chen',
    email: 'meiling.chen@gmail.com',
    phone: '+65 8678 9012',
    weddingDate: '2025-08-30',
    veilType: 'Bespoke Rental',
    budget: 300,
    stage: 'Inquiry',
    notes: 'Enquired about custom-made rental concept. Pricing TBD.',
  },
]

export const DEMO_ACTIVITIES: ClientActivity[] = [
  {
    date: '2025-01-15',
    clientName: 'Rachel Tan',
    type: 'In-Person',
    notes: 'Second fitting done. Minor adjustment to the lace trim needed. Ready by end of Jan.',
    nextFollowUp: '2025-01-29',
  },
  {
    date: '2025-01-10',
    clientName: 'Priya Nair',
    type: 'WhatsApp',
    notes: 'Sent photos of pearl edge rental options. She liked the fingertip length.',
    nextFollowUp: '2025-01-17',
  },
  {
    date: '2025-01-08',
    clientName: 'Amanda Goh',
    type: 'Call',
    notes: 'Confirmed pickup date — 8 March. Deposit received via PayNow.',
    nextFollowUp: '',
  },
  {
    date: '2025-01-05',
    clientName: 'Jessica Lim',
    type: 'Email',
    notes: 'Replied to Instagram DM with pricing brochure and available rental dates.',
    nextFollowUp: '2025-01-12',
  },
  {
    date: '2025-01-03',
    clientName: 'Rachel Tan',
    type: 'Call',
    notes: 'Called to schedule 2nd fitting. She is available 15 Jan.',
    nextFollowUp: '2025-01-15',
  },
  {
    date: '2024-12-20',
    clientName: 'Sarah Wong',
    type: 'In-Person',
    notes: 'Final handover. Client loved the result. Left a 5-star Google review.',
    nextFollowUp: '',
  },
  {
    date: '2024-12-10',
    clientName: 'Mei Ling Chen',
    type: 'WhatsApp',
    notes: 'Initial inquiry about bespoke rental concept. Explained pricing model.',
    nextFollowUp: '2025-01-15',
  },
  {
    date: '2024-12-05',
    clientName: 'Priya Nair',
    type: 'In-Person',
    notes: 'First consultation. Showed rental samples. Budget is S$150–200.',
    nextFollowUp: '2025-01-10',
  },
]

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
