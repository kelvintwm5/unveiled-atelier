// The one text format invoices use: plain multi-line text where a line starting
// with "- " is a bullet, and **bold**, *italic* and __underline__ style part of a
// line. Both the PDF and the screens read it through here, so they can't disagree.
//
// Why markers instead of storing HTML or a rich-text document: the text stays
// plain, so everything written before formatting existed keeps working, it's
// frozen on an issued invoice like any other text, and no editor library is needed.

export interface TextBlock {
  bullet: boolean
  text: string
}

/** Splits text into lines and bullets. Blank lines and trailing spaces are dropped. */
export function parseText(text: string): TextBlock[] {
  return text
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => line.trim() !== '')
    .map(line => {
      const bullet = /^\s*- /.test(line)
      return { bullet, text: bullet ? line.replace(/^\s*- /, '') : line }
    })
}

/**
 * Adds a clause to the end of some text, on its own line. Appending (rather than
 * inserting at the cursor) behaves the same on a phone, where the cursor is hard
 * to place.
 */
export function appendText(text: string, addition: string): string {
  const base = text.replace(/\s+$/, '')
  return base ? `${base}\n${addition}` : addition
}

// ── Inline styles ─────────────────────────────────────────────────────────────

export interface InlineSpan {
  text: string
  bold: boolean
  italic: boolean
  underline: boolean
}

type Style = Omit<InlineSpan, 'text'>

// Longest first, so *** isn't read as ** followed by *.
const MARKERS: { marker: string; style: Partial<Style> }[] = [
  { marker: '***', style: { bold: true, italic: true } },
  { marker: '**',  style: { bold: true } },
  { marker: '__',  style: { underline: true } },
  { marker: '*',   style: { italic: true } },
]

const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c)
const isWordChar = (c: string | undefined) => c !== undefined && /[0-9A-Za-z]/.test(c)

// Where this opening marker's closing marker is, or -1. A marker only closes
// right after a non-space, which is what keeps "S$20 * 2 * 3" plain. Stars can
// pile up ("**a *b***"), so the closing marker is the last stars of the run.
function findClose(text: string, from: number, marker: string): number {
  const ch = marker[0]
  let j = from
  while (j < text.length) {
    if (text[j] !== ch) { j++; continue }
    let run = 1
    while (text[j + run] === ch) run++
    const closes = ch === '*'
      ? run >= marker.length && (marker.length > 1 || run % 2 === 1)   // an even run inside *italic* is **bold**
      : run === marker.length
    const at = j + run - marker.length
    if (closes && at > from && !isSpace(text[at - 1])) return at
    j += run
  }
  return -1
}

function spansOf(text: string, base: Style): InlineSpan[] {
  const spans: InlineSpan[] = []
  let plainFrom = 0
  let i = 0

  const flushPlain = (end: number) => {
    if (end > plainFrom) spans.push({ text: text.slice(plainFrom, end), ...base })
  }

  while (i < text.length) {
    const found = MARKERS.find(({ marker }) => text.startsWith(marker, i))
    if (!found) { i++; continue }

    const { marker, style } = found
    const after = text[i + marker.length]
    const canOpen = !isSpace(after) && after !== marker[0]
      // Keeps 2*3*4 and snake__case__names plain.
      && !((marker === '*' || marker === '__') && isWordChar(text[i - 1]))
    const close = canOpen ? findClose(text, i + marker.length, marker) : -1

    if (close === -1) {
      // Not a real marker: step over the whole run so its tail isn't retried.
      while (text[i] === marker[0]) i++
      continue
    }

    flushPlain(i)
    spans.push(...spansOf(text.slice(i + marker.length, close), { ...base, ...style }))
    i = close + marker.length
    plainFrom = i
  }
  flushPlain(text.length)
  return spans
}

/**
 * Splits one line into runs of text and their styles. A marker with no partner
 * prints as it is, so ordinary asterisks and underscores are safe.
 */
export function parseInline(text: string): InlineSpan[] {
  return spansOf(text, { bold: false, italic: false, underline: false })
}

// ── The formatting buttons ────────────────────────────────────────────────────

