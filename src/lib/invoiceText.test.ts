import { describe, expect, it } from 'vitest'
import { parseText } from './invoiceText'

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
