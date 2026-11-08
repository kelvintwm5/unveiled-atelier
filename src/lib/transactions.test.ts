import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewTransaction, Transaction } from '../types'

// A stand-in for the Supabase client that records each step, because the order of
// upload, save and clean-up is the behaviour being tested.
const db = vi.hoisted(() => ({
  steps: [] as string[],
  uploadError: null as { message: string } | null,
  removeError: null as { message: string } | null,
  removeThrows: false,
  rowResult: { data: null as unknown, error: null as { message: string } | null },
  written: null as Record<string, unknown> | null,
  uploadedPath: '',
  uploadOptions: null as Record<string, unknown> | null,
  filterId: '',
}))

vi.mock('./supabase', () => ({
  getSupabase: () => ({
    from: () => {
      const query = {
        insert(row: Record<string, unknown>) { db.steps.push('insert'); db.written = row; return query },
        update(row: Record<string, unknown>) { db.steps.push('update'); db.written = row; return query },
        delete() { db.steps.push('delete'); return query },
        eq(_column: string, id: string) { db.filterId = id; return query },
        select() { return query },
        single() { return query },
        then(resolve: (r: typeof db.rowResult) => void) { resolve(db.rowResult) },
      }
      return query
    },
    storage: {
      from: () => ({
        upload: async (path: string, _file: File, options: Record<string, unknown>) => {
          db.steps.push('upload')
          db.uploadedPath = path
          db.uploadOptions = options
          return { error: db.uploadError }
        },
        remove: async (paths: string[]) => {
          db.steps.push(`remove ${paths[0]}`)
          if (db.removeThrows) throw new Error('network down')
          return { error: db.removeError }
        },
        createSignedUrl: async (path: string, seconds: number) => ({
          data: { signedUrl: `https://signed/${path}?t=${seconds}` }, error: null,
        }),
      }),
    },
  }),
}))

import {
  createTransaction, deleteTransaction, getAttachmentUrl, updateTransaction, validateAttachment,
} from './transactions'

const INPUT: NewTransaction = {
  date: '2026-11-08', type: 'Expense', description: 'Lace', category: 'Cost of Goods', amount: 42.5,
  paymentMethod: 'PayNow', clientName: '', clientId: '', referenceNo: '', notes: '',
}

const ROW = {
  id: 'tx-1', transaction_date: '2026-11-08', type: 'Expense', amount: '42.50', category: 'Cost of Goods',
  description: 'Lace', payment_method: 'PayNow', client_name: null, client_id: null, reference_no: null,
  notes: null, attachment_path: null, attachment_name: null,
}

const WITH_FILE: Transaction = { ...INPUT, id: 'tx-1', attachment: { path: 'old.jpg', name: 'receipt.jpg' } }
const WITHOUT_FILE: Transaction = { ...INPUT, id: 'tx-1' }

const photo = () => new File(['x'], 'IMG 0001.JPG', { type: 'image/jpeg' })

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  db.steps = []
  db.uploadError = null
  db.removeError = null
  db.removeThrows = false
  db.rowResult = { data: [ROW], error: null }
  db.written = null
  db.uploadedPath = ''
  db.uploadOptions = null
  db.filterId = ''
})

describe('validateAttachment', () => {
  const file = (name: string, type: string, size = 1000) => ({ name, type, size })

  it('accepts photos and PDFs', () => {
    expect(validateAttachment(file('a.jpg', 'image/jpeg'))).toBeNull()
    expect(validateAttachment(file('a.png', 'image/png'))).toBeNull()
    expect(validateAttachment(file('a.webp', 'image/webp'))).toBeNull()
    expect(validateAttachment(file('a.heic', 'image/heic'))).toBeNull()
    expect(validateAttachment(file('a.pdf', 'application/pdf'))).toBeNull()
  })

  it('falls back to the extension when the browser reports no type', () => {
    expect(validateAttachment(file('IMG.HEIC', ''))).toBeNull()
    expect(validateAttachment(file('notes', ''))).toMatch(/photo or a PDF/)
  })

  it('refuses types that can carry scripts, and office files', () => {
    expect(validateAttachment(file('a.svg', 'image/svg+xml'))).toMatch(/photo or a PDF/)
    expect(validateAttachment(file('a.html', 'text/html'))).toMatch(/photo or a PDF/)
    expect(validateAttachment(file('a.docx', 'application/msword'))).toMatch(/photo or a PDF/)
  })

  it('enforces the size limit at exactly 10 MB', () => {
    expect(validateAttachment(file('a.jpg', 'image/jpeg', 10 * 1024 * 1024))).toBeNull()
    expect(validateAttachment(file('a.jpg', 'image/jpeg', 10 * 1024 * 1024 + 1))).toMatch(/over 10 MB/)
  })

  it('refuses an empty file', () => {
    expect(validateAttachment(file('a.jpg', 'image/jpeg', 0))).toMatch(/empty/)
  })
})

