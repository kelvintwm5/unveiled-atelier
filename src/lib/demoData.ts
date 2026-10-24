// Sample data used in demo mode — no API call, no auth required.
// This is the same dataset that was written to the Google Sheet by create_sheet.py,
// kept here so portfolio visitors can explore the full UI without signing in.

import type { Transaction, IrasSummary, MonthlySummary, PnlTotals, Client, ClientActivity } from '../types'

// Fixed ids, so React keys stay stable. Demo data never reaches the database.
export const DEMO_TRANSACTIONS: Transaction[] = [
  { id:'00000000-0000-4000-8000-100000000001', date:'2025-01-08', type:'Income',  description:'Bridal gown package – Sarah Lim',    category:'Gown Sales',             amount:3800, paymentMethod:'PayNow',        clientName:'Sarah Lim',         referenceNo:'REC-001', clientId:'', notes:'Full payment' },
  { id:'00000000-0000-4000-8000-100000000002', date:'2025-01-12', type:'Expense', description:'Fabric & lace materials',            category:'Cost of Goods',          amount:520,  paymentMethod:'Bank Transfer', clientName:'',                  referenceNo:'EXP-001', clientId:'', notes:'For Feb stock' },
  { id:'00000000-0000-4000-8000-100000000003', date:'2025-01-18', type:'Income',  description:'Gown alteration – Mrs Chan',         category:'Alteration Services',    amount:280,  paymentMethod:'Cash',          clientName:'Mrs Chan',          referenceNo:'REC-002', clientId:'', notes:'Hem & bustle' },
  { id:'00000000-0000-4000-8000-100000000004', date:'2025-01-25', type:'Expense', description:'Instagram ads – Jan',               category:'Marketing & Advertising',amount:150,  paymentMethod:'Bank Transfer', clientName:'',                  referenceNo:'EXP-002', clientId:'', notes:'Monthly boost' },
  { id:'00000000-0000-4000-8000-100000000005', date:'2025-02-03', type:'Income',  description:'Rental deposit – Amanda Koh',        category:'Deposits Received',      amount:500,  paymentMethod:'PayNow',        clientName:'Amanda Koh',        referenceNo:'REC-003', clientId:'', notes:'Deposit for Apr wedding' },
  { id:'00000000-0000-4000-8000-100000000006', date:'2025-02-10', type:'Income',  description:'Veil & accessories – Priya S',       category:'Accessories',            amount:320,  paymentMethod:'Cash',          clientName:'Priya Subramaniam', referenceNo:'REC-004', clientId:'', notes:'Pearl veil set' },
  { id:'00000000-0000-4000-8000-100000000007', date:'2025-02-14', type:'Expense', description:'Studio rental – Feb',               category:'Rental & Utilities',     amount:800,  paymentMethod:'Bank Transfer', clientName:'',                  referenceNo:'EXP-003', clientId:'', notes:'Monthly studio' },
  { id:'00000000-0000-4000-8000-100000000008', date:'2025-02-22', type:'Expense', description:'Alterations – external tailor',      category:'Alterations & Tailoring',amount:180,  paymentMethod:'Cash',          clientName:'',                  referenceNo:'EXP-004', clientId:'', notes:'Subcontract' },
  { id:'00000000-0000-4000-8000-100000000009', date:'2025-03-05', type:'Income',  description:'Gown rental – Grace Tan',            category:'Gown Rental',            amount:650,  paymentMethod:'PayNow',        clientName:'Grace Tan',         referenceNo:'REC-005', clientId:'', notes:'3-day rental' },
  { id:'00000000-0000-4000-8000-100000000010', date:'2025-03-12', type:'Expense', description:'Garment bags & packaging',           category:'Packaging & Supplies',   amount:95,   paymentMethod:'Cash',          clientName:'',                  referenceNo:'EXP-005', clientId:'', notes:'Bulk order' },
  { id:'00000000-0000-4000-8000-100000000011', date:'2025-03-20', type:'Income',  description:'Bridal gown – Michelle Ng',          category:'Gown Sales',             amount:4200, paymentMethod:'Bank Transfer', clientName:'Michelle Ng',       referenceNo:'REC-006', clientId:'', notes:'Includes fitting' },
  { id:'00000000-0000-4000-8000-100000000012', date:'2025-03-28', type:'Expense', description:'Sewing machine service',             category:'Equipment & Tools',      amount:120,  paymentMethod:'Cash',          clientName:'',                  referenceNo:'EXP-006', clientId:'', notes:'Annual service' },
  { id:'00000000-0000-4000-8000-100000000013', date:'2025-04-05', type:'Income',  description:'Alteration bundle – 3 gowns',        category:'Alteration Services',    amount:480,  paymentMethod:'PayNow',        clientName:'Various',           referenceNo:'REC-007', clientId:'', notes:'Walk-in clients' },
  { id:'00000000-0000-4000-8000-100000000014', date:'2025-04-15', type:'Expense', description:'Accounting fees – Q1',               category:'Professional Services',  amount:350,  paymentMethod:'Bank Transfer', clientName:'',                  referenceNo:'EXP-007', clientId:'', notes:'Quarterly bookkeeping' },
  { id:'00000000-0000-4000-8000-100000000015', date:'2025-05-02', type:'Income',  description:'Gown sales – Rebecca Ho',            category:'Gown Sales',             amount:3500, paymentMethod:'PayNow',        clientName:'Rebecca Ho',        referenceNo:'REC-008', clientId:'', notes:'Customised A-line' },
]

