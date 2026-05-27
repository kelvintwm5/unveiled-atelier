import { useState } from 'react'

type PricingType = 'rental' | 'bespoke-veil' | 'bespoke-rental'

const MARGIN_MULT = 1 / 0.6   // 40% gross margin → multiply cost by 1.667
const LABOR_RATE  = 55
const MAT_MARKUP  = 1.30

const inputCls = [
  'w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800',
  'focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent',
  'placeholder:text-stone-300 bg-white',
].join(' ')

function sgd(n: number) {
  return n.toLocaleString('en-SG', { style: 'currency', currency: 'SGD', minimumFractionDigits: 2 })
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex justify-between items-center ${muted ? 'text-stone-400' : 'text-stone-600'}`}>
      <span className="text-sm">{label}</span>
      <span className="text-sm font-mono">{value}</span>
    </div>
  )
}

export default function PricingView() {
  const [type, setType]               = useState<PricingType>('rental')
  const [materialCost, setMaterialCost] = useState('')
  const [hours, setHours]             = useState('')
  const [rentalCycles, setRentalCycles] = useState('8')

  const mat    = parseFloat(materialCost) || 0
  const hrs    = parseFloat(hours)        || 0
  const cycles = Math.max(1, parseInt(rentalCycles) || 8)

  const hasInput = mat > 0 || (type === 'bespoke-veil' && hrs > 0)

  // Rental
  const costPerRental = mat / cycles
  const rentalProfit  = costPerRental * (MARGIN_MULT - 1)
  const rentalPrice   = costPerRental * MARGIN_MULT

  // Bespoke Veil
  const markedUpMat  = mat * MAT_MARKUP
  const labor        = hrs * LABOR_RATE
  const totalCost    = markedUpMat + labor
  const bespokeProfit = totalCost * (MARGIN_MULT - 1)
  const bespokePrice = totalCost * MARGIN_MULT

  const typeLabels: Record<PricingType, string> = {
    'rental':         'Rental',
    'bespoke-veil':   'Bespoke Veil',
    'bespoke-rental': 'Bespoke Rental',
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">

        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-stone-800">Pricing Calculator</h1>
          <p className="text-sm text-stone-500 mt-1">Calculate the suggested selling price for each veil type.</p>
        </div>

        {/* Type selector */}
        <div className="flex gap-2 mb-6">
          {(['rental', 'bespoke-veil', 'bespoke-rental'] as PricingType[]).map(t => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={[
                'flex-1 py-2 px-2 rounded-lg text-sm font-medium transition-colors',
                type === t
                  ? 'bg-rose-800 text-white'
                  : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50',
              ].join(' ')}
            >
              {typeLabels[t]}
            </button>
          ))}
        </div>

        {type === 'bespoke-rental' ? (
          <div className="bg-stone-50 border border-dashed border-stone-300 rounded-xl px-6 py-10 text-center">
            <p className="text-stone-500 text-sm font-medium">Coming Soon</p>
            <p className="text-stone-400 text-xs mt-1.5">The pricing formula for Bespoke Rental is still being determined.</p>
          </div>
        ) : (
          <div className="space-y-5">

            {/* Inputs */}
            <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
              <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Inputs</h2>

              <div>
                <label className="block text-sm text-stone-600 mb-1.5">Material Cost (SGD)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={materialCost}
                  onChange={e => setMaterialCost(e.target.value)}
                  className={inputCls}
                />
              </div>

              {type === 'rental' && (
                <div>
                  <label className="block text-sm text-stone-600 mb-1.5">Expected Rental Cycles</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="8"
                    value={rentalCycles}
                    onChange={e => setRentalCycles(e.target.value)}
                    className={inputCls}
                  />
                  <p className="text-xs text-stone-400 mt-1">Default: 8 cycles (industry standard)</p>
                </div>
              )}

              {type === 'bespoke-veil' && (
                <div>
                  <label className="block text-sm text-stone-600 mb-1.5">Hours to Make</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    placeholder="0"
                    value={hours}
                    onChange={e => setHours(e.target.value)}
                    className={inputCls}
                  />
                </div>
              )}
            </div>

            {/* Breakdown — only shown once there is input */}
            {hasInput && (
              <div className="bg-white border border-stone-200 rounded-xl p-6">
                <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-5">Price Breakdown</h2>

                {type === 'rental' && (
                  <div className="space-y-3">
                    <Row label="Material Cost" value={sgd(mat)} />
                    <Row label={`÷ Rental Cycles (${cycles})`} value={sgd(costPerRental)} />
                    <div className="border-t border-stone-100 pt-3 space-y-3">
                      <Row label="Cost per Rental" value={sgd(costPerRental)} />
                      <Row label="Profit (40% margin)" value={`+ ${sgd(rentalProfit)}`} muted />
                    </div>
                    <div className="border-t border-stone-200 pt-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-stone-800">Suggested Rental Price</span>
                        <span className="text-lg font-semibold text-rose-800 font-mono">{sgd(rentalPrice)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {type === 'bespoke-veil' && (
                  <div className="space-y-3">
                    <Row label="Materials (×1.30 markup)" value={sgd(markedUpMat)} />
                    <Row label={`Labor (${hrs} hrs × $${LABOR_RATE}/hr)`} value={sgd(labor)} />
                    <div className="border-t border-stone-100 pt-3 space-y-3">
                      <Row label="Total Cost" value={sgd(totalCost)} />
                      <Row label="Profit (40% margin)" value={`+ ${sgd(bespokeProfit)}`} muted />
                    </div>
                    <div className="border-t border-stone-200 pt-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-stone-800">Suggested Selling Price</span>
                        <span className="text-lg font-semibold text-rose-800 font-mono">{sgd(bespokePrice)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  )
}
