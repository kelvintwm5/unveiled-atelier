import { describe, expect, it } from 'vitest'
import {
  appendText, linesFromEditor, parseInline, parseText, serializeLines, shortcutFormat, stripStyles,
  type EditorNode, type InlineSpan,
} from './invoiceText'

describe('shortcutFormat', () => {
  const keys = { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }

  it('reads Cmd on a Mac and Ctrl on Windows', () => {
    expect(shortcutFormat({ ...keys, key: 'b', metaKey: true })).toBe('bold')
    expect(shortcutFormat({ ...keys, key: 'i', metaKey: true })).toBe('italic')
    expect(shortcutFormat({ ...keys, key: 'u', metaKey: true })).toBe('underline')
    expect(shortcutFormat({ ...keys, key: 'b', ctrlKey: true })).toBe('bold')
  })

  it('still works with Caps Lock on', () => {
    expect(shortcutFormat({ ...keys, key: 'B', metaKey: true })).toBe('bold')
  })

  it('ignores plain typing and other shortcuts', () => {
    expect(shortcutFormat({ ...keys, key: 'b' })).toBeNull()
    expect(shortcutFormat({ ...keys, key: 'c', metaKey: true })).toBeNull()
    expect(shortcutFormat({ ...keys, key: 'b', metaKey: true, shiftKey: true })).toBeNull()
    expect(shortcutFormat({ ...keys, key: 'i', metaKey: true, altKey: true })).toBeNull()
  })
})

describe('parseText', () => {
  it('turns "- " lines into bullets and keeps other lines as text', () => {
    expect(parseText('Design as discussed.\n- French lace\n- Pearls')).toEqual([
      { bullet: false, text: 'Design as discussed.', gapBefore: false },
      { bullet: true,  text: 'French lace',          gapBefore: false },
      { bullet: true,  text: 'Pearls',               gapBefore: false },
    ])
  })

  it('turns blank lines into a paragraph gap, and accepts Windows line endings', () => {
    expect(parseText('One  \r\n\r\n  - Two \n')).toEqual([
      { bullet: false, text: 'One', gapBefore: false },
      { bullet: true,  text: 'Two', gapBefore: true  },
    ])
  })

  it('makes one gap from several blank lines', () => {
    expect(parseText('One\n\n  \n\nTwo').map(b => b.gapBefore)).toEqual([false, true])
  })

  it('has no gap above the first line or after the last', () => {
    expect(parseText('\n\nOne\n\n').map(b => b.gapBefore)).toEqual([false])
  })

  it('needs the space after the dash', () => {
    expect(parseText('-5% discount\n--')).toEqual([
      { bullet: false, text: '-5% discount', gapBefore: false },
      { bullet: false, text: '--',           gapBefore: false },
    ])
  })

  it('keeps a bullet when its whole line is styled', () => {
    expect(parseText('<b>- Deposit</b>')).toEqual([{ bullet: true, text: '<b>Deposit</b>', gapBefore: false }])
  })

  it('treats a line with only styling as blank', () => {
    expect(parseText('<b> </b>\nOne')).toEqual([{ bullet: false, text: 'One', gapBefore: false }])
    expect(parseText('Zero\n<b> </b>\nOne').map(b => b.gapBefore)).toEqual([false, true])
  })

  it('is empty for empty text', () => {
    expect(parseText('')).toEqual([])
    expect(parseText('\n  \n')).toEqual([])
  })
})

describe('appendText', () => {
  it('puts the clause on a new line after the existing text', () => {
    expect(appendText('Design as discussed.', '- Cleaning included')).toBe('Design as discussed.\n- Cleaning included')
  })

  it('drops trailing blank lines first, so no gap builds up', () => {
    expect(appendText('One\n\n  ', 'Two')).toBe('One\nTwo')
  })

  it('is just the clause when the text is empty', () => {
    expect(appendText('', 'Two')).toBe('Two')
    expect(appendText('\n', 'Two')).toBe('Two')
  })
})

const plain = { bold: false, italic: false, underline: false }
const b = { ...plain, bold: true }
const i = { ...plain, italic: true }
const u = { ...plain, underline: true }

describe('parseInline', () => {
  it('leaves plain text alone', () => {
    expect(parseInline('Plain text.')).toEqual([{ text: 'Plain text.', ...plain }])
    expect(parseInline('')).toEqual([])
  })

  it('reads bold, italic and underline', () => {
    expect(parseInline('a <b>b</b> c')).toEqual([
      { text: 'a ', ...plain }, { text: 'b', ...b }, { text: ' c', ...plain },
    ])
    expect(parseInline('<i>x</i>')).toEqual([{ text: 'x', ...i }])
    expect(parseInline('<u>x</u>')).toEqual([{ text: 'x', ...u }])
  })

  it('combines styles', () => {
    expect(parseInline('<b>a<i>b</i></b>')).toEqual([
      { text: 'a', ...b }, { text: 'b', ...plain, bold: true, italic: true },
    ])
  })

  it('treats everything else as literal text', () => {
    for (const text of ['*Terms apply', '**not bold**', 'S$20 * 2', '__x__', 'a < b > c', '<strong>x</strong>', 'Tom & Co &lt;']) {
      expect(parseInline(text)).toEqual([{ text, ...plain }])
    }
  })

  it('joins neighbouring runs of the same style', () => {
    expect(parseInline('<b>a</b><b>b</b>')).toEqual([{ text: 'ab', ...b }])
  })
})