// Every demo transaction is in this year.
export const DEMO_PNL_YEAR = 2025

// Monthly breakdown pre-computed from DEMO_TRANSACTIONS above, matching what the
// pnl_monthly() SQL function returns for them (see supabase/checks/0005_pnl_checks.sql).
// February is intentionally a loss month (high studio rent, low income) — realistic for a bridal business.
export const DEMO_MONTHLY: MonthlySummary[] = [
  { month: 'January',   income: 4080, expenses: 670,  netProfit: 3410,  profitMargin: 0.8358 },
  { month: 'February',  income: 820,  expenses: 980,  netProfit: -160,  profitMargin: -0.1951 },
  { month: 'March',     income: 4850, expenses: 215,  netProfit: 4635,  profitMargin: 0.9557 },
  { month: 'April',     income: 480,  expenses: 350,  netProfit: 130,   profitMargin: 0.2708 },
  { month: 'May',       income: 3500, expenses: 0,    netProfit: 3500,  profitMargin: 1.0 },
  { month: 'June',      income: 0,    expenses: 0,    netProfit: 0,     profitMargin: 0 },
  { month: 'July',      income: 0,    expenses: 0,    netProfit: 0,     profitMargin: 0 },
  { month: 'August',    income: 0,    expenses: 0,    netProfit: 0,     profitMargin: 0 },
  { month: 'September', income: 0,    expenses: 0,    netProfit: 0,     profitMargin: 0 },
  { month: 'October',   income: 0,    expenses: 0,    netProfit: 0,     profitMargin: 0 },
  { month: 'November',  income: 0,    expenses: 0,    netProfit: 0,     profitMargin: 0 },
  { month: 'December',  income: 0,    expenses: 0,    netProfit: 0,     profitMargin: 0 },
]

export const DEMO_PNL_TOTAL: PnlTotals = {
  income: 13_730, expenses: 2_215, netProfit: 11_515, profitMargin: 0.8387,
}

// Pre-computed from the transactions above, matching iras_summary(2025)
export const DEMO_IRAS: IrasSummary = {
  revenue:        13_730,   // sum of all Income rows
  grossProfit:    13_730,   // same as revenue (service business)
  expenses:        2_215,   // sum of all Expense rows
  adjustedProfit: 11_515,   // revenue - expenses
}

