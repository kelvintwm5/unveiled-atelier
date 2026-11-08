// The one text format invoices use: plain multi-line text where a line starting
// with "- " is a bullet, and <b>, <i> and <u> style part of a line. Both the PDF and
// the screens read it through here, so they can't disagree.
//
// It isn't HTML: those six exact tags are the only markup, and everything else is
// literal text. Why store this instead of an editor's document format: text written
// before styling existed keeps working unchanged, it's frozen on an issued invoice
// like any other text, and no editor library is needed.

export interface TextBlock {
  bullet: boolean
  text: string
  gapBefore: boolean     // a blank line came before it, so it starts a new paragraph
}

// A bullet's dash can sit inside its styling when a whole line is made bold.
const BULLET_START = /^\s*((?:<[biu]>)*)- /

/**
 * Splits text into lines and bullets. A run of blank lines becomes one paragraph
 * gap, except at the very top where it would only push the text down. Trailing
 * spaces are dropped.
 */
export function parseText(text: string): TextBlock[] {
  const blocks: TextBlock[] = []
  let blankBefore = false

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (stripStyles(line).trim() === '') {
      blankBefore = true
      continue
    }
    const bullet = BULLET_START.exec(line)
    blocks.push({
      bullet: bullet !== null,
      text: bullet ? bullet[1] + line.slice(bullet[0].length) : line,
      gapBefore: blankBefore && blocks.length > 0,
    })
    blankBefore = false
  }
  return blocks
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

const NO_STYLE: Style = { bold: false, italic: false, underline: false }

const STYLE_TAGS: [keyof Style, string][] = [['bold', 'b'], ['italic', 'i'], ['underline', 'u']]

const TAG = /<(\/?)([biu])>/g

// Someone typing the literal characters "<b>" is stored with the "<" escaped, so
// it can't turn into styling the next time the text is read.
const LOOKS_LIKE_TAG = /<(?=\/?[biu]>)/g
const ESCAPED_TAG = /&lt;(?=\/?[biu]>)/g

const unescapeText = (text: string) => text.replace(ESCAPED_TAG, '<')

/** The words without their styling, for text boxes that can't show it. */
export function stripStyles(text: string): string {
  return unescapeText(text.replace(TAG, ''))
}

const sameStyle = (a: Style, b: Style) => STYLE_TAGS.every(([key]) => a[key] === b[key])

/** Splits one line into runs of text and their styles. */
export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = []
  const style: Style = { ...NO_STYLE }
  let from = 0

  const add = (raw: string) => {
    if (!raw) return
    const last = spans[spans.length - 1]
    if (last && sameStyle(last, style)) last.text += unescapeText(raw)
    else spans.push({ text: unescapeText(raw), ...style })
  }

  for (const match of text.matchAll(TAG)) {
    add(text.slice(from, match.index))
    const key = STYLE_TAGS.find(([, tag]) => tag === match[2])![0]
    style[key] = match[1] === ''
    from = match.index + match[0].length
  }
  add(text.slice(from))
  return spans
}

function serializeLine(spans: InlineSpan[]): string {
  const open: Style = { ...NO_STYLE }
  let out = ''

  const closeUnless = (keep: Style) => {
    for (const [key, tag] of [...STYLE_TAGS].reverse()) {
      if (open[key] && !keep[key]) { out += `</${tag}>`; open[key] = false }
    }
  }

  for (const span of spans) {
    if (!span.text) continue
    closeUnless(span)
    for (const [key, tag] of STYLE_TAGS) {
      if (span[key] && !open[key]) { out += `<${tag}>`; open[key] = true }
    }
    out += span.text.replace(LOOKS_LIKE_TAG, '&lt;')
  }
  closeUnless(NO_STYLE)
  return out
}

/** The reverse of parseInline, one entry per line. */
export function serializeLines(lines: InlineSpan[][]): string {
  return lines.map(serializeLine).join('\n')
}

// ── Reading the editor ────────────────────────────────────────────────────────

// Only the parts of a browser DOM node used below. Written against this rather
// than the real DOM so the rules can be tested without a browser.
export interface EditorNode {
  nodeType: number
  nodeName: string
  nodeValue: string | null
  childNodes: ArrayLike<EditorNode>
  style?: { fontWeight: string; fontStyle: string; textDecoration: string; textDecorationLine: string }
}

const TEXT_NODE = 3
const ELEMENT_NODE = 1
const BLOCKS = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'])

// Browsers disagree on how they mark bold: Chrome writes <b>, Safari can write
// <span style="font-weight: bold">. Both have to read the same.
function styleOfNode(node: EditorNode, inherited: Style): Style {
  const style = { ...inherited }
  if (node.nodeName === 'B' || node.nodeName === 'STRONG') style.bold = true
  if (node.nodeName === 'I' || node.nodeName === 'EM') style.italic = true
  if (node.nodeName === 'U') style.underline = true

  const css = node.style
  if (css) {
    const weight = css.fontWeight
    if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) style.bold = true
    if (weight === 'normal' || weight === 'lighter' || (Number(weight) > 0 && Number(weight) < 600)) style.bold = false
    if (css.fontStyle === 'italic' || css.fontStyle === 'oblique') style.italic = true
    if (css.fontStyle === 'normal') style.italic = false
    if (`${css.textDecoration} ${css.textDecorationLine}`.includes('underline')) style.underline = true
  }
  return style
}

/** Reads the editor's contents as lines of styled text. */
export function linesFromEditor(root: EditorNode): InlineSpan[][] {
  const lines: InlineSpan[][] = []
  let current: InlineSpan[] = []
  const endLine = () => { lines.push(current); current = [] }

  function walkChildren(node: EditorNode, style: Style) {
    Array.from(node.childNodes).forEach(child => walk(child, style))
  }

  function walk(node: EditorNode, inherited: Style) {
    if (node.nodeType === TEXT_NODE) {
      // Browsers put non-breaking spaces where a run of normal ones would collapse.
      const parts = (node.nodeValue ?? '').replace(/ /g, ' ').split('\n')
      parts.forEach((part, i) => {
        if (i > 0) endLine()
        if (part) current.push({ text: part, ...inherited })
      })
      return
    }
    if (node.nodeType !== ELEMENT_NODE) return
    if (node.nodeName === 'BR') { endLine(); return }

    const style = styleOfNode(node, inherited)
    if (!BLOCKS.has(node.nodeName)) { walkChildren(node, style); return }

    // A block is a line of its own. Its closing <br>, if any, has already ended it.
    if (current.length) endLine()
    const linesBefore = lines.length
    walkChildren(node, style)
    if (current.length) endLine()
    else if (lines.length === linesBefore) lines.push([])
  }

  walkChildren(root, NO_STYLE)
  if (current.length) endLine()
  return lines
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

export type InlineFormat = 'bold' | 'italic' | 'underline'

const SHORTCUT_KEYS: Record<string, InlineFormat> = { b: 'bold', i: 'italic', u: 'underline' }

/**
 * Which style a key press asks for: Cmd on a Mac, Ctrl on Windows. With Shift or
 * Alt held it's a different shortcut (Cmd+Shift+B opens Chrome's bookmarks bar),
 * so those are left to the browser.
 */
export function shortcutFormat(e: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}): InlineFormat | null {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return null
  return SHORTCUT_KEYS[e.key.toLowerCase()] ?? null
}
