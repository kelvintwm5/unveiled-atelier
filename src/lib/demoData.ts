// Sample data used in demo mode — no API call, no auth required.
// This is the same dataset that was written to the Google Sheet by create_sheet.py,
// kept here so portfolio visitors can explore the full UI without signing in.

import type { Transaction, IrasSummary } from '../types'

export const DEMO_TRANSACTIONS: Transaction[] = [
  { date:'2025-01-08', type:'Income',  description:'Bridal gown package – Sarah Lim',    category:'Gown Sales',             amount:3800, paymentMethod:'PayNow',        clientName:'Sarah Lim',         receiptNo:'REC-001', notes:'Full payment' },
  { date:'2025-01-12', type:'Expense', description:'Fabric & lace materials',            category:'Cost of Goods',          amount:520,  paymentMethod:'Bank Transfer', clientName:'',                  receiptNo:'EXP-001', notes:'For Feb stock' },
  { date:'2025-01-18', type:'Income',  description:'Gown alteration – Mrs Chan',         category:'Alteration Services',    amount:280,  paymentMethod:'Cash',          clientName:'Mrs Chan',          receiptNo:'REC-002', notes:'Hem & bustle' },
  { date:'2025-01-25', type:'Expense', description:'Instagram ads – Jan',               category:'Marketing & Advertising',amount:150,  paymentMethod:'Bank Transfer', clientName:'',                  receiptNo:'EXP-002', notes:'Monthly boost' },
  { date:'2025-02-03', type:'Income',  description:'Rental deposit – Amanda Koh',        category:'Deposits Received',      amount:500,  paymentMethod:'PayNow',        clientName:'Amanda Koh',        receiptNo:'REC-003', notes:'Deposit for Apr wedding' },
  { date:'2025-02-10', type:'Income',  description:'Veil & accessories – Priya S',       category:'Accessories',            amount:320,  paymentMethod:'Cash',          clientName:'Priya Subramaniam', receiptNo:'REC-004', notes:'Pearl veil set' },
  { date:'2025-02-14', type:'Expense', description:'Studio rental – Feb',               category:'Rental & Utilities',     amount:800,  paymentMethod:'Bank Transfer', clientName:'',                  receiptNo:'EXP-003', notes:'Monthly studio' },
  { date:'2025-02-22', type:'Expense', description:'Alterations – external tailor',      category:'Alterations & Tailoring',amount:180,  paymentMethod:'Cash',          clientName:'',                  receiptNo:'EXP-004', notes:'Subcontract' },
  { date:'2025-03-05', type:'Income',  description:'Gown rental – Grace Tan',            category:'Gown Rental',            amount:650,  paymentMethod:'PayNow',        clientName:'Grace Tan',         receiptNo:'REC-005', notes:'3-day rental' },
  { date:'2025-03-12', type:'Expense', description:'Garment bags & packaging',           category:'Packaging & Supplies',   amount:95,   paymentMethod:'Cash',          clientName:'',                  receiptNo:'EXP-005', notes:'Bulk order' },
  { date:'2025-03-20', type:'Income',  description:'Bridal gown – Michelle Ng',          category:'Gown Sales',             amount:4200, paymentMethod:'Bank Transfer', clientName:'Michelle Ng',       receiptNo:'REC-006', notes:'Includes fitting' },
  { date:'2025-03-28', type:'Expense', description:'Sewing machine service',             category:'Equipment & Tools',      amount:120,  paymentMethod:'Cash',          clientName:'',                  receiptNo:'EXP-006', notes:'Annual service' },
  { date:'2025-04-05', type:'Income',  description:'Alteration bundle – 3 gowns',        category:'Alteration Services',    amount:480,  paymentMethod:'PayNow',        clientName:'Various',           receiptNo:'REC-007', notes:'Walk-in clients' },
  { date:'2025-04-15', type:'Expense', description:'Accounting fees – Q1',               category:'Professional Services',  amount:350,  paymentMethod:'Bank Transfer', clientName:'',                  receiptNo:'EXP-007', notes:'Quarterly bookkeeping' },
  { date:'2025-05-02', type:'Income',  description:'Gown sales – Rebecca Ho',            category:'Gown Sales',             amount:3500, paymentMethod:'PayNow',        clientName:'Rebecca Ho',        receiptNo:'REC-008', notes:'Customised A-line' },
]

// Pre-computed from the transactions above — matches what the Google Sheet formulas calculate
export const DEMO_IRAS: IrasSummary = {
  revenue:        13_730,   // sum of all Income rows
  grossProfit:    13_730,   // same as revenue (service business)
  expenses:        2_215,   // sum of all Expense rows
  adjustedProfit: 11_515,   // revenue - expenses
}
