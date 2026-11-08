// The invoice as a PDF page, drawn with react-pdf. The same component makes the
// draft preview and the issued PDF that's stored and sent, so the two can't drift.
// Layout changes happen here, in code; the wording comes from the data.
//
// Only ever loaded through src/lib/invoicePdf.ts, which imports it on demand:
// react-pdf is too big to ship with the rest of the app.

import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { parseInline, parseText, type InlineSpan } from '../lib/invoiceText'
import { formatAmount } from '../lib/money'
import { formatDate } from '../lib/dates'
import type { InvoiceKind, InvoiceRender } from '../types'

// Served from public/fonts (Google Fonts, SIL Open Font License). Pinyon Script and
// Cormorant Garamond are the logo's fonts; Inter is for everything else.
Font.register({
  family: 'Inter',
  fonts: [
    { src: '/fonts/inter-latin-400-normal.woff', fontWeight: 400 },
    { src: '/fonts/inter-latin-600-normal.woff', fontWeight: 600 },
    { src: '/fonts/inter-latin-400-italic.woff', fontWeight: 400, fontStyle: 'italic' },
    { src: '/fonts/inter-latin-600-italic.woff', fontWeight: 600, fontStyle: 'italic' },
  ],
})
Font.register({ family: 'Pinyon', src: '/fonts/pinyon-script-latin-400-normal.woff' })
Font.register({
  family: 'Cormorant',
  fonts: [
    { src: '/fonts/cormorant-garamond-latin-500-normal.woff', fontWeight: 500 },
    { src: '/fonts/cormorant-garamond-latin-600-normal.woff', fontWeight: 600 },
  ],
})
// react-pdf hyphenates English words by default ("lace bor-der"). Whole words read better.
Font.registerHyphenationCallback(word => [word])

// Tailwind's rose-800 and stone shades, to match the app.
const ROSE      = '#9f1239'
const STONE_800 = '#292524'
const STONE_500 = '#78716c'
const STONE_300 = '#d6d3d1'
const STONE_100 = '#f5f5f4'

const s = StyleSheet.create({
  page:       { paddingTop: 44, paddingBottom: 60, paddingHorizontal: 48, fontFamily: 'Inter', fontSize: 9.5, color: STONE_800, lineHeight: 1.4 },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  logo:       { fontFamily: 'Pinyon', fontSize: 34, lineHeight: 1 },
  logoSub:    { fontFamily: 'Cormorant', fontWeight: 500, fontSize: 8, letterSpacing: 2.5, color: STONE_500, marginTop: 2 },
  headRight:  { alignItems: 'flex-end' },
  title:      { fontFamily: 'Cormorant', fontWeight: 600, fontSize: 22, lineHeight: 1.2, height: 28, letterSpacing: 3, color: ROSE, marginBottom: 2 },
  meta:       { textAlign: 'right', color: STONE_500, fontSize: 9 },
  metaStrong: { textAlign: 'right', fontWeight: 600, fontSize: 10 },
  cols:       { flexDirection: 'row', gap: 24 },
  col:        { flex: 1 },
  label:      { fontSize: 7.5, letterSpacing: 1.2, color: STONE_500, marginBottom: 4, fontWeight: 600 },
  bold:       { fontWeight: 600 },
  muted:      { color: STONE_500 },
  tableHead:  { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: STONE_800, paddingBottom: 5, marginTop: 22, marginBottom: 2 },
  row:        { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: STONE_300 },
  cDesc:      { flex: 1, paddingRight: 12 },
  cQty:       { width: 40, textAlign: 'right' },
  cAmt:       { width: 90, textAlign: 'right' },
  totalRow:   { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 4 },
  totalLabel: { width: 220, textAlign: 'right', paddingRight: 12 },
  totalAmt:   { width: 90, textAlign: 'right' },
  payable:    { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 6, paddingRight: 4, marginTop: 4, borderTopWidth: 1, borderTopColor: STONE_800, backgroundColor: STONE_100 },
  bulletRow:  { flexDirection: 'row' },
  bulletDot:  { width: 10 },
  section:    { marginTop: 22 },
  termsHead:  { fontSize: 10, fontWeight: 600, letterSpacing: 1.2, marginBottom: 10 },
  watermark:  { position: 'absolute', top: 330, left: 60, fontSize: 120, fontWeight: 600, color: ROSE, opacity: 0.08, transform: 'rotate(-35deg)', letterSpacing: 10 },
  // Placed from the top (A4 is 842pt tall): with `bottom`, react-pdf 4.9 drops the page-number
  // text when the page sets a lineHeight.
  footer:     { position: 'absolute', top: 806, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: STONE_500 },
})

