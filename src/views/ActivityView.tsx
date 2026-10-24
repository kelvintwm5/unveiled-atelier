import { useEffect, useState } from 'react'
import { listClients, listActivities, createActivity, clientLabels } from '../lib/clientData'
import { todaySgt } from '../lib/dates'
import type { Client, ClientActivity, ActivityType, NewActivity } from '../types'

const ACTIVITY_TYPES: ActivityType[] = ['Call', 'WhatsApp', 'Email', 'In-Person', 'Note']

const TYPE_COLORS: Record<ActivityType, string> = {
  Call:        'bg-blue-100 text-blue-700',
  WhatsApp:    'bg-green-100 text-green-700',
  Email:       'bg-purple-100 text-purple-700',
  'In-Person': 'bg-amber-100 text-amber-700',
  Note:        'bg-stone-100 text-stone-500',
}

const inputCls = [
  'w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800',
  'focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent',
  'placeholder:text-stone-300 bg-white',
].join(' ')

const ALL_CLIENTS = 'All'

// A function, not a constant: computed at module load, "today" would go stale in
// a tab left open overnight.
function emptyForm(): NewActivity {
  return { date: todaySgt(), clientId: '', type: 'Call', notes: '', nextFollowUp: '' }
}

interface Props {
  mode: 'demo' | 'app'
}

export default function ActivityView({ mode }: Props) {
  const [clients, setClients]         = useState<Client[]>([])
  const [activities, setActivities]   = useState<ClientActivity[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [clientFilter, setClientFilter] = useState(ALL_CLIENTS)
  const [showModal, setShowModal]     = useState(false)
  const [form, setForm]               = useState(emptyForm)
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    Promise.all([listClients(mode), listActivities(mode)])
      .then(([c, a]) => { setClients(c); setActivities(a) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [mode])

  const today = todaySgt()
  const labels = clientLabels(clients)
  const sortedClients = [...clients].sort((a, b) =>
    (labels.get(a.id) ?? '').localeCompare(labels.get(b.id) ?? ''))

  const filtered = (clientFilter === ALL_CLIENTS ? activities : activities.filter(a => a.clientId === clientFilter))
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))

  function openModal() {
    setForm(emptyForm())
    setSaveError('')
    setShowModal(true)
  }

  async function handleLog() {
    if (!form.clientId) { setSaveError('Select a client.'); return }
    if (!form.notes.trim()) { setSaveError('Notes are required.'); return }
    setSaving(true)
    setSaveError('')
    try {
      const activity = await createActivity(mode, form)
      setActivities(prev => [...prev, activity])
      setShowModal(false)
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-stone-800">Activity</h1>
            <p className="text-sm text-stone-500 mt-1">
              {filtered.length} entr{filtered.length !== 1 ? 'ies' : 'y'}.
              {mode === 'demo' && <span className="ml-2 text-amber-600">Demo — changes apply this session only</span>}
            </p>
          </div>
          <button
            onClick={openModal}
            className="shrink-0 px-4 py-2 bg-rose-800 text-white text-sm rounded-lg
                       hover:bg-rose-700 transition-colors"
          >
            + Log Activity
          </button>
        </div>

        {/* Client filter */}
        <div className="mb-6">
          <select
            value={clientFilter}
            onChange={e => setClientFilter(e.target.value)}
            className="border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 bg-white
                       focus:outline-none focus:ring-2 focus:ring-rose-300"
          >
            <option value={ALL_CLIENTS}>All clients</option>
            {sortedClients.map(c => <option key={c.id} value={c.id}>{labels.get(c.id)}</option>)}
          </select>
        </div>

        {loading && <p className="text-stone-400 text-sm">Loading…</p>}
        {error && <p className="text-rose-600 text-sm">{error}</p>}

        {/* Activity timeline */}
        {!loading && !error && (
          filtered.length === 0 ? (
            <div className="text-center py-16 text-stone-400 text-sm">
              No activity logged yet.
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(a => (
                <ActivityRow
                  key={a.id}
                  activity={a}
                  clientName={labels.get(a.clientId) ?? 'Unknown client'}
                  today={today}
                />
              ))}
            </div>
          )
        )}

      </div>

      {/* Log Activity modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-stone-100">
              <h2 className="text-lg font-semibold text-stone-800">Log Activity</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <Field label="Date">
                <input className={inputCls} type="date" value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </Field>
              <Field label="Client *">
                <select className={inputCls} value={form.clientId}
                  onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}>
                  <option value="">Select client…</option>
                  {sortedClients.map(c => <option key={c.id} value={c.id}>{labels.get(c.id)}</option>)}
                </select>
              </Field>
              <Field label="Type">
                <select className={inputCls} value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as ActivityType }))}>
                  {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Notes *">
                <textarea className={`${inputCls} resize-none`} rows={3} value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="What was discussed or actioned?" />
              </Field>
              <Field label="Next Follow-up Date">
                <input className={inputCls} type="date" value={form.nextFollowUp}
                  onChange={e => setForm(f => ({ ...f, nextFollowUp: e.target.value }))} />
              </Field>
              {saveError && <p className="text-rose-600 text-sm">{saveError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-stone-100 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-stone-600 hover:text-stone-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLog}
                disabled={saving}
                className="px-5 py-2 bg-rose-800 text-white text-sm rounded-lg
                           hover:bg-rose-700 transition-colors disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Log Activity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ActivityRow({ activity: a, clientName, today }: {
  activity: ClientActivity
  clientName: string
  today: string
}) {
  const overdue = a.nextFollowUp && a.nextFollowUp <= today
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 text-center min-w-[3.5rem]">
          <p className="text-xs text-stone-400">{a.date}</p>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-medium text-stone-800">{clientName}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[a.type]}`}>
              {a.type}
            </span>
          </div>
          <p className="text-sm text-stone-600 leading-relaxed">{a.notes}</p>
          {a.nextFollowUp && (
            <p className={`text-xs mt-1.5 font-medium ${overdue ? 'text-rose-600' : 'text-stone-400'}`}>
              Follow up: {a.nextFollowUp}{overdue ? ' — overdue' : ''}
            </p>
          )}
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
