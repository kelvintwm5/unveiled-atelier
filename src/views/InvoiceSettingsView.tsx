import { useState } from 'react'
import { updateInvoiceSettings, saveClause, deleteClause } from '../lib/invoices'
import type { InvoiceClause, InvoiceSettings } from '../types'

interface Props {
  mode: 'demo' | 'app'
  settings: InvoiceSettings
  clauses: InvoiceClause[]
  onBack: () => void
  onSaved: (settings: InvoiceSettings) => void
  onClausesChanged: (clauses: InvoiceClause[]) => void
}

// Text fields, in the order they appear. Multi-line ones get a textarea.
const BUSINESS_FIELDS: { key: keyof InvoiceSettings; label: string; placeholder: string; multiline?: boolean }[] = [
  { key: 'businessName',    label: 'Business name',     placeholder: 'Unveiled Atelier' },
  { key: 'address',         label: 'Address',           placeholder: 'Street, unit\nSingapore postal code', multiline: true },
  { key: 'email',           label: 'Email',             placeholder: 'hello@…' },
  { key: 'phone',           label: 'Phone',             placeholder: '+65 …' },
  { key: 'paynow',          label: 'PayNow (UEN or mobile)', placeholder: 'e.g. 53xxxxxxxA' },
  { key: 'bankName',        label: 'Bank',              placeholder: 'e.g. DBS' },
  { key: 'bankAccountName', label: 'Account name',      placeholder: 'Name on the account' },
  { key: 'bankAccountNo',   label: 'Account number',    placeholder: '000-000000-0' },
]

