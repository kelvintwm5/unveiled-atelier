import { useEffect, useLayoutEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import {
  linesFromEditor, parseInline, serializeLines, shortcutFormat, type InlineFormat,
} from '../lib/invoiceText'

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

// Puts stored text into the editor. Builds real elements rather than setting
// innerHTML, so text that merely looks like markup can't become markup.
function fillEditor(root: HTMLElement, value: string) {
  const lines = value === '' ? [] : value.split(/\r?\n/)
  root.replaceChildren(...lines.map(line => {
    const div = document.createElement('div')
    const spans = parseInline(line)
    if (spans.length === 0) div.appendChild(document.createElement('br'))
    for (const span of spans) {
      let node: Node = document.createTextNode(span.text)
      for (const [on, tag] of [[span.bold, 'b'], [span.italic, 'i'], [span.underline, 'u']] as const) {
        if (!on) continue
        const wrapper = document.createElement(tag)
        wrapper.appendChild(node)
        node = wrapper
      }
      div.appendChild(node)
    }
    return div
  }))
}

// A text box that shows real bold, italic and underline as you type, using the
// browser's own editing instead of an editor library: three styles don't justify
// the dependency. What's stored is still plain text (see invoiceText.ts).
//
// React doesn't own the contents. If it re-rendered them on each keystroke the
// cursor would jump, so the box is only refilled when the value changes from
// outside, such as "Reset to default".
//
// document.execCommand is marked deprecated, but it's supported by every browser
// and the web has no replacement for it yet. It also keeps Cmd+Z working.
//
// Don't put this inside a <label>: a label passes clicks on it to the first
// control it contains, which here would be the Bold button.
export default function TermsEditor({ value, onChange, ariaLabel, rows = 5, placeholder }: Props) {
  const box = useRef<HTMLDivElement>(null)
  // The value the box currently shows; anything else came from outside.
  const shown = useRef<string | null>(null)
  // The last selection in the box. A tap on a button can clear it on a phone.
  const lastRange = useRef<Range | null>(null)

  useLayoutEffect(() => {
    if (!box.current || value === shown.current) return
    fillEditor(box.current, value)
    shown.current = value
  }, [value])

  useEffect(() => {
    function remember() {
      const selection = document.getSelection()
      if (selection?.rangeCount && box.current?.contains(selection.anchorNode)) {
        lastRange.current = selection.getRangeAt(0).cloneRange()
      }
    }
    document.addEventListener('selectionchange', remember)
    return () => document.removeEventListener('selectionchange', remember)
  }, [])

  function emitChange() {
    if (!box.current) return
    const next = serializeLines(linesFromEditor(box.current))
    if (next === shown.current) return
    shown.current = next
    onChange(next)
  }

  function applyFormat(format: InlineFormat) {
    const el = box.current
    if (!el) return
    const selection = document.getSelection()
    if (selection && !el.contains(selection.anchorNode)) {
      el.focus()
      if (lastRange.current) {
        selection.removeAllRanges()
        selection.addRange(lastRange.current)
      }
    }
    // Plain <b>, <i> and <u> rather than styled spans, where the browser allows it.
    document.execCommand('styleWithCSS', false, 'false')
    document.execCommand(format)
    emitChange()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const format = shortcutFormat(e)
    if (!format) return
    // Otherwise the browser acts on it too: Ctrl+U opens the page source on Windows.
    e.preventDefault()
    applyFormat(format)
  }

  // As plain text, so fonts and colours from Word or an email can't reach an invoice.
  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    e.preventDefault()
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
  }

  return (
    <div>
      <div className="flex items-center gap-1 mb-1.5" role="toolbar" aria-label={`Format ${ariaLabel}`}>
        {BUTTONS.map(b => (
          <button
            key={b.format}
            type="button"
            aria-label={b.name}
            title={`${b.name} (Cmd/Ctrl+${b.label})`}
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
      <div className="relative">
        <div
          ref={box}
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel}
          contentEditable
          suppressContentEditableWarning
          // Each new line as its own <div>, the same in every browser.
          onFocus={() => document.execCommand('defaultParagraphSeparator', false, 'div')}
          onInput={emitChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onDrop={e => e.preventDefault()}
          style={{ minHeight: `${rows * 1.25 + 1}rem` }}
          className={`${inputCls} whitespace-pre-wrap break-words max-h-96 overflow-y-auto`}
        />
        {placeholder && value.trim() === '' && (
          <p className="absolute top-2 left-3 text-sm text-stone-300 pointer-events-none">{placeholder}</p>
        )}
      </div>
      <p className="text-xs text-stone-400 mt-1">
        Lines starting with “- ” print as bullets.
      </p>
    </div>
  )
}

const inputCls = `w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800
  bg-white focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent`
