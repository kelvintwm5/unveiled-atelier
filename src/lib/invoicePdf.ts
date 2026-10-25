// Turns an InvoiceRender into a PDF file in the browser.
//
// react-pdf is about 440 KB gzipped, more than double the rest of the app, so it
// is loaded only when a PDF is actually needed: a preview, issuing, or a
// download. import() tells Vite to put it in a separate file, which the browser
// fetches on first use and then keeps in its cache. Nothing else may import
// '@react-pdf/renderer' or InvoiceDocument directly, or it ends up in the main
// bundle again.

import { createElement, type ReactElement } from 'react'
import type { DocumentProps } from '@react-pdf/renderer'
import type { InvoiceRender } from '../types'

export async function renderInvoicePdf(data: InvoiceRender): Promise<Blob> {
  try {
    const [{ pdf }, { default: InvoiceDocument }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('../components/InvoiceDocument'),
    ])
    // pdf() is typed to take a <Document> element. InvoiceDocument renders exactly
    // one, but TypeScript can't see through the component to know that.
    const element = createElement(InvoiceDocument, { data }) as unknown as ReactElement<DocumentProps>
    return await pdf(element).toBlob()
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Couldn't make the PDF: ${reason}. Check your connection and try again.`)
  }
}

/**
 * Opens a PDF in a new tab. The tab has to be opened straight away, inside the
 * tap, or the browser treats it as a pop-up; the PDF goes into it once it's
 * ready. If the browser blocks the tab anyway, the PDF is still made and its
 * address returned, for the screen to offer as a link to tap. Returns null when
 * the tab opened.
 */
export async function openPdf(makePdf: () => Promise<Blob | string>): Promise<string | null> {
  const tab = window.open('', '_blank')
  try {
    const result = await makePdf()
    const url = typeof result === 'string' ? result : URL.createObjectURL(result)
    if (!tab) return url
    tab.location.href = url
    // A blob: URL holds the whole file in memory until it's revoked. A minute
    // is plenty for the tab to load it.
    if (typeof result !== 'string') setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return null
  } catch (err) {
    tab?.close()
    throw err
  }
}