// Business details and default terms. These are data Esther edits, not code: an
// invoice copies them when it's drafted (terms) or issued (business details), so
// changing them here never alters an invoice that was already sent.
export default function InvoiceSettingsView({ mode, settings, clauses, onBack, onSaved, onClausesChanged }: Props) {
  const [form, setForm]     = useState<InvoiceSettings>(settings)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [saved, setSaved]   = useState(false)

  function set(key: keyof InvoiceSettings, value: string) {
    setForm(f => ({ ...f, [key]: value }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const next = await updateInvoiceSettings(mode, form)
      setForm(next)
      setSaved(true)
      onSaved(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-4 md:px-8 md:py-6 border-b border-stone-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            aria-label="Back to invoices"
            className="text-stone-400 hover:text-stone-700 transition-colors -ml-1 p-1 shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h2 className="text-xl font-semibold text-stone-800">Invoice Settings</h2>
            <p className="text-stone-400 text-sm mt-0.5">
              {mode === 'demo' ? 'Sample details. Changes last until you reload.' : 'Printed on every new invoice'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-6">
        <div className="max-w-2xl space-y-6">
          <section>
            <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Business Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {BUSINESS_FIELDS.map(f => (
                <label key={f.key} className={f.multiline ? 'sm:col-span-2 block' : 'block'}>
                  <span className="block text-xs font-medium text-stone-500 mb-1.5">{f.label}</span>
                  {f.multiline ? (
                    <textarea
                      value={form[f.key]} rows={2}
                      onChange={e => set(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className={`${inputCls} resize-y`}
                    />
                  ) : (
                    <input
                      type="text" value={form[f.key]}
                      onChange={e => set(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className={inputCls}
                    />
                  )}
                </label>
              ))}
            </div>
            <p className="text-xs text-stone-400 mt-2">
              Issued invoices keep the details they were issued with.
            </p>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Default Terms</h3>
            <div className="space-y-3">
              <label className="block">
                <span className="block text-xs font-medium text-stone-500 mb-1.5">Rental invoices</span>
                <textarea
                  value={form.defaultTermsRental} rows={5}
                  onChange={e => set('defaultTermsRental', e.target.value)}
                  className={`${inputCls} resize-y`}
                />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-stone-500 mb-1.5">Bespoke invoices</span>
                <textarea
                  value={form.defaultTermsBespoke} rows={5}
                  onChange={e => set('defaultTermsBespoke', e.target.value)}
                  className={`${inputCls} resize-y`}
                />
              </label>
            </div>
            <p className="text-xs text-stone-400 mt-2">
              A new draft starts with these, and each invoice's terms can then be edited.
              Lines starting with “- ” print as bullets.
            </p>
          </section>

          {error && <p className="text-red-600 text-sm">{error}</p>}
          {saved && !error && <p className="text-emerald-700 text-sm">Settings saved.</p>}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-rose-800 hover:bg-rose-700 text-white font-medium text-sm rounded-xl
                       transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>

          <ClauseLibrary mode={mode} clauses={clauses} onChanged={onClausesChanged} />
        </div>
      </div>
    </div>
  )
}

// ─── Clause library ────────────────────────────────────────────────────────────

// Reusable wording Esther can insert into an invoice's line descriptions, note or
// terms. Each clause saves on its own, separately from the settings above.
function ClauseLibrary({ mode, clauses, onChanged }: {
  mode: 'demo' | 'app'
  clauses: InvoiceClause[]
  onChanged: (clauses: InvoiceClause[]) => void
}) {
  // 'new' while adding, a clause id while editing that clause, null otherwise.
  const [editing, setEditing] = useState<string | null>(null)
  const [title, setTitle]     = useState('')
  const [body, setBody]       = useState('')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState<string | null>(null)

  function startEdit(clause: InvoiceClause | null) {
    setEditing(clause?.id ?? 'new')
    setTitle(clause?.title ?? '')
    setBody(clause?.body ?? '')
    setError(null)
  }

  async function handleSave() {
    setBusy(true)
    setError(null)
    try {
      const id = editing === 'new' ? null : editing
      const saved = await saveClause(mode, id, { title, body })
      onChanged(id ? clauses.map(c => (c.id === id ? saved : c)) : [...clauses, saved])
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(clause: InvoiceClause) {
    const ok = window.confirm(
      `Delete the clause "${clause.title}"? Invoices that already use its wording keep it.`,
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await deleteClause(mode, clause.id)
      onChanged(clauses.filter(c => c.id !== clause.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const form = (
    <div className="bg-white border border-rose-200 rounded-xl p-4 space-y-3">
      <label className="block">
        <span className="block text-xs font-medium text-stone-500 mb-1.5">Title (only you see this)</span>
        <input
          type="text" value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Late return fee"
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-stone-500 mb-1.5">Wording (printed on the invoice)</span>
        <textarea
          value={body} rows={3}
          onChange={e => setBody(e.target.value)}
          placeholder="- Late returns are charged S$20 per day."
          className={`${inputCls} resize-y`}
        />
      </label>
      <div className="flex gap-3">
        <button
          type="button" onClick={handleSave} disabled={busy}
          className="flex-1 py-2.5 bg-rose-800 hover:bg-rose-700 text-white text-sm font-medium rounded-xl
                     transition-colors disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save Clause'}
        </button>
        <button
          type="button" onClick={() => setEditing(null)} disabled={busy}
          className="flex-1 py-2.5 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 text-sm
                     font-medium rounded-xl transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )

  return (
    <section className="pt-6 border-t border-stone-200">
      <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1">Clause Library</h3>
      <p className="text-xs text-stone-400 mb-3">
        Wording you reuse. On an invoice, “Insert clause” copies it into a line description,
        the note or the terms, so changing a clause here never changes an invoice.
      </p>

      <div className="space-y-2">
        {clauses.length === 0 && editing !== 'new' && (
          <p className="text-sm text-stone-400">No clauses yet.</p>
        )}
        {clauses.map(c => editing === c.id ? <div key={c.id}>{form}</div> : (
          <div key={c.id} className="bg-white border border-stone-200 rounded-xl px-4 py-3 flex gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-800">{c.title}</p>
              <p className="text-sm text-stone-500 whitespace-pre-line line-clamp-3">{c.body}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <button
                type="button" onClick={() => startEdit(c)} disabled={busy || editing !== null}
                className="text-xs text-rose-800 hover:text-rose-900 underline disabled:opacity-40"
              >
                Edit
              </button>
              <button
                type="button" onClick={() => handleDelete(c)} disabled={busy || editing !== null}
                className="text-xs text-stone-400 hover:text-red-600 underline disabled:opacity-40"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {editing === 'new' && form}
      </div>

      {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

      {editing === null && (
        <button
          type="button" onClick={() => startEdit(null)}
          className="mt-3 flex items-center gap-1.5 text-sm text-rose-700 hover:text-rose-900 font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add clause
        </button>
      )}
    </section>
  )
}

const inputCls = `w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800
  bg-white focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent
  placeholder:text-stone-300`