describe('createTransaction', () => {
  beforeEach(() => { db.rowResult = { data: ROW, error: null } })

  it('saves without touching Storage when there is no file', async () => {
    await createTransaction('app', INPUT)
    expect(db.steps).toEqual(['insert'])
    expect(db.written).toMatchObject({ attachment_path: null, attachment_name: null })
  })

  it('uploads first, under a random name, and records the original name', async () => {
    await createTransaction('app', INPUT, photo())
    expect(db.steps).toEqual(['upload', 'insert'])
    expect(db.uploadedPath).toMatch(/^[0-9a-f-]{36}\.jpg$/)
    expect(db.uploadOptions).toMatchObject({ contentType: 'image/jpeg', upsert: false })
    expect(db.written).toMatchObject({ attachment_path: db.uploadedPath, attachment_name: 'IMG 0001.JPG' })
  })

  it('saves no row when the upload fails', async () => {
    db.uploadError = { message: 'too big' }
    await expect(createTransaction('app', INPUT, photo())).rejects.toThrow(/Couldn't upload IMG 0001.JPG: too big/)
    expect(db.steps).toEqual(['upload'])
  })

  it('removes the uploaded file when the row fails to save', async () => {
    db.rowResult = { data: null, error: { message: 'boom' } }
    await expect(createTransaction('app', INPUT, photo())).rejects.toThrow(/Couldn't save the transaction: boom/)
    expect(db.steps).toEqual(['upload', 'insert', `remove ${db.uploadedPath}`])
  })

  it('refuses a bad file before uploading anything', async () => {
    const bad = new File(['x'], 'a.svg', { type: 'image/svg+xml' })
    await expect(createTransaction('app', INPUT, bad)).rejects.toThrow(/photo or a PDF/)
    expect(db.steps).toEqual([])
  })
})

describe('updateTransaction', () => {
  it('updates the right row', async () => {
    await updateTransaction('app', WITHOUT_FILE, INPUT, { kind: 'keep' })
    expect(db.steps).toEqual(['update'])
    expect(db.filterId).toBe('tx-1')
  })

  it('leaves the file columns out entirely when keeping the file', async () => {
    await updateTransaction('app', WITH_FILE, INPUT, { kind: 'keep' })
    expect(db.steps).toEqual(['update'])
    expect(db.written).not.toHaveProperty('attachment_path')
    expect(db.written).not.toHaveProperty('attachment_name')
  })

  it('clears the columns before deleting the old file', async () => {
    await updateTransaction('app', WITH_FILE, INPUT, { kind: 'remove' })
    expect(db.steps).toEqual(['update', 'remove old.jpg'])
    expect(db.written).toMatchObject({ attachment_path: null, attachment_name: null })
  })

  it('replaces in the safe order: upload, save, remove the old file', async () => {
    await updateTransaction('app', WITH_FILE, INPUT, { kind: 'replace', file: photo() })
    expect(db.steps).toEqual(['upload', 'update', 'remove old.jpg'])
    expect(db.written).toMatchObject({ attachment_path: db.uploadedPath, attachment_name: 'IMG 0001.JPG' })
  })

  it('adds a first file with nothing to clean up', async () => {
    await updateTransaction('app', WITHOUT_FILE, INPUT, { kind: 'replace', file: photo() })
    expect(db.steps).toEqual(['upload', 'update'])
  })

  it('keeps the old file and row when the upload fails', async () => {
    db.uploadError = { message: 'offline' }
    await expect(updateTransaction('app', WITH_FILE, INPUT, { kind: 'replace', file: photo() })).rejects.toThrow(/offline/)
    expect(db.steps).toEqual(['upload'])
  })

  it('keeps the old file and removes the new one when the row fails to save', async () => {
    db.rowResult = { data: null, error: { message: 'boom' } }
    await expect(updateTransaction('app', WITH_FILE, INPUT, { kind: 'replace', file: photo() }))
      .rejects.toThrow(/Couldn't save your changes: boom/)
    expect(db.steps).toEqual(['upload', 'update', `remove ${db.uploadedPath}`])
  })

  it('reports a row that no longer exists, and keeps its file', async () => {
    db.rowResult = { data: [], error: null }
    await expect(updateTransaction('app', WITH_FILE, INPUT, { kind: 'remove' })).rejects.toThrow(/no longer exists/)
    expect(db.steps).toEqual(['update'])
  })

  it('still counts as saved when removing the old file fails', async () => {
    db.removeError = { message: 'nope' }
    await expect(updateTransaction('app', WITH_FILE, INPUT, { kind: 'remove' })).resolves.toMatchObject({ id: 'tx-1' })
    db.removeThrows = true
    await expect(updateTransaction('app', WITH_FILE, INPUT, { kind: 'remove' })).resolves.toMatchObject({ id: 'tx-1' })
  })

  it('applies the same checks as adding', async () => {
    await expect(updateTransaction('app', WITHOUT_FILE, { ...INPUT, amount: 0 }, { kind: 'keep' })).rejects.toThrow(/more than zero/)
    await expect(updateTransaction('app', WITHOUT_FILE, { ...INPUT, amount: 1.005 }, { kind: 'keep' })).rejects.toThrow(/2 decimal/)
    await expect(updateTransaction('app', WITHOUT_FILE, { ...INPUT, description: '  ' }, { kind: 'keep' })).rejects.toThrow(/Description/)
    expect(db.steps).toEqual([])
  })

  it('maps the file back onto the returned transaction', async () => {
    db.rowResult = { data: [{ ...ROW, attachment_path: 'a.pdf', attachment_name: 'Bill.pdf' }], error: null }
    const saved = await updateTransaction('app', WITHOUT_FILE, INPUT, { kind: 'keep' })
    expect(saved.attachment).toEqual({ path: 'a.pdf', name: 'Bill.pdf' })
  })
})

describe('deleteTransaction', () => {
  it('deletes the row, then its file', async () => {
    db.rowResult = { data: [{ id: 'tx-1', attachment_path: 'old.jpg' }], error: null }
    await deleteTransaction('app', 'tx-1')
    expect(db.steps).toEqual(['delete', 'remove old.jpg'])
  })

  it('leaves Storage alone when the row had no file', async () => {
    db.rowResult = { data: [{ id: 'tx-1', attachment_path: null }], error: null }
    await deleteTransaction('app', 'tx-1')
    expect(db.steps).toEqual(['delete'])
  })

  it('keeps the file when the row could not be deleted', async () => {
    db.rowResult = { data: null, error: { message: 'boom' } }
    await expect(deleteTransaction('app', 'tx-1')).rejects.toThrow(/boom/)
    expect(db.steps).toEqual(['delete'])
  })
})

describe('getAttachmentUrl', () => {
  it('asks for a link that expires in 5 minutes', async () => {
    await expect(getAttachmentUrl('app', { path: 'a.jpg', name: 'r.jpg' })).resolves.toBe('https://signed/a.jpg?t=300')
  })
})

describe('demo mode', () => {
  it('refuses every write and touches nothing', async () => {
    await expect(createTransaction('demo', INPUT, photo())).rejects.toThrow(/read-only/)
    await expect(updateTransaction('demo', WITH_FILE, INPUT, { kind: 'remove' })).rejects.toThrow(/read-only/)
    await expect(deleteTransaction('demo', 'tx-1')).rejects.toThrow(/read-only/)
    await expect(getAttachmentUrl('demo', { path: 'a.jpg', name: 'r.jpg' })).rejects.toThrow(/read-only/)
    expect(db.steps).toEqual([])
  })
})