type TextStyle = (typeof s)[keyof typeof s]

function spanStyle(span: InlineSpan) {
  return {
    ...(span.bold ? { fontWeight: 600 } : {}),
    ...(span.italic ? { fontStyle: 'italic' as const } : {}),
    ...(span.underline ? { textDecoration: 'underline' as const } : {}),
  }
}

function inlineSpans(text: string) {
  return parseInline(text).map((span, i) => <Text key={i} style={spanStyle(span)}>{span.text}</Text>)
}

// Plain text where "- " lines are bullets and markers style words (see invoiceText.ts).
function RichText({ text, style }: { text: string; style?: TextStyle }) {
  return (
    <View>
      {parseText(text).map((block, i) => block.bullet ? (
        <View key={i} style={s.bulletRow}>
          <Text style={style ? [s.bulletDot, style] : s.bulletDot}>•</Text>
          <Text style={style ? [{ flex: 1 }, style] : { flex: 1 }}>{inlineSpans(block.text)}</Text>
        </View>
      ) : (
        <Text key={i} style={style}>{inlineSpans(block.text)}</Text>
      ))}
    </View>
  )
}

const KIND_WORDING: Record<InvoiceKind, string> = {
  full:    'Full payment',
  deposit: 'Booking deposit',
  final:   'Final payment',
}

// What every page carries. fixed: repeated if a page overflows onto another.
function PageFurniture({ data }: { data: InvoiceRender }) {
  const draft = !data.invoiceNo
  return (
    <>
      {draft && <Text fixed style={s.watermark}>DRAFT</Text>}
      <View fixed style={s.footer}>
        <Text>{data.business.businessName}</Text>
        <Text render={({ pageNumber, totalPages }) =>
          `${draft ? 'Draft' : data.invoiceNo} · page ${pageNumber} of ${totalPages}`} />
      </View>
    </>
  )
}