export type InlineFormat = 'bold' | 'italic' | 'underline'

export interface TextEdit {
  text: string
  start: number
  end: number
}

interface MarkerState { bold: boolean; italic: boolean; underline: boolean }

function stateOf(left: string, right: string): MarkerState {
  const stars = (s: string) => s.replace(/[^*]/g, '').length
  const l = stars(left)
  const r = stars(right)
  return {
    bold: l >= 2 && r >= 2,
    italic: l % 2 === 1 && r % 2 === 1,
    underline: left.includes('__') && right.includes('__'),
  }
}

// One canonical wrapping: underline outermost, stars inside.
function wrappers(st: MarkerState): [string, string] {
  const stars = (st.bold ? '**' : '') + (st.italic ? '*' : '')
  const under = st.underline ? '__' : ''
  return [under + stars, stars + under]
}

// Splits a piece of a line into its marker runs and the words inside them.
function innerOf(part: string) {
  const m = /^([*_]*)(\s*)(.*?)(\s*)([*_]*)$/.exec(part)!
  return { leadMarks: m[1], leadSpace: m[2], inner: m[3], trailSpace: m[4], trailMarks: m[5] }
}

/**
 * Applies or removes a style, and is what the B / I / U buttons call. With text
 * selected inside one line, it styles that text. With nothing selected, or a
 * selection across lines, it styles whole lines: easier on a phone, where
 * selecting exactly is fiddly. Every line is styled separately because a style
 * can't span lines, and a bullet's "- " stays outside the markers.
 *
 * Returns the new text and what to select afterwards, so a second button press
 * adds another style to the same words.
 */
export function toggleFormat(text: string, start: number, end: number, format: InlineFormat): TextEdit {
  const selected = text.slice(start, end)

  if (start === end || selected.includes('\n')) {
    return toggleLines(text, start, end, format)
  }

  const { leadMarks, leadSpace, inner, trailSpace, trailMarks } = innerOf(selected)
  if (!inner) return { text, start, end }

  const before = text.slice(0, start)
  const after = text.slice(end)
  // Marks hugging the selection only count if they're on both sides; otherwise
  // they belong to a neighbouring word, as in **one**two.
  const hugLeft = /[*_]*$/.exec(before)![0]
  const hugRight = /^[*_]*/.exec(after)![0]
  const outerLeft = hugLeft && hugRight ? hugLeft : ''
  const outerRight = hugLeft && hugRight ? hugRight : ''
  const left = outerLeft + leadMarks
  const right = trailMarks + outerRight

  const state = stateOf(left, right)
  const [open, close] = wrappers({ ...state, [format]: !state[format] })

  const prefix = before.slice(0, before.length - outerLeft.length) + leadSpace + open
  const suffix = close + trailSpace + after.slice(outerRight.length)
  return { text: prefix + inner + suffix, start: prefix.length, end: prefix.length + inner.length }
}

function toggleLines(text: string, start: number, end: number, format: InlineFormat): TextEdit {
  const from = text.lastIndexOf('\n', start - 1) + 1
  const nextBreak = text.indexOf('\n', end)
  const to = nextBreak === -1 ? text.length : nextBreak

  const parts = text.slice(from, to).split('\n').map(line => {
    const prefix = /^\s*(?:- )?/.exec(line)![0]
    return { prefix, ...innerOf(line.slice(prefix.length)) }
  })

  const styled = parts.filter(p => p.inner)
  if (styled.length === 0) return { text, start, end }

  // Mixed lines all gain the style; only when every line has it does it come off.
  const allOn = styled.every(p => stateOf(p.leadMarks, p.trailMarks)[format])

  const lines = parts.map(p => {
    if (!p.inner) return p.prefix + p.leadMarks + p.trailMarks
    const state = stateOf(p.leadMarks, p.trailMarks)
    const [open, close] = wrappers({ ...state, [format]: !allOn })
    return p.prefix + open + p.inner + close
  })
  const block = lines.join('\n')
  return {
    text: text.slice(0, from) + block + text.slice(to),
    start: from,
    end: from + block.length,
  }
}
