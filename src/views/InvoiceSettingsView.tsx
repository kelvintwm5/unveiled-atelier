import { useState } from 'react'
import { updateInvoiceSettings } from '../lib/invoices'
import type { InvoiceSettings } from '../types'

interface Props {
  mode: 'demo' | 'app'
  settings: InvoiceSettings
  onBack: () => void
  onSaved: (settings: InvoiceSettings) => void
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
export default function InvoiceSettingsView({ mode, settings, onBack, onSaved }: Props) {
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
        </div>
      </div>
    </div>
  )
}

const inputCls = `w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800
  bg-white focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent
  placeholder:text-stone-300`
