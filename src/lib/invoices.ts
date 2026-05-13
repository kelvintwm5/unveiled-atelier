const INVOICES_FOLDER_ID  = '1XAaHgJBcXVeOP1Mvd-8Q0OX83sOWj81r'
const RENTAL_TEMPLATE_ID  = '1OaDWVuHhnPBhF6lRyUF6_T9HNLUB6Ndnx8yAr-b8L2c'
const BESPOKE_TEMPLATE_ID = '1S8JZhIeCSf-biKRc1CZdg1KvH7Q5Q2La9OGc5qR010o'
const REAL_SHEET_ID       = import.meta.env.VITE_REAL_SHEET_ID as string

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LineItem {
  title:       string
  description: string
  quantity:    number
  amount:      number
}

export type TemplateType = 'rental' | 'bespoke'
export type InvoiceType  = 'deposit' | 'final'

export interface InvoiceParams {
  templateType:  TemplateType
  invoiceType:   InvoiceType
  clientName:    string
  clientEmail:   string
  clientContact: string
  pwsDate:       string   // '' if not applicable
  weddingDate:   string   // '' if not applicable
  lineItems:     LineItem[]
}

export interface DepositInvoice {
  invoiceNo:     string
  date:          string
  clientName:    string
  clientEmail:   string
  clientContact: string
  templateType:  TemplateType
  lineItems:     LineItem[]
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function fmtSGD(n: number): string {
  return `SGD ${new Intl.NumberFormat('en-SG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)}`
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-SG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function fmtDate(s: string): string {
  if (!s) return ''
  const d = new Date(s + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function calcSubtotal(items: LineItem[]): number {
  return items.reduce((s, i) => s + i.amount * i.quantity, 0)
}

// ─── Totals rows ──────────────────────────────────────────────────────────────

interface TotalsRow { label: string; amount: number; bold: boolean }

export function buildTotalsRows(
  templateType: TemplateType,
  invoiceType: InvoiceType,
  subtotal: number,
): TotalsRow[] {
  if (invoiceType === 'deposit') {
    const deposit = subtotal * 0.5
    return [
      { label: 'Subtotal',                       amount: subtotal, bold: false },
      { label: 'Booking Deposit Required (50%)', amount: deposit,  bold: false },
      { label: 'Amount Payable Now',             amount: deposit,  bold: true  },
    ]
  }
  const remaining = subtotal * 0.5
  if (templateType === 'rental') {
    return [
      { label: 'Remaining Balance (50%)',       amount: remaining,     bold: false },
      { label: 'Security Deposit (Refundable)', amount: remaining,     bold: false },
      { label: 'Amount Payable Now',            amount: remaining * 2, bold: true  },
    ]
  }
  return [
    { label: 'Remaining Balance (50%)', amount: remaining, bold: false },
    { label: 'Amount Payable Now',      amount: remaining, bold: true  },
  ]
}

// ─── Low-level API helpers ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>

async function apiGet(url: string, token: string): Promise<AnyObj> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as AnyObj
    throw new Error(body?.error?.message ?? `API GET ${res.status}`)
  }
  return res.json()
}

async function apiPost(url: string, token: string, body: unknown): Promise<AnyObj> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({})) as AnyObj
    throw new Error(errBody?.error?.message ?? `API POST ${res.status}`)
  }
  return res.json()
}

function docsGet(docId: string, token: string) {
  return apiGet(`https://docs.googleapis.com/v1/documents/${docId}`, token)
}

function docsBatch(docId: string, token: string, requests: unknown[]) {
  if (requests.length === 0) return Promise.resolve()
  return apiPost(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, token, { requests })
}

async function driveCopy(fileId: string, token: string, name: string): Promise<string> {
  const res = await apiPost(
    `https://www.googleapis.com/drive/v3/files/${fileId}/copy`,
    token,
    { name, parents: [INVOICES_FOLDER_ID] },
  )
  return res.id as string
}

// ─── Invoice number ───────────────────────────────────────────────────────────

