import { describe, expect, it } from 'vitest'
import { appendText, parseInline, parseText, toggleFormat } from './invoiceText'

describe('parseText', () => {
  it('turns "- " lines into bullets and keeps other lines as text', () => {
    expect(parseText('Design as discussed.\n- French lace\n- Pearls')).toEqual([
      { bullet: false, text: 'Design as discussed.' },
      { bullet: true,  text: 'French lace' },
      { bullet: true,  text: 'Pearls' },
    ])
  })

  it('drops blank lines and trailing spaces, and accepts Windows line endings', () => {
    expect(parseText('One  \r\n\r\n  - Two \n')).toEqual([
      { bullet: false, text: 'One' },
      { bullet: true,  text: 'Two' },
    ])
  })

  it('needs the space after the dash', () => {
    expect(parseText('-5% discount\n--')).toEqual([
      { bullet: false, text: '-5% discount' },
      { bullet: false, text: '--' },
    ])
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

describe('parseInline', () => {
  const plain = { bold: false, italic: false, underline: false }
  const b = { ...plain, bold: true }
  const i = { ...plain, italic: true }
  const u = { ...plain, underline: true }

  it('leaves plain text alone', () => {
    expect(parseInline('Plain text.')).toEqual([{ text: 'Plain text.', ...plain }])
    expect(parseInline('')).toEqual([])
  })

  it('reads bold, italic and underline', () => {
    expect(parseInline('a **b** c')).toEqual([
      { text: 'a ', ...plain }, { text: 'b', ...b }, { text: ' c', ...plain },
    ])
    expect(parseInline('*x*')).toEqual([{ text: 'x', ...i }])
    expect(parseInline('__x__')).toEqual([{ text: 'x', ...u }])
  })

  it('combines styles', () => {
    expect(parseInline('***x***')).toEqual([{ text: 'x', ...plain, bold: true, italic: true }])
    expect(parseInline('__**x**__')).toEqual([{ text: 'x', ...plain, bold: true, underline: true }])
    expect(parseInline('**a *b* c**')).toEqual([
      { text: 'a ', ...b }, { text: 'b', ...plain, bold: true, italic: true }, { text: ' c', ...b },
    ])
    expect(parseInline('**a *b***')).toEqual([
      { text: 'a ', ...b }, { text: 'b', ...plain, bold: true, italic: true },
    ])
    expect(parseInline('*a **b***')).toEqual([
      { text: 'a ', ...i }, { text: 'b', ...plain, bold: true, italic: true },
    ])
  })

  it('prints stray markers as they are', () => {
    for (const text of [
      '*Terms apply',
      'S$20 * 2 * 3',
      '2*3*4',
      '** not bold **',
      'snake__case__name',
      'Signature: __________',
      'a_b_c',
      '**unfinished',
    ]) {
      expect(parseInline(text)).toEqual([{ text, ...plain }])
    }
  })

  it('never loses a character of unstyled text', () => {
    const line = 'a * b ** c __ d *e f* g'
    expect(parseInline(line).map(s => s.text).join('')).toBe('a * b ** c __ d e f g')
  })
})

describe('toggleFormat', () => {
  it('wraps the selected words and keeps them selected', () => {
    const r = toggleFormat('one two three', 4, 7, 'bold')
    expect(r.text).toBe('one **two** three')
    expect(r.text.slice(r.start, r.end)).toBe('two')
  })

  it('takes the style off again', () => {
    const on = toggleFormat('one two three', 4, 7, 'bold')
    const off = toggleFormat(on.text, on.start, on.end, 'bold')
    expect(off.text).toBe('one two three')
    expect(off.text.slice(off.start, off.end)).toBe('two')
  })

  it('also recognises a selection that includes its markers', () => {
    expect(toggleFormat('a **b** c', 2, 7, 'bold').text).toBe('a b c')
  })

  it('stacks styles so each can be removed on its own', () => {
    let r = toggleFormat('word', 0, 4, 'bold')
    r = toggleFormat(r.text, r.start, r.end, 'italic')
    r = toggleFormat(r.text, r.start, r.end, 'underline')
    expect(r.text).toBe('__***word***__')
    expect(parseInline(r.text)).toEqual([{ text: 'word', bold: true, italic: true, underline: true }])

    r = toggleFormat(r.text, r.start, r.end, 'bold')
    expect(r.text).toBe('__*word*__')
    r = toggleFormat(r.text, r.start, r.end, 'underline')
    expect(r.text).toBe('*word*')
    r = toggleFormat(r.text, r.start, r.end, 'italic')
    expect(r.text).toBe('word')
  })

  it('moves spaces picked up by the selection outside the markers', () => {
    expect(toggleFormat('one two three', 3, 8, 'italic').text).toBe('one *two* three')
  })

  it('formats the whole line when nothing is selected, keeping a bullet outside', () => {
    expect(toggleFormat('first\n- second\nthird', 10, 10, 'bold').text).toBe('first\n- **second**\nthird')
  })

  it('formats each line of a selection across lines, and skips blank ones', () => {
    expect(toggleFormat('one\n\n- two', 0, 9, 'underline').text).toBe('__one__\n\n- __two__')
  })

  it('mixed lines all gain the style first, then all lose it', () => {
    const mixed = '**one**\ntwo'
    const on = toggleFormat(mixed, 0, mixed.length, 'bold')
    expect(on.text).toBe('**one**\n**two**')
    expect(toggleFormat(on.text, on.start, on.end, 'bold').text).toBe('one\ntwo')
  })

  it('does nothing on an empty line', () => {
    expect(toggleFormat('one\n\ntwo', 4, 4, 'bold').text).toBe('one\n\ntwo')
  })

  it('leaves a neighbouring word\'s markers alone', () => {
    expect(toggleFormat('**one**two', 7, 10, 'italic').text).toBe('**one***two*')
  })
})
