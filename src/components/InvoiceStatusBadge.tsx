import type { Invoice } from '../types'

export default function InvoiceStatusBadge({ status }: { status: Invoice['status'] }) {
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