export async function getNextInvoiceNumber(token: string): Promise<string> {
  const year = new Date().getFullYear()
  try {
    const data = await apiGet(
      `https://sheets.googleapis.com/v4/spreadsheets/${REAL_SHEET_ID}/values/Invoices!A:A`,
      token,
    )
    const rows = (data.values ?? []) as string[][]
    const nums = rows.slice(1)
      .map(r => r[0])
      .filter(Boolean)
      .map(n => parseInt(n.split('-').pop() ?? '', 10))
      .filter(n => !isNaN(n))
    const last = nums.length > 0 ? Math.max(...nums) : 1799
    return `UA-${year}-${last + 1}`
  } catch {
    return `UA-${year}-1800`
  }
}

// ─── Invoice log sheet ────────────────────────────────────────────────────────

async function ensureInvoicesSheet(token: string) {
  try {
    const data = await apiGet(
      `https://sheets.googleapis.com/v4/spreadsheets/${REAL_SHEET_ID}/values/Invoices!A1:J1`,
      token,
    )
    const header = ((data.values ?? [[]])[0] ?? []) as string[]
    if (!header[9]) {
      // Sheet exists but J1 header is missing — write it so the table extends to column J
      await apiPost(
        `https://sheets.googleapis.com/v4/spreadsheets/${REAL_SHEET_ID}/values:batchUpdate`,
        token,
        { valueInputOption: 'RAW', data: [{ range: 'Invoices!J1', values: [['Line Items']] }] },
      )
    }
  } catch {
    await apiPost(
      `https://sheets.googleapis.com/v4/spreadsheets/${REAL_SHEET_ID}:batchUpdate`,
      token,
      { requests: [{ addSheet: { properties: { title: 'Invoices' } } }] },
    )
    await apiPost(
      `https://sheets.googleapis.com/v4/spreadsheets/${REAL_SHEET_ID}/values/Invoices!A1:append?valueInputOption=RAW`,
      token,
      { values: [['Invoice No', 'Date', 'Client Name', 'Email', 'Contact', 'Type', 'Invoice #', 'Amount (SGD)', 'Document Link', 'Line Items']] },
    )
  }
}

async function logInvoice(token: string, row: {
  invoiceNo: string; date: string; clientName: string; clientEmail: string
  clientContact: string; templateType: TemplateType; invoiceType: InvoiceType
  amount: number; docUrl: string; lineItems: LineItem[]
}) {
  await ensureInvoicesSheet(token)
  const colA = await apiGet(
    `https://sheets.googleapis.com/v4/spreadsheets/${REAL_SHEET_ID}/values/Invoices!A:A`,
    token,
  )
  const nextRow = ((colA.values ?? []) as string[][]).length + 1
  await apiPost(
    `https://sheets.googleapis.com/v4/spreadsheets/${REAL_SHEET_ID}/values:batchUpdate`,
    token,
    {
      valueInputOption: 'RAW',
      data: [{
        range: `Invoices!A${nextRow}:J${nextRow}`,
        values: [[
          row.invoiceNo, row.date, row.clientName, row.clientEmail, row.clientContact,
          row.templateType === 'rental' ? 'Rental' : 'Bespoke',
          row.invoiceType === 'deposit' ? '1st — Deposit' : '2nd — Final Payment',
          row.amount, row.docUrl, JSON.stringify(row.lineItems),
        ]],
      }],
    },
  )
}

export async function fetchDepositInvoices(token: string): Promise<DepositInvoice[]> {
  try {
    const data = await apiGet(
      `https://sheets.googleapis.com/v4/spreadsheets/${REAL_SHEET_ID}/values/Invoices!A:J`,
      token,
    )
    const rows = (data.values ?? []) as string[][]
    return rows.slice(1)
      .filter(r => r[6] === '1st — Deposit' && r[9])
      .map(r => {
        let lineItems: LineItem[] = []
        try { lineItems = JSON.parse(r[9]) } catch { /* malformed JSON — skip */ }
        return {
          invoiceNo:     r[0],
          date:          r[1],
          clientName:    r[2],
          clientEmail:   r[3],
          clientContact: r[4],
          templateType:  (r[5] === 'Rental' ? 'rental' : 'bespoke') as TemplateType,
          lineItems,
        }
      })
      .filter(inv => inv.lineItems.length > 0)
      .reverse()
  } catch {
    return []
  }
}

