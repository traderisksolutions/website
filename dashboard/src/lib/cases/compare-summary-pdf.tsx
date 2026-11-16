/**
 * The client summary of a case's comparison as a TRS-branded PDF: the letterhead, faces and rules
 * of the renewal report (policies/ledger/report-pdf.tsx), landscape so five options fit. The
 * option recommended and the reason first, then one table per section: premium, policy terms, the
 * client's wish list, the documents each option was read from. Every word in a cell was typed by a person.
 * No filesystem access here; the server half registers the fonts and renders (compare-summary.ts).
 */
import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { PDF_GREEN, PDF_HAIR, PDF_INK, PDF_MUT, PDF_SUB } from '@/lib/pdf-fonts'
import { TRS_LETTERHEAD } from '@/lib/debit-note-pdf'
import { PREMIUM_LABEL, type SummaryModel } from './compare'

const s = StyleSheet.create({
  // paddingBottom reserves room for the fixed footnote and company line, so a row breaks before them.
  page:     { paddingTop: 40, paddingHorizontal: 44, paddingBottom: 84, fontSize: 9, fontFamily: 'Geist', color: PDF_INK, lineHeight: 1.4 },
  head:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: `1.2pt solid ${PDF_GREEN}` },
  mark:     { alignItems: 'center' },
  markT:    { fontFamily: 'TRS Mark', fontSize: 21, lineHeight: 1, letterSpacing: 4.2, color: PDF_GREEN, paddingLeft: 4.2 },
  markC:    { fontFamily: 'TRS Brush', fontSize: 15, lineHeight: 1, letterSpacing: 5, color: PDF_GREEN, paddingLeft: 5 },
  markGap:  { height: 6 },
  titleBox: { alignItems: 'flex-end' },
  title:    { fontFamily: 'EB Garamond', fontWeight: 500, fontSize: 24, lineHeight: 1 },
  number:   { fontFamily: 'Geist Mono', fontWeight: 500, fontSize: 10.5, color: PDF_GREEN, marginTop: 4 },
  parties:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  to:       { width: '58%' },
  label:    { fontSize: 7, color: PDF_MUT, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 3 },
  client:   { fontWeight: 600 },
  meta:     { width: '30%' },
  metaRow:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  metaKey:  { color: PDF_SUB },
  metaVal:  { textAlign: 'right' },
  section:  { marginTop: 16 },
  h2:       { fontFamily: 'EB Garamond', fontWeight: 500, fontSize: 14, lineHeight: 1.1, marginBottom: 6 },
  chosen:   { fontWeight: 600 },
  reason:   { marginTop: 3, color: PDF_SUB },
  th:       { flexDirection: 'row', paddingBottom: 4, borderBottom: `1pt solid ${PDF_INK}` },
  thCell:   { flex: 1, fontSize: 7.5, color: PDF_SUB, fontWeight: 500, paddingRight: 8 },
  thSub:    { fontSize: 7, color: PDF_MUT, fontWeight: 400 },
  tr:       { flexDirection: 'row', paddingVertical: 4.5, borderBottom: `0.5pt solid ${PDF_HAIR}` },
  first:    { width: 132, color: PDF_SUB, paddingRight: 8 },
  wide:     { width: 220, paddingRight: 8 },
  td:       { flex: 1, paddingRight: 8 },
  tdNum:    { flex: 1, paddingRight: 8, fontFamily: 'Geist Mono', fontSize: 8.5 },
  need:     { fontSize: 7.5, color: PDF_MUT },
  foot:     { position: 'absolute', bottom: 28, left: 44, right: 44 },
  note:     { fontSize: 7.2, color: PDF_SUB, lineHeight: 1.45, paddingTop: 6, borderTop: `0.5pt solid ${PDF_HAIR}` },
  company:  { marginTop: 6, paddingTop: 6, borderTop: `1.2pt solid ${PDF_GREEN}`, fontSize: 7.5, color: PDF_SUB },
  pageNo:   { position: 'absolute', top: 24, right: 44, fontSize: 7.5, color: PDF_MUT, fontFamily: 'Geist Mono' },
})

export const SUMMARY_FOOTNOTE = 'Terms are as stated in each insurer’s quotation or policy document. The insurer’s policy wording prevails.'

