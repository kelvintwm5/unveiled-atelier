import { useState } from 'react'
import { saveService, deleteService } from '../lib/invoices'
import { formatSGD } from '../lib/money'
import type { InvoiceService } from '../types'

interface Props {
  mode: 'demo' | 'app'
  services: InvoiceService[]
  onChanged: (services: InvoiceService[]) => void
}

// Standard services Esther picks from when adding a line item. Each saves on its
// own, separately from the settings form. Picking one copies it into the invoice,
// so changing a service here never changes an invoice.
export default function ServiceLibrary({ mode, services, onChanged }: Props) {
  // 'new' while adding, a service id while editing that service, null otherwise.
  const [editing, setEditing]         = useState<string | null>(null)
  const [title, setTitle]             = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice]             = useState('')
  const [busy, setBusy]               = useState(false)
  const [error, setError]             = useState<string | null>(null)

  function startEdit(service: InvoiceService | null) {
    setEditing(service?.id ?? 'new')
    setTitle(service?.title ?? '')
    setDescription(service?.description ?? '')
    setPrice(service?.defaultAmount?.toString() ?? '')
    setError(null)
  }

  async function handleSave() {
    setBusy(true)
    setError(null)
    try {
      const id = editing === 'new' ? null : editing
      const saved = await saveService(mode, id, {
        title,
        description,
        defaultAmount: price.trim() === '' ? null : Number(price),
      })
      onChanged(id ? services.map(s => (s.id === id ? saved : s)) : [...services, saved])
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(service: InvoiceService) {
    const ok = window.confirm(
      `Delete the service "${service.title}"? Invoices that already use it keep their wording.`,
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await deleteService(mode, service.id)
      onChanged(services.filter(s => s.id !== service.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const form = (
    <div className="bg-white border border-rose-200 rounded-xl p-4 space-y-3">
      <label className="block">
        <span className="block text-xs font-medium text-stone-500 mb-1.5">Title (bold on the invoice)</span>
        <input
          type="text" value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Chapel-length veil rental"
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-stone-500 mb-1.5">Description (optional)</span>
        <textarea
          value={description} rows={3}
          onChange={e => setDescription(e.target.value)}
          placeholder="- Ivory tulle&#10;- Includes steaming before collection"
          className={`${inputCls} resize-y`}
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-stone-500 mb-1.5">Standard price in SGD (optional)</span>
        <input
          type="number" inputMode="decimal" min={0.01} step={0.01} value={price}
          onChange={e => setPrice(e.target.value)}
          placeholder="Leave empty if priced case by case"
          className={inputCls}
        />
      </label>
      <div className="flex gap-3">
        <button
          type="button" onClick={handleSave} disabled={busy}
          className="flex-1 py-2.5 bg-rose-800 hover:bg-rose-700 text-white text-sm font-medium rounded-xl
                     transition-colors disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save Service'}
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
      <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1">Service Library</h3>
      <p className="text-xs text-stone-400 mb-3">
        Services with standard wording. On an invoice, “Choose a saved service” fills in the line
        item, and you can still change it there. Changing a service here never changes an invoice.
      </p>

      <div className="space-y-2">
        {services.length === 0 && editing !== 'new' && (
          <p className="text-sm text-stone-400">No saved services yet.</p>
        )}
        {services.map(s => editing === s.id ? <div key={s.id}>{form}</div> : (
          <div key={s.id} className="bg-white border border-stone-200 rounded-xl px-4 py-3 flex gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-800">{s.title}</p>
              {s.description && <p className="text-sm text-stone-500 whitespace-pre-line line-clamp-3">{s.description}</p>}
              <p className="text-xs text-stone-400 mt-0.5">
                {s.defaultAmount === null ? 'Priced case by case' : formatSGD(s.defaultAmount)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <button
                type="button" onClick={() => startEdit(s)} disabled={busy || editing !== null}
                className="text-xs text-rose-800 hover:text-rose-900 underline disabled:opacity-40"
              >
                Edit
              </button>
              <button
                type="button" onClick={() => handleDelete(s)} disabled={busy || editing !== null}
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
          Add service
        </button>
      )}
    </section>
  )
}

const inputCls = `w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800
  bg-white focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent
  placeholder:text-stone-300`