export default function InvoiceDocument({ data }: { data: InvoiceRender }) {
  const draft = !data.invoiceNo
  const payable = data.totals[data.totals.length - 1]
  const otherTotals = data.totals.slice(0, -1)
  const b = data.business

  return (
    <Document title={draft ? 'Draft invoice' : data.invoiceNo} author={b.businessName || undefined}>
      <Page size="A4" style={s.page}>
        <PageFurniture data={data} />

        <View style={s.header}>
          <View>
            <Text style={s.logo}>Unveiled</Text>
            <Text style={s.logoSub}>ATELIER · BY ESTHER</Text>
          </View>
          <View style={s.headRight}>
            <Text style={s.title}>INVOICE</Text>
            <Text style={s.metaStrong}>{draft ? 'Draft (not yet issued)' : data.invoiceNo}</Text>
            <Text style={s.meta}>{formatDate(data.date)}</Text>
            <Text style={s.meta}>
              {data.template === 'rental' ? 'Rental' : 'Bespoke'} · {KIND_WORDING[data.kind]}
            </Text>
            {data.depositInvoiceNo ? <Text style={s.meta}>Deposit invoice: {data.depositInvoiceNo}</Text> : null}
            {data.replaces ? <Text style={s.meta}>Replaces {data.replaces}</Text> : null}
          </View>
        </View>

        <View style={s.cols}>
          <View style={s.col}>
            <Text style={s.label}>BILLED TO</Text>
            <Text style={s.bold}>{data.clientName}</Text>
            {data.clientEmail ? <Text>{data.clientEmail}</Text> : null}
            {data.clientPhone ? <Text>{data.clientPhone}</Text> : null}
            {data.pwsDate ? <Text style={s.muted}>PWS Date: {formatDate(data.pwsDate)}</Text> : null}
            {data.weddingDate ? <Text style={s.muted}>Wedding Date: {formatDate(data.weddingDate)}</Text> : null}
            {data.clientNote ? (
              <View style={{ marginTop: 6 }}><RichText text={data.clientNote} style={s.muted} /></View>
            ) : null}
          </View>
          <View style={s.col}>
            <Text style={s.label}>FROM</Text>
            {b.businessName ? <Text style={s.bold}>{b.businessName}</Text> : null}
            <RichText text={b.address} />
            {b.email ? <Text>{b.email}</Text> : null}
            {b.phone ? <Text>{b.phone}</Text> : null}
          </View>
        </View>

        <View style={s.tableHead} fixed>
          <Text style={[s.cDesc, s.label, { marginBottom: 0 }]}>DESCRIPTION</Text>
          <Text style={[s.cQty, s.label, { marginBottom: 0 }]}>QTY</Text>
          <Text style={[s.cAmt, s.label, { marginBottom: 0 }]}>AMOUNT (SGD)</Text>
        </View>
        {data.lines.map((line, i) => (
          // wrap={false}: a line item is never split across two pages.
          <View key={i} style={s.row} wrap={false}>
            <View style={s.cDesc}>
              <Text style={s.bold}>{line.title}</Text>
              {line.description ? (
                <View style={{ marginTop: 3 }}><RichText text={line.description} style={s.muted} /></View>
              ) : null}
            </View>
            <Text style={s.cQty}>{line.quantity}</Text>
            <Text style={s.cAmt}>{formatAmount(line.quantity * line.unitAmount)}</Text>
          </View>
        ))}

        <View style={{ marginTop: 8 }} wrap={false}>
          {otherTotals.map((row, i) => (
            <View key={i} style={s.totalRow}>
              <Text style={[s.totalLabel, row.bold ? s.bold : s.muted]}>{row.label}</Text>
              <Text style={s.totalAmt}>{formatAmount(row.amount)}</Text>
            </View>
          ))}
          {payable && (
            <View style={s.payable}>
              <Text style={[s.totalLabel, s.bold]}>{payable.label}</Text>
              <Text style={[s.totalAmt, s.bold]}>SGD {formatAmount(payable.amount)}</Text>
            </View>
          )}
        </View>

        <View style={s.section} wrap={false}>
          <Text style={s.label}>PAYMENT</Text>
          {b.paynow ? <Text>PayNow: {b.paynow}</Text> : null}
          {b.bankName ? <Text>{b.bankName}</Text> : null}
          {b.bankAccountName ? <Text>{b.bankAccountName}</Text> : null}
          {b.bankAccountNo ? <Text>Account {b.bankAccountNo}</Text> : null}
          <Text style={[s.muted, { marginTop: 4 }]}>
            Please quote {draft ? 'the invoice number' : data.invoiceNo} with your payment.
          </Text>
        </View>

      </Page>

      {/* A page of its own, not a page break: the table header above is fixed,
          so on a continued page it would print over the terms. */}
      {data.terms.trim() ? (
        <Page size="A4" style={s.page}>
          <PageFurniture data={data} />
          <Text style={s.termsHead}>TERMS &amp; CONDITIONS</Text>
          <RichText text={data.terms} style={s.muted} />
        </Page>
      ) : null}
    </Document>
  )
}
