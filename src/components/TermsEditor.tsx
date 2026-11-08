import { useLayoutEffect, useRef } from 'react'
import { toggleFormat, type InlineFormat } from '../lib/invoiceText'
import FormattedText from './FormattedText'

interface Props {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  rows?: number
  placeholder?: string
}

const BUTTONS: { format: InlineFormat; label: string; name: string; style: string }[] = [
  { format: 'bold',      label: 'B', name: 'Bold',      style: 'font-bold' },
  { format: 'italic',    label: 'I', name: 'Italic',    style: 'italic' },
  { format: 'underline', label: 'U', name: 'Underline', style: 'underline' },
]

// A text box with B / I / U buttons and a preview of how the text will print.
// The text itself stays plain, with small markers around the styled words (see
// invoiceText.ts), so it needs no editor library. The preview is there because
// the markers show in the box while typing.
//
// Don't put this inside a <label>: a label passes clicks on it to the first
// control it contains, which here would be the Bold button.
export default function TermsEditor({ value, onChange, ariaLabel, rows = 5, placeholder }: Props) {
  const box = useRef<HTMLTextAreaElement>(null)
  // What to select once React has put the new text in the box.
  const pendingSelection = useRef<{ start: number; end: number } | null>(null)

  useLayoutEffect(() => {
    if (!pendingSelection.current || !box.current) return
    box.current.focus()
    box.current.setSelectionRange(pendingSelection.current.start, pendingSelection.current.end)
    pendingSelection.current = null
  }, [value])

  function applyFormat(format: InlineFormat) {
    const el = box.current
    if (!el) return
    const edit = toggleFormat(value, el.selectionStart, el.selectionEnd, format)
    if (edit.text === value) return
    pendingSelection.current = { start: edit.start, end: edit.end }
    onChange(edit.text)
  }

  return (
    <div>
      <div className="flex items-center gap-1 mb-1.5" role="toolbar" aria-label={`Format ${ariaLabel}`}>
        {BUTTONS.map(b => (
          <button
            key={b.format}
            type="button"
            aria-label={b.name}
            title={b.name}
            // Stops the tap from taking the focus, and so the selection, away from the box.
            onMouseDown={e => e.preventDefault()}
            onClick={() => applyFormat(b.format)}
            className={`w-9 h-9 text-sm text-stone-700 bg-white border border-stone-200 rounded-lg
                        hover:bg-rose-50 hover:border-rose-200 transition-colors ${b.style}`}
          >
            {b.label}
          </button>
        ))}
      </div>
      <textarea
        ref={box}
        aria-label={ariaLabel}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className={`${inputCls} resize-y`}
      />
      <p className="text-xs text-stone-400 mt-1">
        Select words, or tap into a line to style all of it, then press a button. Lines starting
        with “- ” print as bullets.
      </p>
      {value.trim() && (
        <div className="mt-2 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
          <p className="text-xs font-medium text-stone-400 mb-1">How it will print</p>
          <FormattedText text={value} className="text-sm text-stone-600 max-h-48 overflow-y-auto" />
        </div>
      )}
    </div>
  )
}

const inputCls = `w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800
  bg-white focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent
  placeholder:text-stone-300`
