import { useEffect, useState } from 'react'
import { fetchClients, appendClient, updateClientStage } from '../lib/clientData'
import type { Client, ClientStage, VeilType } from '../types'

const STAGES: ClientStage[] = ['Inquiry', 'Consultation', 'Fitting', 'Confirmed', 'Completed', 'Lost']
const VEIL_TYPES: VeilType[] = ['Rental', 'Bespoke Veil', 'Bespoke Rental', 'TBD']
const ALL_FILTER = 'All' as const
type Filter = typeof ALL_FILTER | ClientStage

const STAGE_COLORS: Record<ClientStage, string> = {
  Inquiry:      'bg-sky-100 text-sky-700 border-sky-200',
  Consultation: 'bg-violet-100 text-violet-700 border-violet-200',
  Fitting:      'bg-amber-100 text-amber-700 border-amber-200',
  Confirmed:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  Completed:    'bg-stone-100 text-stone-500 border-stone-200',
  Lost:         'bg-red-100 text-red-400 border-red-200',
}

const VEIL_COLORS: Record<VeilType, string> = {
  'Rental':         'bg-rose-50 text-rose-700',
  'Bespoke Veil':   'bg-fuchsia-50 text-fuchsia-700',
  'Bespoke Rental': 'bg-orange-50 text-orange-700',
  'TBD':            'bg-stone-50 text-stone-400',
}

const inputCls = [
  'w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800',
  'focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent',
  'placeholder:text-stone-300 bg-white',
].join(' ')

const EMPTY_FORM: Omit<Client, 'budget'> & { budget: string } = {
  name: '', email: '', phone: '', weddingDate: '',
  veilType: 'TBD', budget: '', stage: 'Inquiry', notes: '',
}

interface Props {
  mode: 'demo' | 'app'
  accessToken?: string
}

export default function PipelineView({ mode, accessToken }: Props) {
  const [clients, setClients]       = useState<Client[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [filter, setFilter]         = useState<Filter>(ALL_FILTER)
  const [showModal, setShowModal]   = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState('')

  useEffect(() => {
    setLoading(true)
    fetchClients(mode, accessToken)
      .then(setClients)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [mode, accessToken])

  const filtered = filter === ALL_FILTER ? clients : clients.filter(c => c.stage === filter)

  async function handleStageChange(clientName: string, oldStage: ClientStage, newStage: ClientStage) {
    setClients(prev => prev.map(c => c.name === clientName ? { ...c, stage: newStage } : c))
    if (mode !== 'app' || !accessToken) return
    try {
      await updateClientStage(accessToken, clientName, newStage)
    } catch {
      setClients(prev => prev.map(c => c.name === clientName ? { ...c, stage: oldStage } : c))
    }
  }

  async function handleAddClient() {
    if (!form.name.trim()) { setSaveError('Name is required.'); return }
    setSaving(true)
    setSaveError('')
    const client: Client = {
      ...form,
      name:   form.name.trim(),
      budget: parseFloat(form.budget) || 0,
    }
    try {
      if (mode === 'app' && accessToken) await appendClient(accessToken, client)
      setClients(prev => [...prev, client])
      setShowModal(false)
      setForm(EMPTY_FORM)
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-stone-800">Pipeline</h1>
            <p className="text-sm text-stone-500 mt-1">
              {clients.length} client{clients.length !== 1 ? 's' : ''} total.
              {mode === 'demo' && <span className="ml-2 text-amber-600">Demo — changes apply this session only</span>}
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="shrink-0 px-4 py-2 bg-rose-800 text-white text-sm rounded-lg
                       hover:bg-rose-700 transition-colors"
          >
            + Add Client
          </button>
        </div>

        {/* Stage filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-6">
          {([ALL_FILTER, ...STAGES] as Filter[]).map(s => {
            const count = s === ALL_FILTER ? clients.length : clients.filter(c => c.stage === s).length
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={[
                  'shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                  filter === s
                    ? 'bg-rose-800 text-white'
                    : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50',
                ].join(' ')}
              >
                {s} <span className="opacity-60">({count})</span>
              </button>
            )
          })}
        </div>

        {loading && <p className="text-stone-400 text-sm">Loading…</p>}
        {error && <p className="text-rose-600 text-sm">{error}</p>}

        {/* Client cards */}
        {!loading && !error && (
          filtered.length === 0 ? (
            <div className="text-center py-16 text-stone-400 text-sm">
              No clients in this stage.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(client => (
                <ClientCard
                  key={client.name}
                  client={client}
                  onStageChange={(newStage) => handleStageChange(client.name, client.stage, newStage)}
                />
              ))}
            </div>
          )
        )}

      </div>

      {/* Add Client modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-stone-100">
              <h2 className="text-lg font-semibold text-stone-800">Add Client</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <Field label="Name *">
                <input className={inputCls} value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Rachel Tan" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Email">
                  <input className={inputCls} type="email" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="email@example.com" />
                </Field>
                <Field label="Phone">
                  <input className={inputCls} value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+65 9123 4567" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Wedding Date">
                  <input className={inputCls} type="date" value={form.weddingDate}
                    onChange={e => setForm(f => ({ ...f, weddingDate: e.target.value }))} />
                </Field>
                <Field label="Budget (SGD)">
                  <input className={inputCls} type="number" min="0" step="10"
                    value={form.budget}
                    onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                    placeholder="0" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Veil Type">
                  <select className={inputCls} value={form.veilType}
                    onChange={e => setForm(f => ({ ...f, veilType: e.target.value as VeilType }))}>
                    {VEIL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Stage">
                  <select className={inputCls} value={form.stage}
                    onChange={e => setForm(f => ({ ...f, stage: e.target.value as ClientStage }))}>
                    {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Notes">
                <textarea className={`${inputCls} resize-none`} rows={3} value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Veil preferences, fitting notes, etc." />
              </Field>
              {saveError && <p className="text-rose-600 text-sm">{saveError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-stone-100 flex justify-end gap-3">
              <button
                onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setSaveError('') }}
                className="px-4 py-2 text-sm text-stone-600 hover:text-stone-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddClient}
                disabled={saving}
                className="px-5 py-2 bg-rose-800 text-white text-sm rounded-lg
                           hover:bg-rose-700 transition-colors disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Add Client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ClientCard({ client, onStageChange }: {
  client: Client
  onStageChange: (stage: ClientStage) => void
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-stone-800 leading-tight">{client.name}</h3>
        <select
          value={client.stage}
          onChange={e => onStageChange(e.target.value as ClientStage)}
          className={`shrink-0 text-xs border rounded-lg px-2 py-1 font-medium cursor-pointer
                      focus:outline-none focus:ring-1 focus:ring-rose-300
                      ${STAGE_COLORS[client.stage]}`}
        >
          {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${VEIL_COLORS[client.veilType]}`}>
          {client.veilType}
        </span>
        {client.weddingDate && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-stone-50 text-stone-500">
            {client.weddingDate}
          </span>
        )}
        {client.budget > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-stone-50 text-stone-500 font-mono">
            S${client.budget.toLocaleString()}
          </span>
        )}
      </div>

      {client.notes && (
        <p className="text-xs text-stone-400 line-clamp-2 leading-relaxed">{client.notes}</p>
      )}

      {(client.email || client.phone) && (
        <div className="text-xs text-stone-400 space-y-0.5">
          {client.email && <p>{client.email}</p>}
          {client.phone && <p>{client.phone}</p>}
        </div>
      )}
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
