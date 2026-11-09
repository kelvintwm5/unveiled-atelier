import type { Invoice } from '../types'

// An issued invoice's status that matters day to day is whether it's been paid.
// unpaidDays, where it's given, says how long she's been waiting.
export default function InvoiceStatusBadge({ status, paid, unpaidDays = 0 }: {
  status: Invoice['status']
  paid: boolean
  unpaidDays?: number
}) {
  const unpaidLabel = unpaidDays > 0 ? `Unpaid ${unpaidDays} ${unpaidDays === 1 ? 'day' : 'days'}` : 'Unpaid'
  const [label, style] =
    status === 'draft' ? ['Draft', 'bg-stone-100 text-stone-500'] :
    status === 'void'  ? ['Void', 'bg-red-50 text-red-700'] :
    paid               ? ['Paid', 'bg-emerald-50 text-emerald-700'] :
                         [unpaidLabel, 'bg-rose-50 text-rose-800']
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap ${style}`}>
      {label}
    </span>
  )
}
