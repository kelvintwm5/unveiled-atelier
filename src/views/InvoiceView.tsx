import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listInvoices, getInvoiceSettings, saveDraft, deleteDraft, issueInvoice, voidInvoice,
  startReplacement, blankDraft, toDraft, finalFromDeposit, defaultTerms, issueProblem,
  draftTotals, depositsAwaitingFinal, replacementOf, payableOf, storeIssuedPdf, getIssuedPdf,
} from '../lib/invoices'
import { lineTotal, calcSubtotal } from '../lib/invoiceTotals'
import { renderFromDraft } from '../lib/invoiceRender'
import { renderInvoicePdf, openPdf } from '../lib/invoicePdf'
import { listClients, clientLabels } from '../lib/clientData'
import { formatSGD } from '../lib/money'
import { formatDate, todaySgt } from '../lib/dates'
import InvoiceSettingsView from './InvoiceSettingsView'
import type {
  Client, Invoice, InvoiceDraft, InvoiceKind, InvoiceLine, InvoiceSettings, InvoiceTemplate,
} from '../types'

interface Props {
  mode: 'demo' | 'app'
}

// Which screen is showing. The editor keeps its own copy of the draft while
// Esther types; nothing is saved until she taps Save or Issue.
// editKey stays the same across saves, so the editor isn't reset when a new
// draft gets its id.
type Screen =
  | { name: 'list' }
  | { name: 'edit'; editKey: string; id: string | null; draft: InvoiceDraft }
  | { name: 'show'; id: string; notice?: string }
  | { name: 'settings' }

// The live preview sits beside the form only where there's room for both. On a
// phone, Preview opens the PDF in its own tab instead: iOS Safari shows only the
// first page of a PDF inside a page.
const WIDE_SCREEN = '(min-width: 1024px)'

const EMPTY_LINE = (): InvoiceLine => ({ title: '', description: '', quantity: 1, unitAmount: 0 })