// ─── Document helpers ─────────────────────────────────────────────────────────

function replaceText(search: string, replace: string) {
  return { replaceAllText: { containsText: { text: search, matchCase: true }, replaceText: replace } }
}

function findTable(doc: AnyObj): AnyObj {
  for (const el of doc.body.content as AnyObj[]) {
    if (el.table) return el
  }
  throw new Error('No table found in document')
}

function cellFirstParaStart(cell: AnyObj): number {
  return cell.content[0].paragraph.elements[0].startIndex as number
}

// ─── Main generate function ───────────────────────────────────────────────────

export async function generateInvoice(
  token: string,
  params: InvoiceParams,
): Promise<{ invoiceNo: string; docUrl: string }> {
  const invoiceNo   = await getNextInvoiceNumber(token)
  const invoiceDate = fmtDate(new Date().toISOString().slice(0, 10))
  const templateId  = params.templateType === 'rental' ? RENTAL_TEMPLATE_ID : BESPOKE_TEMPLATE_ID

  // 1. Copy template into invoices folder
  const docId  = await driveCopy(templateId, token, `${invoiceNo} — ${params.clientName}`)
  const docUrl = `https://docs.google.com/document/d/${docId}/edit`

  // 2. Replace simple tokens
  await docsBatch(docId, token, [
    replaceText('{{INVOICE_NO}}',        invoiceNo),
    replaceText('{{INVOICE_DATE}}',      invoiceDate),
    replaceText('{{CLIENT_NAME}}',       params.clientName),
    replaceText('{{CLIENT_EMAIL}}',      params.clientEmail),
    replaceText('{{CLIENT_CONTACT}}',    params.clientContact),
    replaceText('{{PWS_DATE_LINE}}',     params.pwsDate
      ? `PWS Date: ${fmtDate(params.pwsDate)}` : '__REMOVE__'),
    replaceText('{{WEDDING_DATE_LINE}}', params.weddingDate
      ? `Wedding Date: ${fmtDate(params.weddingDate)}` : '__REMOVE__'),
  ])

  // 3. Delete any __REMOVE__ paragraphs (optional date lines)
  const docAfterReplace = await docsGet(docId, token)
  const removeRanges: { startIndex: number; endIndex: number }[] = []
  for (const el of docAfterReplace.body.content as AnyObj[]) {
    if (!el.paragraph) continue
    const text = (el.paragraph.elements as AnyObj[])
      .map(e => e.textRun?.content ?? '').join('')
    if (text.includes('__REMOVE__')) {
      removeRanges.push({ startIndex: el.startIndex as number, endIndex: el.endIndex as number })
    }
  }
  if (removeRanges.length > 0) {
    // Delete from bottom to top so indices don't shift
    await docsBatch(docId, token, removeRanges.reverse().map(r => ({
      deleteContentRange: { range: r },
    })))
  }

  // 4. Find table start index (re-fetch if paragraphs were deleted)
  const docForTable = removeRanges.length > 0 ? await docsGet(docId, token) : docAfterReplace
  const tableEl = findTable(docForTable)
  const tableStartIndex = tableEl.startIndex as number

  // 5. Compute amounts
  const subtotal   = calcSubtotal(params.lineItems)
  const totals     = buildTotalsRows(params.templateType, params.invoiceType, subtotal)
  const amtPayable = totals[totals.length - 1].amount

  // 6. Insert all rows in reverse order (always below header row 0)
  //    Inserting in reverse means the last logical row is inserted first;
  //    each subsequent insert at row 0 pushes prior inserts down, giving correct order.
  const totalRows = params.lineItems.length + totals.length
  await docsBatch(docId, token, Array.from({ length: totalRows }, () => ({
    insertTableRow: {
      tableCellLocation: {
        tableStartLocation: { index: tableStartIndex },
        rowIndex: 0,
        columnIndex: 0,
      },
      insertBelow: true,
    },
  })))

  // 7. Get fresh doc to read new cell positions
  const docWithRows = await docsGet(docId, token)
  const tableRows   = (findTable(docWithRows).table.tableRows as AnyObj[])

  // 8. Collect (startIndex, text) for each cell, sorted DESC so that
  //    inserting at higher indices first doesn't shift lower-index targets.
  const fills: { startIndex: number; text: string }[] = []

  params.lineItems.forEach((item, i) => {
    const cells = (tableRows[i + 1].tableCells as AnyObj[])
    const body  = item.description ? `${item.title}\n\n${item.description}` : item.title
    fills.push({ startIndex: cellFirstParaStart(cells[0]), text: body })
    fills.push({ startIndex: cellFirstParaStart(cells[1]), text: String(item.quantity) })
    fills.push({ startIndex: cellFirstParaStart(cells[2]), text: fmtNum(item.amount * item.quantity) })
  })

  totals.forEach((row, i) => {
    const cells = (tableRows[params.lineItems.length + i + 1].tableCells as AnyObj[])
    fills.push({ startIndex: cellFirstParaStart(cells[0]), text: row.label })
    fills.push({ startIndex: cellFirstParaStart(cells[2]), text: fmtNum(row.amount) })
  })

  fills.sort((a, b) => b.startIndex - a.startIndex)
  await docsBatch(docId, token, fills.map(f => ({
    insertText: { location: { index: f.startIndex }, text: f.text },
  })))

  // 9. Apply bold/italic formatting (needs a fresh GET after text insertion)
  const docForStyle  = await docsGet(docId, token)
  const styledRows   = (findTable(docForStyle).table.tableRows as AnyObj[])
  const styleReqs: unknown[] = []

  params.lineItems.forEach((item, i) => {
    const cells = (styledRows[i + 1].tableCells as AnyObj[])
    const cell0 = cells[0]

    // Title paragraph → bold
    const titlePara  = cell0.content[0].paragraph
    const titleStart = titlePara.elements[0].startIndex as number
    styleReqs.push({
      updateTextStyle: {
        range: { startIndex: titleStart, endIndex: titleStart + item.title.length },
        textStyle: { bold: true, italic: false },
        fields: 'bold,italic',
      },
    })

    // Description paragraph → plain (content[2] because content[1] is the blank spacer paragraph)
    if (item.description && cell0.content[2]) {
      const descPara  = cell0.content[2].paragraph
      const descStart = descPara.elements[0].startIndex as number
      styleReqs.push({
        updateTextStyle: {
          range: { startIndex: descStart, endIndex: descStart + item.description.length },
          textStyle: { bold: false, italic: false },
          fields: 'bold,italic',
        },
      })
    }
  })

  totals.forEach((row, i) => {
    if (!row.bold) return
    const cells  = (styledRows[params.lineItems.length + i + 1].tableCells as AnyObj[])
    const label0 = cellFirstParaStart(cells[0])
    const amt2   = cellFirstParaStart(cells[2])
    const amtStr = fmtNum(row.amount)
    styleReqs.push({
      updateTextStyle: {
        range: { startIndex: label0, endIndex: label0 + row.label.length },
        textStyle: { bold: true },
        fields: 'bold',
      },
    })
    styleReqs.push({
      updateTextStyle: {
        range: { startIndex: amt2, endIndex: amt2 + amtStr.length },
        textStyle: { bold: true },
        fields: 'bold',
      },
    })
  })

  await docsBatch(docId, token, styleReqs)

  // 10. Merge cells[0]+cells[1] for each totals row so the label spans Description+Quantity
  await docsBatch(docId, token, totals.map((_, i) => ({
    mergeTableCells: {
      tableRange: {
        tableCellLocation: {
          tableStartLocation: { index: tableStartIndex },
          rowIndex: params.lineItems.length + i + 1,
          columnIndex: 0,
        },
        rowSpan: 1,
        columnSpan: 2,
      },
    },
  })))

  // 11. Log to Invoices sheet
  await logInvoice(token, {
    invoiceNo, date: invoiceDate,
    clientName: params.clientName, clientEmail: params.clientEmail,
    clientContact: params.clientContact, templateType: params.templateType,
    invoiceType: params.invoiceType, amount: amtPayable, docUrl,
    lineItems: params.lineItems,
  })

  return { invoiceNo, docUrl }
}