describe('stripStyles', () => {
  it('leaves only the words', () => {
    expect(stripStyles('- <b>Late</b> fee\n<i>S$20</i>')).toBe('- Late fee\nS$20')
  })
})

describe('serializeLines', () => {
  const roundTrip = (spans: InlineSpan[]) => parseInline(serializeLines([spans]))

  it('writes one line per entry', () => {
    expect(serializeLines([[{ text: 'a', ...b }], [], [{ text: 'c', ...plain }]])).toBe('<b>a</b>\n\nc')
  })

  it('reads back exactly, including styles side by side and part of a word', () => {
    const cases: InlineSpan[][] = [
      [{ text: 'un', ...plain }, { text: 'believ', ...b }, { text: 'able', ...plain }],
      [{ text: 'a', ...b }, { text: 'b', ...i }, { text: 'c', ...u }],
      [{ text: 'a', ...b }, { text: 'b', ...plain, bold: true, italic: true }, { text: 'c', ...i }],
      [{ text: ' spaced ', ...b }, { text: 'x', ...plain }],
    ]
    for (const spans of cases) expect(roundTrip(spans)).toEqual(spans)
  })

  it('keeps typed symbols as typed, even ones that look like styling', () => {
    for (const text of ['*stars* and **more**', '__under__', '<b>not bold</b>', '</i>', '2 < 3']) {
      expect(roundTrip([{ text, ...plain }])).toEqual([{ text, ...plain }])
    }
  })
})

describe('linesFromEditor', () => {
  const text = (nodeValue: string): EditorNode => ({ nodeType: 3, nodeName: '#text', nodeValue, childNodes: [] })
  const el = (nodeName: string, children: EditorNode[] = [], style?: Partial<NonNullable<EditorNode['style']>>): EditorNode => ({
    nodeType: 1, nodeName, nodeValue: null, childNodes: children,
    style: { fontWeight: '', fontStyle: '', textDecoration: '', textDecorationLine: '', ...style },
  })
  const read = (...children: EditorNode[]) => serializeLines(linesFromEditor(el('DIV', children)))

  it('reads each block as a line, and an empty block as a blank line', () => {
    expect(read(el('DIV', [text('one')]), el('DIV', [el('BR')]), el('DIV', [text('two')]))).toBe('one\n\ntwo')
  })

  it('reads text typed before the first new line', () => {
    expect(read(text('one'), el('DIV', [text('two')]))).toBe('one\ntwo')
  })

  it('reads <br> as a new line without doubling a block\'s closing one', () => {
    expect(read(text('a'), el('BR'), text('b'))).toBe('a\nb')
    expect(read(el('DIV', [text('a'), el('BR')]), el('DIV', [text('b')]))).toBe('a\nb')
  })

  it('is empty for a cleared box', () => {
    expect(read()).toBe('')
    expect(read(el('BR'))).toBe('')
    expect(read(el('DIV', [el('BR')]))).toBe('')
  })

  it('reads the tags browsers use', () => {
    expect(read(el('B', [text('a')]), el('STRONG', [text('b')]))).toBe('<b>ab</b>')
    expect(read(el('I', [text('a')]), el('EM', [text('b')]))).toBe('<i>ab</i>')
    expect(read(el('U', [text('a')]))).toBe('<u>a</u>')
  })

  it('reads styling written as CSS, as Safari can do', () => {
    expect(read(el('SPAN', [text('a')], { fontWeight: 'bold' }))).toBe('<b>a</b>')
    expect(read(el('SPAN', [text('a')], { fontWeight: '700' }))).toBe('<b>a</b>')
    expect(read(el('SPAN', [text('a')], { fontStyle: 'italic' }))).toBe('<i>a</i>')
    expect(read(el('SPAN', [text('a')], { textDecorationLine: 'underline' }))).toBe('<u>a</u>')
  })

  it('lets an inner span switch bold off', () => {
    expect(read(el('B', [text('a'), el('SPAN', [text('b')], { fontWeight: 'normal' })]))).toBe('<b>a</b>b')
  })

  it('nests styles', () => {
    expect(read(el('B', [el('I', [text('a')])]))).toBe('<b><i>a</i></b>')
  })

  it('turns non-breaking spaces into normal ones', () => {
    expect(read(text('a\u00a0b'))).toBe('a b')
  })
})
