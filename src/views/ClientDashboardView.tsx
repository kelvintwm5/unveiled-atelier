import { useEffect, useState } from 'react'
import { fetchClients, fetchActivities } from '../lib/clientData'
import type { Client, ClientActivity, ClientStage } from '../types'

const STAGE_ORDER: ClientStage[] = ['Inquiry', 'Consultation', 'Fitting', 'Confirmed', 'Completed', 'Lost']

const STAGE_COLORS: Record<ClientStage, string> = {
  Inquiry:      'bg-sky-100 text-sky-700',
  Consultation: 'bg-violet-100 text-violet-700',
  Fitting:      'bg-amber-100 text-amber-700',
  Confirmed:    'bg-emerald-100 text-emerald-700',
  Completed:    'bg-stone-100 text-stone-500',
  Lost:         'bg-red-100 text-red-400',
}

const TYPE_COLORS: Record<string, string> = {
  Call:        'bg-blue-100 text-blue-700',
  WhatsApp:    'bg-green-100 text-green-700',
  Email:       'bg-purple-100 text-purple-700',
  'In-Person': 'bg-amber-100 text-amber-700',
  Note:        'bg-stone-100 text-stone-500',
}

interface Props {
  mode: 'demo' | 'app'
  accessToken?: string
}

export default function ClientDashboardView({ mode, accessToken }: Props) {
  const [clients, setClients]     = useState<Client[]>([])
  const [activities, setActivities] = useState<ClientActivity[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchClients(mode, accessToken), fetchActivities(mode, accessToken)])
      .then(([c, a]) => { setClients(c); setActivities(a) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [mode, accessToken])

  if (loading) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-stone-400 text-sm">Loading client data…</p>
    </div>
  )

  if (error) return (
    <div className="h-full flex items-center justify-center px-8">
      <div className="text-center max-w-sm">
        <p className="text-rose-600 font-medium mb-1">Could not load client data</p>
        <p className="text-stone-400 text-sm">{error}</p>
        <p className="text-stone-400 text-xs mt-3">
          Make sure "Clients" and "Activity" tabs exist in your Google Sheet.
        </p>
      </div>
    </div>
  )

  const today = new Date().toISOString().split('T')[0]
  const in30  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const active   = clients.filter(c => c.stage !== 'Completed' && c.stage !== 'Lost')
  const upcoming = clients.filter(c => c.weddingDate >= today && c.weddingDate <= in30)

  const needsFollowUp = active.filter(c => {
    const latest = activities
      .filter(a => a.clientName === c.name)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    return latest?.nextFollowUp && latest.nextFollowUp <= today
  })

  const stageCounts = STAGE_ORDER.map(s => ({
    stage: s,
    count: clients.filter(c => c.stage === s).length,
  }))

  const recentActivities = [...activities]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)

  const stats = [
    { label: 'Active Clients',     value: active.length,        sub: 'in pipeline'    },
    { label: 'Upcoming Weddings',  value: upcoming.length,      sub: 'within 30 days', accent: upcoming.length > 0 },
    { label: 'Need Follow-up',     value: needsFollowUp.length, sub: 'overdue',        accent: needsFollowUp.length > 0 },
    { label: 'Total Clients',      value: clients.length,       sub: 'all time'       },
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        <div>
          <h1 className="text-2xl font-semibold text-stone-800">Client Dashboard</h1>
          <p className="text-sm text-stone-500 mt-1">
            Pipeline overview and recent activity.
            {mode === 'demo' && <span className="ml-2 text-amber-600">Demo data</span>}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map(s => (
            <div key={s.label} className="bg-white border border-stone-200 rounded-xl p-4">
              <p className="text-xs text-stone-500 uppercase tracking-wider mb-1">{s.label}</p>
              <p className={`text-3xl font-semibold ${s.accent ? 'text-rose-700' : 'text-stone-800'}`}>
                {s.value}
              </p>
              <p className="text-xs text-stone-400 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Pipeline stage counts */}
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-5">Pipeline</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
            {stageCounts.map(({ stage, count }) => (
              <div key={stage} className="text-center">
                <p className="text-2xl font-semibold text-stone-800 mb-1">{count}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_COLORS[stage]}`}>
                  {stage}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-5">Recent Activity</h2>
          {recentActivities.length === 0 ? (
            <p className="text-stone-400 text-sm">No activity logged yet.</p>
          ) : (
            <div className="space-y-4">
              {recentActivities.map((a, i) => (
                <div key={i} className="flex gap-4 items-start">
                  <p className="text-xs text-stone-400 w-20 shrink-0 pt-0.5">{a.date}</p>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-stone-800">{a.clientName}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[a.type] ?? 'bg-stone-100 text-stone-500'}`}>
                        {a.type}
                      </span>
                    </div>
                    <p className="text-sm text-stone-500 line-clamp-2">{a.notes}</p>
                    {a.nextFollowUp && (
                      <p className={`text-xs mt-0.5 ${a.nextFollowUp <= today ? 'text-rose-600 font-medium' : 'text-stone-400'}`}>
                        Follow up: {a.nextFollowUp}
                        {a.nextFollowUp <= today && ' — overdue'}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