// ── Client tracker ────────────────────────────────────────────────────────────

// Fixed, readable ids so demo activities can point at demo clients. Demo data
// never reaches the database, so these only have to be unique among themselves.
const DEMO_CLIENT_IDS = {
  'Rachel Tan':    '00000000-0000-4000-8000-000000000001',
  'Priya Nair':    '00000000-0000-4000-8000-000000000002',
  'Amanda Goh':    '00000000-0000-4000-8000-000000000003',
  'Jessica Lim':   '00000000-0000-4000-8000-000000000004',
  'Sarah Wong':    '00000000-0000-4000-8000-000000000005',
  'Mei Ling Chen': '00000000-0000-4000-8000-000000000006',
} as const

export const DEMO_CLIENTS: Client[] = [
  {
    id: DEMO_CLIENT_IDS['Rachel Tan'],
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
    id: DEMO_CLIENT_IDS['Priya Nair'],
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
    id: DEMO_CLIENT_IDS['Amanda Goh'],
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
    id: DEMO_CLIENT_IDS['Jessica Lim'],
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
    id: DEMO_CLIENT_IDS['Sarah Wong'],
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
    id: DEMO_CLIENT_IDS['Mei Ling Chen'],
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
    id: '00000000-0000-4000-9000-000000000001',
    date: '2025-01-15',
    clientId: DEMO_CLIENT_IDS['Rachel Tan'],
    type: 'In-Person',
    notes: 'Second fitting done. Minor adjustment to the lace trim needed. Ready by end of Jan.',
    nextFollowUp: '2025-01-29',
  },
  {
    id: '00000000-0000-4000-9000-000000000002',
    date: '2025-01-10',
    clientId: DEMO_CLIENT_IDS['Priya Nair'],
    type: 'WhatsApp',
    notes: 'Sent photos of pearl edge rental options. She liked the fingertip length.',
    nextFollowUp: '2025-01-17',
  },
  {
    id: '00000000-0000-4000-9000-000000000003',
    date: '2025-01-08',
    clientId: DEMO_CLIENT_IDS['Amanda Goh'],
    type: 'Call',
    notes: 'Confirmed pickup date — 8 March. Deposit received via PayNow.',
    nextFollowUp: '',
  },
  {
    id: '00000000-0000-4000-9000-000000000004',
    date: '2025-01-05',
    clientId: DEMO_CLIENT_IDS['Jessica Lim'],
    type: 'Email',
    notes: 'Replied to Instagram DM with pricing brochure and available rental dates.',
    nextFollowUp: '2025-01-12',
  },
  {
    id: '00000000-0000-4000-9000-000000000005',
    date: '2025-01-03',
    clientId: DEMO_CLIENT_IDS['Rachel Tan'],
    type: 'Call',
    notes: 'Called to schedule 2nd fitting. She is available 15 Jan.',
    nextFollowUp: '2025-01-15',
  },
  {
    id: '00000000-0000-4000-9000-000000000006',
    date: '2024-12-20',
    clientId: DEMO_CLIENT_IDS['Sarah Wong'],
    type: 'In-Person',
    notes: 'Final handover. Client loved the result. Left a 5-star Google review.',
    nextFollowUp: '',
  },
  {
    id: '00000000-0000-4000-9000-000000000007',
    date: '2024-12-10',
    clientId: DEMO_CLIENT_IDS['Mei Ling Chen'],
    type: 'WhatsApp',
    notes: 'Initial inquiry about bespoke rental concept. Explained pricing model.',
    nextFollowUp: '2025-01-15',
  },
  {
    id: '00000000-0000-4000-9000-000000000008',
    date: '2024-12-05',
    clientId: DEMO_CLIENT_IDS['Priya Nair'],
    type: 'In-Person',
    notes: 'First consultation. Showed rental samples. Budget is S$150–200.',
    nextFollowUp: '2025-01-10',
  },
]
