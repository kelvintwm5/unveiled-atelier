import { useEffect, useState } from 'react'
import {
  clientLabels, listArchivedClients, listClients, listReminders, restoreClient, updateClientStage,
} from '../lib/clientData'
import { formatDate, todaySgt } from '../lib/dates'
import { dueReminders } from '../lib/reminderDigest'
import ClientProfileModal, { STAGES } from '../components/ClientProfileModal'
import type { Client, ClientReminder, ClientStage, VeilType } from '../types'

const ALL_FILTER = 'All' as const
const DELETED_FILTER = 'Deleted' as const
type Filter = typeof ALL_FILTER | typeof DELETED_FILTER | ClientStage

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

function byDate(a: ClientReminder, b: ClientReminder): number {
  return a.remindOn.localeCompare(b.remindOn)
}

interface Props {
  mode: 'demo' | 'app'
}

export default function PipelineView({ mode }: Props) {
  const [clients, setClients]       = useState<Client[]>([])
  const [archived, setArchived]     = useState<Client[]>([])
  const [reminders, setReminders]   = useState<ClientReminder[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [filter, setFilter]         = useState<Filter>(ALL_FILTER)
  // null: closed. { client: null }: adding. { client }: viewing that client.
  const [profile, setProfile]       = useState<{ client: Client | null } | null>(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    Promise.all([listClients(mode), listArchivedClients(mode), listReminders(mode)])
      .then(([c, a, r]) => { setClients(c); setArchived(a); setReminders(r) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [mode])

  const today = todaySgt()
  const labels = clientLabels(clients)
  const due = dueReminders(reminders, today)
  const showingDeleted = filter === DELETED_FILTER
  const filtered = filter === ALL_FILTER ? clients : clients.filter(c => c.stage === filter)

  // Optimistic: the card moves straight away and moves back if the save fails.
  async function handleStageChange(clientId: string, oldStage: ClientStage, newStage: ClientStage) {
    setActionError('')
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, stage: newStage } : c))
    try {
      await updateClientStage(mode, clientId, newStage)
    } catch (e: unknown) {
      setClients(prev => prev.map(c => c.id === clientId ? { ...c, stage: oldStage } : c))
      setActionError(e instanceof Error ? e.message : 'Failed to change the stage.')
    }
  }

  function handleSaved(saved: Client) {
    setClients(prev => prev.some(c => c.id === saved.id)
      ? prev.map(c => c.id === saved.id ? saved : c)
      : [...prev, saved])
    setProfile(null)
  }

  function handleDeleted(client: Client) {
    setClients(prev => prev.filter(c => c.id !== client.id))
    setArchived(prev => [client, ...prev])
    setReminders(prev => prev.filter(r => r.clientId !== client.id))
    setProfile(null)
  }

  async function handleRestore(client: Client) {
    setActionError('')
    try {
      await restoreClient(mode, client.id)
      setArchived(prev => prev.filter(c => c.id !== client.id))
      setClients(prev => [...prev, client])
      // A restored client's reminders were left out of the last load.
      setReminders(await listReminders(mode))
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed to restore the client.')
    }
  }

  function openClient(clientId: string) {
    const client = clients.find(c => c.id === clientId)
    if (client) setProfile({ client })
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
            onClick={() => setProfile({ client: null })}
            className="shrink-0 px-4 py-2 bg-rose-800 text-white text-sm rounded-lg
                       hover:bg-rose-700 transition-colors"
          >
            + Add Client
          </button>
        </div>

        {/* Stage filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-6">
          {([ALL_FILTER, ...STAGES, DELETED_FILTER] as Filter[]).map(s => {
            const count = s === ALL_FILTER ? clients.length
              : s === DELETED_FILTER ? archived.length
              : clients.filter(c => c.stage === s).length
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
        {actionError && <p className="text-rose-600 text-sm mb-4">{actionError}</p>}

        {/* Reminders due */}
        {!loading && !error && !showingDeleted && due.length > 0 && (
          <section className="bg-rose-50 border border-rose-100 rounded-xl p-4 mb-6">
            <h2 className="text-xs font-semibold text-rose-800 uppercase tracking-wider mb-2">
              Reminders due ({due.length})
            </h2>
            <ul>
              {due.map(r => (
                <li key={r.id}>
                  <button
                    onClick={() => openClient(r.clientId)}
                    className="w-full text-left py-1.5 text-sm text-stone-700 hover:text-rose-800 transition-colors"
                  >
                    <span className="font-medium">{labels.get(r.clientId) ?? 'Unknown client'}</span>
                    <span className="break-words">: {r.note}</span>
                    {r.remindOn < today && (
                      <span className="text-xs text-rose-700"> (overdue, {formatDate(r.remindOn)})</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Client cards */}
        {!loading && !error && showingDeleted && (
          archived.length === 0 ? (
            <div className="text-center py-16 text-stone-400 text-sm">No deleted clients.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {archived.map(client => (
                <div key={client.id} className="bg-white border border-stone-200 rounded-xl p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-medium text-stone-800 leading-tight break-words">{client.name}</h3>
                    <p className="text-xs text-stone-400 mt-1">{client.stage} · {client.veilType}</p>
                  </div>
                  <button
                    onClick={() => handleRestore(client)}
                    className="shrink-0 px-3 py-1.5 text-xs font-medium text-stone-600 border border-stone-200
                               rounded-lg hover:bg-stone-50 transition-colors"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )
        )}

        {!loading && !error && !showingDeleted && (
          filtered.length === 0 ? (
            <div className="text-center py-16 text-stone-400 text-sm">
              No clients in this stage.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(client => (
                <ClientCard
                  key={client.id}
                  client={client}
                  nextReminder={reminders.filter(r => r.clientId === client.id).sort(byDate)[0]}
                  today={today}
                  onStageChange={(newStage) => handleStageChange(client.id, client.stage, newStage)}
                  onOpen={() => setProfile({ client })}
                />
              ))}
            </div>
          )
        )}

      </div>

      {/* key: a different client must start from a fresh form, not the last one's */}
      {profile && (
        <ClientProfileModal
          key={profile.client?.id ?? 'new'}
          mode={mode}
          client={profile.client}
          reminders={reminders.filter(r => r.clientId === profile.client?.id).sort(byDate)}
          onClose={() => setProfile(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onReminderAdded={r => setReminders(prev => [...prev, r])}
          onReminderDone={id => setReminders(prev => prev.filter(r => r.id !== id))}
        />
      )}
    </div>
  )
}

function ClientCard({ client, nextReminder, today, onStageChange, onOpen }: {
  client: Client
  nextReminder: ClientReminder | undefined
  today: string
  onStageChange: (stage: ClientStage) => void
  onOpen: () => void
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
        {nextReminder && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            nextReminder.remindOn <= today ? 'bg-rose-100 text-rose-800' : 'bg-stone-100 text-stone-500'
          }`}>
            Reminder: {formatDate(nextReminder.remindOn)}
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

      <button
        onClick={onOpen}
        className="py-1 text-sm font-medium text-rose-800 hover:text-rose-700 transition-colors"
      >
        View details
      </button>
    </div>
  )
}
