// The one text format invoices use: plain multi-line text where a line starting
// with "- " is a bullet. Both the PDF and the screens read it through here, so
// they can't disagree about what's a bullet.

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
