import { parseInline, parseText } from '../lib/invoiceText'

// Invoice text as it prints: bullets and bold, italic and underlined words. Reads
// the same format as the PDF, through the same parser.
export default function FormattedText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {parseText(text).map((block, i) => (
        <p key={i} className={`${block.bullet ? 'flex gap-1.5' : ''} ${block.gapBefore ? 'mt-3' : ''}`}>
          {block.bullet && <span aria-hidden>•</span>}
          <span>
            {parseInline(block.text).map((span, j) => (
              <span
                key={j}
                className={[
                  span.bold ? 'font-semibold' : '',
                  span.italic ? 'italic' : '',
                  span.underline ? 'underline' : '',
                ].join(' ')}
              >
                {span.text}
              </span>
            ))}
          </span>
        </p>
      ))}
    </div>
  )
}
