import { useState } from 'react'
import { archiveClient, createClient, updateClient } from '../lib/clientData'
import type { Client, ClientStage, NewClient, VeilType } from '../types'

export const STAGES: ClientStage[] = ['Inquiry', 'Consultation', 'Fitting', 'Confirmed', 'Completed', 'Lost']
const VEIL_TYPES: VeilType[] = ['Rental', 'Bespoke Veil', 'Bespoke Rental', 'TBD']

const inputCls = [
  'w-full min-w-0 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800',
  'focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent',
  'placeholder:text-stone-300 bg-white',
].join(' ')

// The form holds the budget as typed; it only becomes a number on save.
type ClientForm = Omit<NewClient, 'budget'> & { budget: string }

function formFor(client: Client | null): ClientForm {
  if (!client) {
    return {
      name: '', email: '', phone: '', weddingDate: '', veilType: 'TBD', budget: '',
      stage: 'Inquiry', notes: '', activityNotes: '',
    }
  }
  const { id: _id, ...fields } = client
  return { ...fields, budget: client.budget > 0 ? String(client.budget) : '' }
}

// Tall enough to read a long note without scrolling inside a small box on a phone.
function rowsFor(text: string, min: number): number {
  const lines = text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 45)), 0)
  return Math.min(Math.max(min, lines), 12)
}

interface Props {
  mode: 'demo' | 'app'
  client: Client | null    // null adds a new client
  onClose: () => void
  onSaved: (client: Client) => void
  onDeleted: (client: Client) => void
}

export default function ClientProfileModal({ mode, client, onClose, onSaved, onDeleted }: Props) {
  const [form, setForm]                   = useState(() => formFor(client))
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]           = useState(false)

  function set<K extends keyof ClientForm>(key: K, value: ClientForm[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError('')
    const input: NewClient = { ...form, budget: parseFloat(form.budget) || 0 }
    try {
      onSaved(client ? await updateClient(mode, client.id, input) : await createClient(mode, input))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save.')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!client) return
    setDeleting(true)
    setError('')
    try {
      await archiveClient(mode, client.id)
      onDeleted(client)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete.')
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-stone-100">
          <h2 className="text-lg font-semibold text-stone-800">{client ? client.name : 'Add Client'}</h2>
        </div>

        <div className="px-6 py-5 space-y-4">
          <Field label="Name *">
            <input className={inputCls} value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Rachel Tan" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Email">
              <input className={inputCls} type="email" value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="email@example.com" />
            </Field>
            <Field label="Phone">
              <input className={inputCls} type="tel" value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="+65 9123 4567" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Wedding Date">
              <input className={inputCls} type="date" value={form.weddingDate}
                onChange={e => set('weddingDate', e.target.value)} />
            </Field>
            <Field label="Budget (SGD)">
              <input className={inputCls} type="number" min="0" step="10"
                value={form.budget}
                onChange={e => set('budget', e.target.value)}
                placeholder="0" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Veil Type">
              <select className={inputCls} value={form.veilType}
                onChange={e => set('veilType', e.target.value as VeilType)}>
                {VEIL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Stage">
              <select className={inputCls} value={form.stage}
                onChange={e => set('stage', e.target.value as ClientStage)}>
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Notes">
            <textarea className={`${inputCls} resize-none`} rows={rowsFor(form.notes, 3)} value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Veil preferences, fitting notes, etc." />
          </Field>
          <Field label="Activity">
            <textarea className={`${inputCls} resize-none`} rows={rowsFor(form.activityNotes, 3)} value={form.activityNotes}
              onChange={e => set('activityNotes', e.target.value)}
              placeholder="More details about this client's activity" />
          </Field>
          {error && <p className="text-rose-600 text-sm">{error}</p>}
        </div>

        {client && (
          <div className="px-6 py-4 border-t border-stone-100">
            {confirmDelete ? (
              <div className="space-y-3">
                <p className="text-sm text-stone-700">
                  Delete {client.name}? They'll disappear from the app, but their invoices and
                  transactions are kept. You can restore them from the Deleted tab.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-4 py-2 bg-red-700 text-white text-sm rounded-lg
                               hover:bg-red-600 transition-colors disabled:opacity-40"
                  >
                    {deleting ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className="px-4 py-2 text-sm text-stone-600 hover:text-stone-800 transition-colors"
                  >
                    Keep client
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="py-1 text-sm text-red-700 hover:text-red-600 transition-colors"
              >
                Delete client
              </button>
            )}
          </div>
        )}

        <div className="px-6 py-4 border-t border-stone-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-stone-600 hover:text-stone-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-rose-800 text-white text-sm rounded-lg
                       hover:bg-rose-700 transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving…' : client ? 'Save changes' : 'Add Client'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-stone-600 mb-1.5">{label}</label>
      {children}
    </div>
  )
}