export function CompareSummaryDocument({ m }: { m: SummaryModel }) {
  const Options = ({ first, wide }: { first: string; wide?: boolean }) => (
    <View style={s.th} fixed>
      <Text style={{ ...(wide ? s.wide : s.first), fontSize: 7.5, fontWeight: 500, color: PDF_SUB }}>{first}</Text>
      {m.options.map((o, i) => (
        <View key={i} style={s.thCell}>
          <Text>{o.name}{o.recommended ? ' · Recommended' : ''}</Text>
          {o.insurer ? <Text style={s.thSub}>{o.insurer}</Text> : null}
        </View>
      ))}
    </View>
  )
  const sourced = m.options.filter(o => o.document)
  return (
    <Document title={`Renewal comparison · ${m.client}`} author={TRS_LETTERHEAD.companyName}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.pageNo} fixed render={({ pageNumber, totalPages }) => `${m.policy?.number ? `${m.policy.number} · ` : ''}page ${pageNumber} of ${totalPages}`} />
        <View style={s.head}>
          <View style={s.mark}><View><Text style={s.markT}>TRS</Text></View><View style={s.markGap} /><View><Text style={s.markC}>保风</Text></View></View>
          <View style={s.titleBox}><Text style={s.title}>Renewal comparison</Text>{m.policy?.number ? <Text style={s.number}>{m.policy.number}</Text> : null}</View>
        </View>
        <View style={s.parties}>
          <View style={s.to}>
            <Text style={s.label}>Prepared for</Text>
            <Text style={s.client}>{m.client}</Text>
            <Text style={{ marginTop: 3, color: PDF_SUB }}>{[m.title, m.policy?.insurer].filter(Boolean).join(' · ')}</Text>
          </View>
          <View style={s.meta}>
            <View style={s.metaRow}><Text style={s.metaKey}>As of</Text><Text style={s.metaVal}>{m.as_of}</Text></View>
            {m.policy?.period ? <View style={s.metaRow}><Text style={s.metaKey}>Current period</Text><Text style={s.metaVal}>{m.policy.period}</Text></View> : null}
            <View style={s.metaRow}><Text style={s.metaKey}>Currency</Text><Text style={s.metaVal}>SGD</Text></View>
          </View>
        </View>

        {m.recommended ? (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Recommendation</Text>
            <Text style={s.chosen}>{m.recommended.name}</Text>
            {m.recommended.reason ? <Text style={s.reason}>{m.recommended.reason}</Text> : null}
          </View>
        ) : null}

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>Premium</Text>
          <Options first="Amount" />
          <View style={s.tr}>
            <Text style={s.first}>{PREMIUM_LABEL}</Text>
            {m.premium.cells.map((c, n) => <Text key={n} style={s.tdNum}>{c}</Text>)}
          </View>
          <View style={s.tr}>
            <Text style={s.first}>Change from current policy</Text>
            {m.premium.changes.map((c, n) => <Text key={n} style={s.tdNum}>{c}</Text>)}
          </View>
        </View>

        {m.terms.length ? (
          <View style={s.section}>
            <Text style={s.h2}>Policy terms</Text>
            <Options first="Term" />
            {m.terms.map((r, i) => (
              <View key={i} style={s.tr} wrap={false}>
                <Text style={s.first}>{r.label}</Text>
                {r.cells.map((c, n) => <Text key={n} style={s.td}>{c}</Text>)}
              </View>
            ))}
          </View>
        ) : null}

        {m.wishes.length ? (
          <View style={s.section}>
            <Text style={s.h2}>Client wish list</Text>
            <Options first="Wish" wide />
            {m.wishes.map((w, i) => (
              <View key={i} style={s.tr} wrap={false}>
                <View style={s.wide}><Text>{w.text}</Text><Text style={s.need}>{w.need}</Text></View>
                {w.marks.map((c, n) => <Text key={n} style={s.td}>{c}</Text>)}
              </View>
            ))}
            {m.must ? (
              <View style={s.tr} wrap={false}>
                <Text style={{ ...s.wide, color: PDF_SUB }}>Must have met</Text>
                {m.must.map((c, n) => <Text key={n} style={s.tdNum}>{c}</Text>)}
              </View>
            ) : null}
          </View>
        ) : null}

        {sourced.length ? (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Source documents</Text>
            <View style={s.th}><Text style={{ ...s.wide, fontSize: 7.5, color: PDF_SUB, fontWeight: 500 }}>Option</Text><Text style={s.thCell}>Document</Text></View>
            {sourced.map((o, i) => (
              <View key={i} style={s.tr}><Text style={s.wide}>{[o.name, o.insurer].filter(Boolean).join(' · ')}</Text><Text style={s.td}>{o.document}</Text></View>
            ))}
          </View>
        ) : null}

        <View style={s.foot} fixed>
          <Text style={s.note}>{SUMMARY_FOOTNOTE}</Text>
          <Text style={s.company}>{TRS_LETTERHEAD.companyName} · Co. Reg. No. {TRS_LETTERHEAD.coRegNo} · {TRS_LETTERHEAD.footerAddress} · +65 {TRS_LETTERHEAD.phone}</Text>
        </View>
      </Page>
    </Document>
  )
}