const TEMPLATE_LABEL: Record<InvoiceTemplate, string> = { rental: 'Rental', bespoke: 'Bespoke' }
const KIND_LABEL: Record<InvoiceKind, string> = { deposit: 'Deposit', final: 'Final' }

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export default function InvoiceView({ mode }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [settings, setSettings] = useState<InvoiceSettings | null>(null)
  const [clients, setClients]   = useState<Client[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [screen, setScreen]     = useState<Screen>({ name: 'list' })

  function reload(): Promise<void> {
    setError(null)
    return Promise.all([listInvoices(mode), getInvoiceSettings(mode), listClients(mode)])
      .then(([inv, s, c]) => { setInvoices(inv); setSettings(s); setClients(c) })
      .catch(e => setError(errorText(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { setLoading(true); reload() }, [mode])

  // notice: a message to show on the invoice once it opens (e.g. a PDF that
  // couldn't be stored).
  async function openSaved(inv: Invoice, notice?: string) {
    await reload()
    setScreen(s => inv.status === 'draft'
      ? { name: 'edit', editKey: s.name === 'edit' ? s.editKey : inv.id, id: inv.id, draft: toDraft(inv) }
      : { name: 'show', id: inv.id, notice })
  }

  function open(inv: Invoice) {
    setScreen(inv.status === 'draft'
      ? { name: 'edit', editKey: inv.id, id: inv.id, draft: toDraft(inv) }
      : { name: 'show', id: inv.id })
  }

  if (loading || !settings) {
    return (
      <div className="h-full flex flex-col">
        <Header title="Invoices" />
        <div className="px-4 py-6 md:px-8 text-sm">
          {error
            ? <p className="text-red-600">{error}</p>
            : <p className="text-stone-400">Loading invoices…</p>}
        </div>
      </div>
    )
  }

  if (screen.name === 'settings') {
    return (
      <InvoiceSettingsView
        mode={mode}
        settings={settings}
        onBack={() => setScreen({ name: 'list' })}
        onSaved={setSettings}
      />
    )
  }

  if (screen.name === 'edit') {
    return (
      <DraftEditor
        key={screen.editKey}
        mode={mode}
        id={screen.id}
        initial={screen.draft}
        invoices={invoices}
        clients={clients}
        settings={settings}
        onBack={() => { setScreen({ name: 'list' }); reload() }}
        onSaved={openSaved}
        onDeleted={() => { setScreen({ name: 'list' }); reload() }}
      />
    )
  }

  if (screen.name === 'show') {
    const inv = invoices.find(i => i.id === screen.id)
    if (inv) {
      return (
        <IssuedInvoice
          key={inv.id}
          mode={mode}
          invoice={inv}
          invoices={invoices}
          notice={screen.notice}
          onBack={() => setScreen({ name: 'list' })}
          onOpen={open}
          onChanged={openSaved}
        />
      )
    }
  }

  return (
    <InvoiceList
      mode={mode}
      invoices={invoices}
      error={error}
      onNew={() => setScreen({ name: 'edit', editKey: `new-${Date.now()}`, id: null, draft: blankDraft(settings) })}
      onOpen={open}
      onSettings={() => setScreen({ name: 'settings' })}
    />
  )
}

// ─── List ──────────────────────────────────────────────────────────────────────

function InvoiceList({ mode, invoices, error, onNew, onOpen, onSettings }: {
  mode: 'demo' | 'app'
  invoices: Invoice[]
  error: string | null
  onNew: () => void
  onOpen: (inv: Invoice) => void
  onSettings: () => void
}) {
  return (
    <div className="h-full flex flex-col">
      <Header
        title="Invoices"
        subtitle={mode === 'demo' ? 'Sample invoices. Drafts you make here vanish on reload.' : 'Newest first'}
        action={
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onSettings}
              aria-label="Invoice settings"
              title="Business details and default terms"
              className="text-stone-500 hover:text-rose-800 border border-stone-200 hover:border-rose-300
                         rounded-lg p-1.5 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={onNew}
              className="flex items-center gap-1.5 bg-rose-800 hover:bg-rose-700 text-white text-sm
                         font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New
            </button>
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-6">
        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        {invoices.length === 0 ? (
          <p className="text-sm text-stone-400">No invoices yet. Tap New to start a draft.</p>
        ) : (
          <ul className="max-w-2xl bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
            {invoices.map(inv => {
              const replacement = replacementOf(invoices, inv.id)
              return (
                <li key={inv.id}>
                  <button
                    onClick={() => onOpen(inv)}
                    className="w-full text-left px-4 py-3 hover:bg-stone-50 transition-colors
                               flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={[
                          'text-sm font-medium',
                          inv.status === 'void' ? 'text-stone-400 line-through' : 'text-stone-800',
                        ].join(' ')}>
                          {inv.invoiceNo || 'Draft'}
                        </span>
                        <StatusBadge status={inv.status} />
                      </div>
                      <p className="text-sm text-stone-600 truncate">{inv.clientName || 'No client yet'}</p>
                      <p className="text-xs text-stone-400">
                        {TEMPLATE_LABEL[inv.template]} · {KIND_LABEL[inv.kind]}
                        {inv.issuedOn && ` · ${formatDate(inv.issuedOn)}`}
                        {inv.status === 'void' && replacement?.invoiceNo && ` · replaced by ${replacement.invoiceNo}`}
                        {inv.status === 'issued' && replacement?.status === 'draft' && ' · replacement drafted'}
                      </p>
                    </div>
                    <span className="text-sm text-stone-700 shrink-0">{formatSGD(payableOf(inv))}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

// ─── Draft editor ──────────────────────────────────────────────────────────────

function DraftEditor({ mode, id, initial, invoices, clients, settings, onBack, onSaved, onDeleted }: {
  mode: 'demo' | 'app'
  id: string | null
  initial: InvoiceDraft
  invoices: Invoice[]
  clients: Client[]
  settings: InvoiceSettings
  onBack: () => void
  onSaved: (inv: Invoice, notice?: string) => Promise<void>
  onDeleted: () => void
}) {
  const [draft, setDraft] = useState<InvoiceDraft>(initial)
  const [busy, setBusy]   = useState<'save' | 'issue' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pdfLink, setPdfLink] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ open: boolean; url: string | null; error: string | null }>(
    { open: false, url: null, error: null },
  )
  // The current preview's blob: URL. Each one holds a whole PDF in memory until
  // it's revoked, so the old one is freed whenever a new one replaces it.
  const previewUrl = useRef<string | null>(null)

  const labels   = useMemo(() => clientLabels(clients), [clients])
  const replaces = invoices.find(i => i.id === draft.replacesInvoiceId)
  // The linked deposit stays selectable even once a final settles it (this one).
  const deposits = useMemo(() => {
    const open = depositsAwaitingFinal(invoices)
    const linked = invoices.find(i => i.id === draft.depositInvoiceId)
    return linked && !open.includes(linked) ? [linked, ...open] : open
  }, [invoices, draft.depositInvoiceId])

  const subtotal = calcSubtotal(draft.lines)
  const totals   = draftTotals(draft)
  const noPaymentDetails = !settings.paynow.trim() && !settings.bankAccountNo.trim()

  // While the side preview is open, redraw it a moment after typing stops. The
  // pause keeps it from redrawing on every keystroke.
  useEffect(() => {
    if (!preview.open) return
    let cancelled = false
    const timer = setTimeout(() => {
      renderInvoicePdf(renderFromDraft(draft, settings, todaySgt(), invoices))
        .then(blob => {
          if (cancelled) return
          if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
          const url = URL.createObjectURL(blob)
          previewUrl.current = url
          setPreview(p => ({ ...p, url, error: null }))
        })
        .catch(err => { if (!cancelled) setPreview(p => ({ ...p, error: errorText(err) })) })
    }, 600)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [preview.open, draft, settings, invoices])

  // Frees the last preview when the editor closes.
  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current) }, [])

  async function handlePreview() {
    setError(null)
    if (window.matchMedia(WIDE_SCREEN).matches) {
      setPreview(p => ({ ...p, open: !p.open }))
      return
    }
    try {
      setPdfLink(await openPdf(() => renderInvoicePdf(renderFromDraft(draft, settings, todaySgt(), invoices))))
    } catch (err) {
      setError(errorText(err))
    }
  }

  function update(patch: Partial<InvoiceDraft>) {
    setDraft(d => ({ ...d, ...patch }))
    setSaved(false)
  }

  // Switching template swaps in the other template's default terms, unless the
  // terms have been edited for this invoice.
  function setTemplate(template: InvoiceTemplate) {
    setDraft(d => ({
      ...d,
      template,
      terms: d.terms === defaultTerms(settings, d.template) ? defaultTerms(settings, template) : d.terms,
    }))
    setSaved(false)
  }

  function setKind(kind: InvoiceKind) {
    update(kind === 'deposit' ? { kind, depositInvoiceId: '', legacyDepositNo: '' } : { kind })
  }

  function pickDeposit(depositId: string) {
    const dep = invoices.find(i => i.id === depositId)
    if (dep) {
      setDraft(d => {
        const next = finalFromDeposit(d, dep)
        // The deposit may use the other template; unedited terms follow it, as in setTemplate.
        return d.terms === defaultTerms(settings, d.template)
          ? { ...next, terms: defaultTerms(settings, next.template) }
          : next
      })
      setSaved(false)
    } else {
      update({ depositInvoiceId: '' })
    }
  }

  function pickClient(clientId: string) {
    const c = clients.find(x => x.id === clientId)
    update(c
      ? { clientId: c.id, clientName: c.name, clientEmail: c.email, clientPhone: c.phone, weddingDate: c.weddingDate || draft.weddingDate }
      : { clientId: '' })
  }

  function updateLine(idx: number, patch: Partial<InvoiceLine>) {
    update({ lines: draft.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)) })
  }

  async function handleSave() {
    setBusy('save')
    setError(null)
    try {
      const inv = await saveDraft(mode, id, draft)
      setSaved(true)
      await onSaved(inv)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  async function handleIssue() {
    const problem = issueProblem(draft)
    if (problem) { setError(problem); return }
    const ok = window.confirm(
      `Issue this invoice for ${formatSGD(totals[totals.length - 1].amount)}?\n\n` +
      'It gets the next invoice number and can’t be edited afterwards. ' +
      (replaces ? `${replaces.invoiceNo} will be voided and replaced by it.` : 'To change it later, void and reissue it.'),
    )
    if (!ok) return
    setBusy('issue')
    setError(null)
    try {
      // Saved first, so the database issues exactly what's on screen.
      const savedDraft = await saveDraft(mode, id, draft)
      const issued = await issueInvoice(mode, savedDraft)
      // The invoice is issued from here on, whatever happens to the PDF. If
      // storing it fails, the issued screen says so and offers Save PDF again.
      try {
        await onSaved(await storeIssuedPdf(mode, issued, invoices))
      } catch (pdfErr) {
        await onSaved(issued, `${issued.invoiceNo} is issued, but its PDF wasn't stored: ${errorText(pdfErr)}`)
      }
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  async function handleDelete() {
    if (!id) { onBack(); return }
    if (!window.confirm('Delete this draft? This can’t be undone.')) return
    setBusy('delete')
    setError(null)
    try {
      await deleteDraft(mode, id)
      onDeleted()
    } catch (err) {
      setError(errorText(err))
      setBusy(null)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <Header
        title={id ? 'Edit draft' : 'New invoice'}
        subtitle="Drafts have no number until they're issued"
        onBack={onBack}
      />

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 overflow-y-auto px-4 py-5 md:px-8 md:py-6">
          <div className="max-w-2xl space-y-6">

            {mode === 'app' && noPaymentDetails && (
              <p className="text-sm bg-stone-100 border border-stone-200 text-stone-700 rounded-lg px-3 py-2">
                No PayNow or bank details yet, so invoices would go out without payment details.
                Add them under the settings button on the invoice list.
              </p>
            )}

            {replaces && (
              <p className="text-sm bg-rose-50 border border-rose-200 text-rose-900 rounded-lg px-3 py-2">
                Replaces {replaces.invoiceNo}. Issuing this voids {replaces.invoiceNo}; until then it stays valid.
              </p>
            )}

            <Section title="Invoice Type">
              <div className="grid grid-cols-2 gap-3">
                <SegmentGroup
                  label="Template"
                  options={[{ value: 'rental', label: 'Rental' }, { value: 'bespoke', label: 'Bespoke' }]}
                  value={draft.template}
                  onChange={v => setTemplate(v as InvoiceTemplate)}
                />
                <SegmentGroup
                  label="Invoice"
                  options={[{ value: 'deposit', label: '1st — Deposit' }, { value: 'final', label: '2nd — Final' }]}
                  value={draft.kind}
                  onChange={v => setKind(v as InvoiceKind)}
                />
              </div>
            </Section>

            {draft.kind === 'final' && (
              <Section title="Deposit Invoice">
                <div className="space-y-3">
                  <Field label="Settles deposit">
                    <select
                      value={draft.depositInvoiceId}
                      onChange={e => pickDeposit(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">From before the app, or none</option>
                      {deposits.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.invoiceNo} · {d.clientName} · {formatDate(d.issuedOn)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {draft.depositInvoiceId ? (
                    <p className="text-xs text-stone-400">
                      Client, dates and line items were copied from the deposit. You can still edit them.
                    </p>
                  ) : (
                    <Field label="Deposit invoice no. from before the app (optional)">
                      <input
                        type="text" value={draft.legacyDepositNo}
                        onChange={e => update({ legacyDepositNo: e.target.value })}
                        placeholder="e.g. UA-2026-1815"
                        className={inputCls}
                      />
                    </Field>
                  )}
                </div>
              </Section>
            )}

            <Section title="Client Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="From the client list (optional)" className="sm:col-span-2">
                  <select value={draft.clientId} onChange={e => pickClient(e.target.value)} className={inputCls}>
                    <option value="">Not in client list</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{labels.get(c.id)}</option>)}
                  </select>
                </Field>
                <Field label="Full Name *" className="sm:col-span-2">
                  <input
                    type="text" value={draft.clientName}
                    onChange={e => update({ clientName: e.target.value })}
                    placeholder="e.g. Sarah Lim"
                    className={inputCls}
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email" value={draft.clientEmail}
                    onChange={e => update({ clientEmail: e.target.value })}
                    placeholder="sarah@email.com"
                    className={inputCls}
                  />
                </Field>
                <Field label="Contact">
                  <input
                    type="text" value={draft.clientPhone}
                    onChange={e => update({ clientPhone: e.target.value })}
                    placeholder="+65 9123 4567"
                    className={inputCls}
                  />
                </Field>
                <DateField label="PWS Date" value={draft.pwsDate} onChange={v => update({ pwsDate: v })} />
                <DateField label="Wedding Date" value={draft.weddingDate} onChange={v => update({ weddingDate: v })} />
                <Field label="Note to client (optional, shown under the client details)" className="sm:col-span-2">
                  <textarea
                    value={draft.clientNote} rows={2}
                    onChange={e => update({ clientNote: e.target.value })}
                    placeholder="e.g. Design as discussed at the consultation on 3 Jan."
                    className={`${inputCls} resize-y`}
                  />
                </Field>
              </div>
            </Section>

            <Section title="Service Details">
              <div className="space-y-3">
                {draft.lines.map((line, idx) => (
                  <LineItemRow
                    key={idx}
                    line={line}
                    index={idx}
                    canRemove={draft.lines.length > 1}
                    onChange={patch => updateLine(idx, patch)}
                    onRemove={() => update({ lines: draft.lines.filter((_, i) => i !== idx) })}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => update({ lines: [...draft.lines, EMPTY_LINE()] })}
                  className="flex items-center gap-1.5 text-sm text-rose-700 hover:text-rose-900 transition-colors font-medium"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add line item
                </button>
              </div>
            </Section>

            {subtotal > 0 && (
              <Section title="Totals">
                <TotalsTable rows={totals} />
              </Section>
            )}

            <Section title="Terms">
              <textarea
                value={draft.terms} rows={5}
                onChange={e => update({ terms: e.target.value })}
                placeholder="No default terms yet for this template."
                className={`${inputCls} resize-y`}
              />
              <div className="flex flex-wrap justify-between gap-2 mt-1.5">
                <p className="text-xs text-stone-400">Lines starting with “- ” print as bullets.</p>
                {draft.terms !== defaultTerms(settings, draft.template) && (
                  <button
                    type="button"
                    onClick={() => update({ terms: defaultTerms(settings, draft.template) })}
                    className="text-xs text-rose-700 hover:text-rose-900 underline"
                  >
                    Reset to the {TEMPLATE_LABEL[draft.template].toLowerCase()} default
                  </button>
                )}
              </div>
            </Section>

            {error && <p className="text-red-600 text-sm">{error}</p>}
            {saved && !error && <p className="text-emerald-700 text-sm">Draft saved.</p>}

            <button
              type="button"
              onClick={handlePreview}
              className="w-full py-2.5 border border-rose-200 text-rose-800 hover:bg-rose-50 font-medium
                         text-sm rounded-xl transition-colors"
            >
              {preview.open ? 'Hide PDF Preview' : 'Preview PDF'}
            </button>
            {pdfLink && <BlockedTabLink url={pdfLink} />}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleIssue}
                disabled={busy !== null || mode === 'demo'}
                title={mode === 'demo' ? 'Sign in as Owner to issue invoices' : undefined}
                className="flex-1 py-3 bg-rose-800 hover:bg-rose-700 text-white font-medium text-sm rounded-xl
                           transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy === 'issue' ? 'Issuing…' : mode === 'demo' ? 'Sign in to Issue' : 'Issue Invoice'}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={busy !== null}
                className="flex-1 py-3 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700
                           font-medium text-sm rounded-xl transition-colors disabled:opacity-50"
              >
                {busy === 'save' ? 'Saving…' : 'Save Draft'}
              </button>
            </div>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy !== null}
              className="text-sm text-stone-400 hover:text-red-600 underline transition-colors disabled:opacity-50"
            >
              {id ? (busy === 'delete' ? 'Deleting…' : 'Delete draft') : 'Discard'}
            </button>
          </div>
        </div>

        {preview.open && (
          <div className="hidden lg:flex w-[46%] max-w-3xl shrink-0 flex-col border-l border-stone-200 bg-stone-100">
            <p className="px-4 py-2 text-xs text-stone-500 border-b border-stone-200 bg-white">
              Preview: updates as you type. Drafts carry a DRAFT watermark and no number.
            </p>
            {preview.error ? (
              <p className="p-4 text-sm text-red-600">{preview.error}</p>
            ) : preview.url ? (
              <iframe title="Invoice preview" src={preview.url} className="flex-1 w-full" />
            ) : (
              <p className="p-4 text-sm text-stone-400">Drawing the preview…</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Issued / void invoice ────────────────────────────────────────────────────

function IssuedInvoice({ mode, invoice, invoices, notice, onBack, onOpen, onChanged }: {
  mode: 'demo' | 'app'
  invoice: Invoice
  invoices: Invoice[]
  notice?: string
  onBack: () => void
  onOpen: (inv: Invoice) => void
  onChanged: (inv: Invoice) => Promise<void>
}) {
  const [busy, setBusy]             = useState(false)
  const [error, setError]           = useState<string | null>(notice ?? null)
  const [pdfBusy, setPdfBusy]       = useState<'open' | 'store' | null>(null)
  const [pdfLink, setPdfLink]       = useState<string | null>(null)
  const [voiding, setVoiding]       = useState(false)
  const [voidReason, setVoidReason] = useState('')

  const deposit     = invoices.find(i => i.id === invoice.depositInvoiceId)
  const replaces    = invoices.find(i => i.id === invoice.replacesInvoiceId)
  const replacement = replacementOf(invoices, invoice.id)
  const canAct      = mode === 'app' && invoice.status === 'issued'

  // The stored PDF if there is one; otherwise one drawn from the frozen record.
  async function handleOpenPdf() {
    setPdfBusy('open')
    setError(null)
    try {
      setPdfLink(await openPdf(() => getIssuedPdf(mode, invoice, invoices)))
    } catch (err) {
      setError(errorText(err))
    } finally {
      setPdfBusy(null)
    }
  }

  async function handleStorePdf() {
    setPdfBusy('store')
    setError(null)
    try {
      await onChanged(await storeIssuedPdf(mode, invoice, invoices))
    } catch (err) {
      setError(errorText(err))
    } finally {
      setPdfBusy(null)
    }
  }

  async function handleReissue() {
    // A replacement already drafted is reopened rather than duplicated.
    if (replacement?.status === 'draft') { onOpen(replacement); return }
    setBusy(true)
    setError(null)
    try {
      await onChanged(await startReplacement(mode, invoice))
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  async function handleVoid() {
    setBusy(true)
    setError(null)
    try {
      await onChanged(await voidInvoice(mode, invoice.id, voidReason))
      setVoiding(false)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <Header
        title={invoice.invoiceNo}
        subtitle={`${TEMPLATE_LABEL[invoice.template]} · ${KIND_LABEL[invoice.kind]} · issued ${formatDate(invoice.issuedOn)}`}
        onBack={onBack}
        action={<StatusBadge status={invoice.status} />}
      />

      <div className="flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-6">
        <div className="max-w-2xl space-y-6">

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleOpenPdf}
              disabled={pdfBusy !== null}
              className="flex items-center gap-1.5 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700
                         text-sm font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              {pdfBusy === 'open' ? 'Opening…' : 'View PDF'}
            </button>
            {mode === 'app' && !invoice.pdfPath && (
              <button
                onClick={handleStorePdf}
                disabled={pdfBusy !== null}
                className="bg-rose-800 hover:bg-rose-700 text-white text-sm font-medium px-4 py-2 rounded-xl
                           transition-colors disabled:opacity-50"
              >
                {pdfBusy === 'store' ? 'Saving PDF…' : 'Save PDF'}
              </button>
            )}
          </div>
          {pdfLink && <BlockedTabLink url={pdfLink} />}
          {mode === 'app' && !invoice.pdfPath && (
            <p className="text-sm text-red-700 -mt-3">
              The PDF for this invoice isn't stored yet. Save PDF makes it from the issued record.
            </p>
          )}

          {invoice.status === 'void' && (
            <p className="text-sm bg-stone-100 border border-stone-200 text-stone-700 rounded-lg px-3 py-2">
              Void since {formatDate(invoice.voidedAt.slice(0, 10))}
              {invoice.voidReason && `: ${invoice.voidReason}`}.
              {replacement?.invoiceNo && (
                <> Replaced by <LinkButton onClick={() => onOpen(replacement)}>{replacement.invoiceNo}</LinkButton>.</>
              )}
            </p>
          )}
          {(deposit || invoice.legacyDepositNo || replaces) && (
            <div className="text-sm text-stone-600 space-y-1">
              {deposit && <p>Settles deposit <LinkButton onClick={() => onOpen(deposit)}>{deposit.invoiceNo}</LinkButton></p>}
              {invoice.legacyDepositNo && <p>Settles deposit {invoice.legacyDepositNo} (from before the app)</p>}
              {replaces && <p>Replaces <LinkButton onClick={() => onOpen(replaces)}>{replaces.invoiceNo}</LinkButton></p>}
            </div>
          )}

          <Section title="Client">
            <div className="text-sm text-stone-700 space-y-0.5">
              <p className="font-medium">{invoice.clientName}</p>
              {invoice.clientEmail && <p>{invoice.clientEmail}</p>}
              {invoice.clientPhone && <p>{invoice.clientPhone}</p>}
              {invoice.pwsDate && <p className="text-stone-500">PWS Date: {formatDate(invoice.pwsDate)}</p>}
              {invoice.weddingDate && <p className="text-stone-500">Wedding Date: {formatDate(invoice.weddingDate)}</p>}
              {invoice.clientNote && <p className="text-stone-500 whitespace-pre-line pt-1">{invoice.clientNote}</p>}
            </div>
          </Section>

          <Section title="Service Details">
            <ul className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
              {invoice.lines.map((l, i) => (
                <li key={i} className="px-4 py-3 flex gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-stone-800">{l.title}</p>
                    {l.description && <p className="text-stone-500 whitespace-pre-line">{l.description}</p>}
                  </div>
                  <span className="text-stone-400 shrink-0">×{l.quantity}</span>
                  <span className="text-stone-700 shrink-0">{formatSGD(lineTotal(l))}</span>
                </li>
              ))}
            </ul>
          </Section>

          {/* The rows stored when it was issued, not recomputed: these are what the client was sent. */}
          {invoice.totals && (
            <Section title="Totals">
              <TotalsTable rows={invoice.totals} />
            </Section>
          )}

          {invoice.terms && (
            <Section title="Terms">
              <p className="text-sm text-stone-600 whitespace-pre-line">{invoice.terms}</p>
            </Section>
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}

          {invoice.status === 'issued' && (
            voiding ? (
              <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
                <Field label="Reason for voiding (optional)">
                  <input
                    type="text" value={voidReason}
                    onChange={e => setVoidReason(e.target.value)}
                    placeholder="e.g. Booking cancelled"
                    className={inputCls}
                  />
                </Field>
                <p className="text-xs text-stone-500">
                  The invoice is kept, marked void. Its number is never reused.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleVoid} disabled={busy}
                    className="flex-1 py-2.5 bg-red-700 hover:bg-red-800 text-white text-sm font-medium
                               rounded-xl transition-colors disabled:opacity-50"
                  >
                    {busy ? 'Voiding…' : `Void ${invoice.invoiceNo}`}
                  </button>
                  <button
                    onClick={() => setVoiding(false)} disabled={busy}
                    className="flex-1 py-2.5 bg-white border border-stone-300 text-stone-700 text-sm
                               font-medium rounded-xl hover:bg-stone-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleReissue}
                  disabled={busy || mode === 'demo'}
                  title={mode === 'demo' ? 'Sign in as Owner to change invoices' : undefined}
                  className="flex-1 py-3 bg-rose-800 hover:bg-rose-700 text-white font-medium text-sm
                             rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {replacement?.status === 'draft' ? 'Open the replacement draft' : 'Void & reissue…'}
                </button>
                <button
                  onClick={() => setVoiding(true)}
                  disabled={!canAct || busy}
                  title={mode === 'demo' ? 'Sign in as Owner to void invoices' : undefined}
                  className="flex-1 py-3 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700
                             font-medium text-sm rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Void without replacing
                </button>
              </div>
            )
          )}
          {invoice.status === 'issued' && !voiding && (
            <p className="text-xs text-stone-400">
              Void & reissue copies this invoice into a new draft. This one stays valid until the
              replacement is issued.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Header({ title, subtitle, onBack, action }: {
  title: string
  subtitle?: string
  onBack?: () => void
  action?: React.ReactNode
}) {
  return (
    <div className="px-4 py-4 md:px-8 md:py-6 border-b border-stone-200 bg-white shrink-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Back to invoices"
              className="text-stone-400 hover:text-stone-700 transition-colors -ml-1 p-1 shrink-0"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-stone-800 truncate">{title}</h2>
            {subtitle && <p className="text-stone-400 text-sm mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
    </div>
  )
}

// Shown when the browser refused to open the PDF in a new tab by itself. A
// link the user taps is allowed where an automatic pop-up isn't.
function BlockedTabLink({ url }: { url: string }) {
  return (
    <p className="text-sm text-stone-600">
      Your browser blocked the new tab.{' '}
      <a href={url} target="_blank" rel="noreferrer" className="text-rose-800 underline hover:text-rose-900">
        Open the PDF
      </a>
    </p>
  )
}

function StatusBadge({ status }: { status: Invoice['status'] }) {
  const style = {
    draft:  'bg-stone-100 text-stone-500',
    issued: 'bg-rose-50 text-rose-800',
    void:   'bg-red-50 text-red-700',
  }[status]
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${style}`}>
      {status === 'draft' ? 'Draft' : status === 'issued' ? 'Issued' : 'Void'}
    </span>
  )
}

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="text-rose-800 underline hover:text-rose-900">
      {children}
    </button>
  )
}

function TotalsTable({ rows }: { rows: { label: string; amount: number; bold: boolean }[] }) {
  return (
    <div className="bg-stone-50 rounded-xl border border-stone-200 divide-y divide-stone-200">
      {rows.map(row => (
        <div
          key={row.label}
          className={`flex justify-between gap-3 px-4 py-2.5 text-sm ${
            row.bold ? 'font-semibold text-stone-800' : 'text-stone-600'
          }`}
        >
          <span>{row.label}</span>
          <span className="shrink-0">{formatSGD(row.amount)}</span>
        </div>
      ))}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, children, className = '' }: {
  label: string; children: React.ReactNode; className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-stone-500 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function SegmentGroup({ label, options, value, onChange }: {
  label: string
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <p className="text-xs font-medium text-stone-500 mb-1.5">{label}</p>
      <div className="flex rounded-lg border border-stone-200 overflow-hidden">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={[
              'flex-1 py-2 text-xs font-medium transition-colors',
              value === opt.value ? 'bg-rose-800 text-white' : 'bg-white text-stone-600 hover:bg-stone-50',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// Optional dates: an empty input means "not printed on the invoice".
function DateField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void
}) {
  return (
    <Field label={`${label} (optional)`}>
      <div className="flex items-center gap-2">
        <input
          type="date" value={value}
          onChange={e => onChange(e.target.value)}
          className={`${inputCls} flex-1 min-w-0`}
        />
        {value && (
          <button
            type="button" onClick={() => onChange('')}
            aria-label={`Clear ${label}`}
            className="text-stone-300 hover:text-stone-600 transition-colors p-1 shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </Field>
  )
}

function LineItemRow({ line, index, canRemove, onChange, onRemove }: {
  line: InvoiceLine; index: number; canRemove: boolean
  onChange: (p: Partial<InvoiceLine>) => void; onRemove: () => void
}) {
  return (
    <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <span className="text-xs text-stone-400 font-medium pt-2.5 shrink-0">#{index + 1}</span>
        <div className="flex-1 min-w-0 grid grid-cols-2 gap-3">
          <Field label="Title (bold on the invoice) *" className="col-span-2">
            <input
              type="text" value={line.title}
              onChange={e => onChange({ title: e.target.value })}
              placeholder="e.g. Bespoke Veil Rental"
              className={inputCls}
            />
          </Field>
          <Field label="Description" className="col-span-2">
            <textarea
              value={line.description} rows={2}
              onChange={e => onChange({ description: e.target.value })}
              placeholder="e.g. Custom-made for client use. Lines starting with “- ” print as bullets."
              className={`${inputCls} resize-y`}
            />
          </Field>
          <Field label="Quantity">
            <input
              type="number" inputMode="numeric" min={1} step={1} value={line.quantity}
              onChange={e => onChange({ quantity: parseInt(e.target.value) || 1 })}
              className={inputCls}
            />
          </Field>
          <Field label="Amount each (SGD) *">
            <input
              type="number" inputMode="decimal" min={0.01} step={0.01} value={line.unitAmount || ''}
              onChange={e => onChange({ unitAmount: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
              className={inputCls}
            />
          </Field>
        </div>
        {canRemove && (
          <button
            type="button" onClick={onRemove}
            aria-label={`Remove line ${index + 1}`}
            className="text-stone-300 hover:text-red-400 transition-colors pt-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      {line.unitAmount > 0 && (
        <p className="text-xs text-stone-400 text-right">{formatSGD(lineTotal(line))}</p>
      )}
    </div>
  )
}

const inputCls = `w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800
  bg-white focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent
  placeholder:text-stone-300`
