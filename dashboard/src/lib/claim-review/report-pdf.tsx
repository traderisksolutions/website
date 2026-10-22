/**
 * Claim second opinion as an A4 PDF, Corp Cover branded. Order: claim facts → summary and
 * counts → one block per insurer reason (verdict, clause quoted, reasoning, question) → clauses
 * in the policyholder's favour → missing documents → next steps → dispute body. Server-only.
 */
import React from 'react'
import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from '@react-pdf/renderer'
import type { ReportRun, Verdict } from './analyse'

Font.registerHyphenationCallback(word => [word])

const GREEN = '#14432f', INK = '#141816', MUTED = '#5e6460', FAINT = '#858b87', RULE = '#e2e0d9', TINT = '#e3ece6'
const V: Record<Verdict, { label: string; bg: string; fg: string }> = {
  supported: { label: "Supported by the wording", bg: '#e3f2e3', fg: '#1d5e2c' },
  not_supported: { label: 'Not supported by the wording', bg: '#fbe3e1', fg: '#9a2b22' },
  unclear: { label: 'Unclear', bg: '#f1e8d2', fg: '#6a521c' },
}
const OVERALL: Record<ReportRun['overall'], string> = {
  policyholder_favoured: 'Most reasons are not supported by the wording',
  mixed: 'Some reasons are supported and some are not',
  insurer_favoured: 'Most reasons are supported by the wording',
}

/** Where a dispute goes next, per market. Matches corpcover src/lib/market.ts (legal review 21 Oct 2026). */
export const DISPUTE: Record<string, string> = {
  SG: "If the insurer's final reply does not change the decision, you can file with FIDReC within 6 months of that reply. FIDReC takes disputes from individuals, sole proprietors, charities and small businesses with group turnover of S$1 million or less in each of the last 2 financial years. Filing and mediation are free; adjudication costs S$50, or S$250 for a small business, and awards are capped at S$150,000.",
  MY: "If the insurer's final decision stands, you can file with the Financial Markets Ombudsman Service (FMOS) within 6 months. FMOS takes disputes up to RM250,000 from individuals and micro and small businesses, free of charge.",
  HK: "For a personal policy, you can complain to the Insurance Complaints Bureau (ICB) within 6 months of the insurer's final decision. The ICB takes personal policies only, up to HK$1,500,000, free of charge. Business policies are outside its scope.",
}

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 64, paddingHorizontal: 44, fontSize: 9.5, fontFamily: 'Helvetica', color: INK, lineHeight: 1.45 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 2, borderBottomColor: GREEN, paddingBottom: 8, marginBottom: 20 },
  brand: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: GREEN },
  eyebrow: { fontSize: 7.5, letterSpacing: 1, color: MUTED, fontFamily: 'Helvetica-Bold' },
  title: { fontSize: 22, fontFamily: 'Helvetica-Bold', lineHeight: 1.15, marginBottom: 4 },
  sub: { fontSize: 9, color: MUTED, marginBottom: 16 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#f6f5f1', padding: 10, marginBottom: 16 },
  fact: { width: '33.33%', paddingVertical: 4, paddingRight: 8 },
  factL: { fontSize: 7, color: FAINT, marginBottom: 1 },
  h2: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 8 },
  counts: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  count: { flex: 1, padding: 8, backgroundColor: TINT },
  countN: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: GREEN, lineHeight: 1.1, marginBottom: 3 },
  reason: { borderTopWidth: 0.75, borderTopColor: RULE, paddingTop: 10, marginBottom: 12 },
  rHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
  rTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10.5, flex: 1 },
  chip: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', paddingVertical: 3, paddingHorizontal: 6 },
  label: { fontSize: 7.5, color: FAINT, marginTop: 5, marginBottom: 1 },
  quote: { fontFamily: 'Helvetica-Oblique', color: INK, backgroundColor: '#fafaf8', borderLeftWidth: 2, borderLeftColor: GREEN, paddingVertical: 4, paddingHorizontal: 7 },
  check: { fontSize: 7, color: FAINT, marginTop: 2 },
  li: { flexDirection: 'row', marginBottom: 4 },
  note: { fontSize: 8.5, color: MUTED, backgroundColor: '#f6f5f1', padding: 10, marginTop: 8 },
  foot: { position: 'absolute', left: 44, right: 44, bottom: 24, fontSize: 7, color: FAINT, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 6 },
})

const check = (v: boolean | null | undefined) => v === true ? 'Quote checked word for word against your documents.' : v === false ? 'Quote not found word for word in the uploaded text. Adviser to confirm against the original.' : 'Quote not machine-checked (scanned document). Adviser to confirm.'
const d = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

function ReportDoc({ r, client, market, refNo }: { r: ReportRun; client: string; market: string; refNo: string }) {
  const n = (v: Verdict) => r.reasons.filter(x => x.verdict === v).length
  const facts: [string, string][] = [
    ['Policyholder', r.claim.policyholder || client], ['Insurer', r.claim.insurer], ['Policy', [r.claim.policy_type, r.claim.policy_number].filter(Boolean).join(' · ')],
    ['Claim', r.claim.claim_type], ['Date of loss', r.claim.loss_date], ['Insurer decision', [r.claim.insurer_decision, r.claim.decision_date].filter(Boolean).join(' · ')],
    ['Amount claimed', r.claim.amount_claimed], ['Amount paid', r.claim.amount_paid], ["Reference", refNo],
  ]
  return (
    <Document title={`Claim second opinion — ${client}`} author="Corp Cover">
      <Page size="A4" style={s.page}>
        <Text fixed style={s.foot}>Corp Cover claim second opinion. A reading of the documents provided against the policy wording. It is not legal advice, does not act for you with the insurer, and cannot promise a different outcome. Corp Cover is not an insurance broker or a financial adviser.</Text>
        <View style={s.top}><Text style={s.brand}>Corp Cover</Text><Text style={s.eyebrow}>CLAIM SECOND OPINION · {d(r.generated_at).toUpperCase()}</Text></View>
        <Text style={s.title}>{client}</Text>
        <Text style={s.sub}>{OVERALL[r.overall]}. Prepared from {r.files.length} document{r.files.length === 1 ? '' : 's'}.</Text>

        <View style={s.facts}>{facts.map(([l, v]) => <View key={l} style={s.fact}><Text style={s.factL}>{l}</Text><Text>{v || 'Not in the documents'}</Text></View>)}</View>

        <Text style={s.h2} minPresenceAhead={60}>Summary</Text>
        <Text>{r.summary}</Text>
        <View style={[s.counts, { marginTop: 10 }]}>
          <View style={s.count}><Text style={s.countN}>{n('not_supported')}</Text><Text>not supported by the wording</Text></View>
          <View style={s.count}><Text style={s.countN}>{n('unclear')}</Text><Text>unclear</Text></View>
          <View style={s.count}><Text style={s.countN}>{n('supported')}</Text><Text>supported by the wording</Text></View>
        </View>

        <Text style={s.h2} minPresenceAhead={60}>Each reason the insurer gave</Text>
        {r.reasons.map((x, i) => (
          <View key={i} style={s.reason} wrap={false}>
            <View style={s.rHead}>
              <Text style={s.rTitle}>{i + 1}. {x.reason}</Text>
              <Text style={[s.chip, { backgroundColor: V[x.verdict].bg, color: V[x.verdict].fg }]}>{V[x.verdict].label}</Text>
            </View>
            <Text style={s.label}>Clause · {x.clause_ref || 'None cited'}</Text>
            {x.clause_quote ? <><Text style={s.quote}>{x.clause_quote}</Text><Text style={s.check}>{check(x.quote_verified)}</Text></> : null}
            <Text style={s.label}>Reading</Text><Text>{x.reasoning}</Text>
            <Text style={s.label}>Question to put to the insurer in writing</Text><Text>{x.question_for_insurer}</Text>
          </View>
        ))}

        {r.clauses_for_policyholder.length > 0 && <>
          <Text style={s.h2} minPresenceAhead={60}>Clauses in your favour</Text>
          {r.clauses_for_policyholder.map((c, i) => (
            <View key={i} style={{ marginBottom: 10 }} wrap={false}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{c.clause_ref}</Text>
              <Text style={s.quote}>{c.clause_quote}</Text><Text style={s.check}>{check(c.quote_verified)}</Text>
              <Text style={{ marginTop: 3 }}>{c.why}</Text>
            </View>
          ))}
        </>}

        {r.missing_documents.length > 0 && <>
          <Text style={s.h2} minPresenceAhead={60}>Documents that would change a finding</Text>
          {r.missing_documents.map((m, i) => <View key={i} style={s.li}><Text style={{ width: 12 }}>•</Text><Text style={{ flex: 1 }}>{m}</Text></View>)}
        </>}

        <Text style={s.h2} minPresenceAhead={60}>Next steps</Text>
        {r.next_steps.map((m, i) => <View key={i} style={s.li}><Text style={{ width: 14 }}>{i + 1}.</Text><Text style={{ flex: 1 }}>{m}</Text></View>)}
        {DISPUTE[market] && <Text style={s.note}>{DISPUTE[market]}</Text>}
        <Text style={[s.note, { backgroundColor: TINT, color: GREEN }]}>A broker who did not sell you this policy will reply in this email thread to go through the report with you.</Text>
      </Page>
    </Document>
  )
}

export function renderClaimReportPdf(r: ReportRun, opts: { client: string; market: string; ref: string }): Promise<Buffer> {
  return renderToBuffer(<ReportDoc r={r} client={opts.client} market={opts.market} refNo={opts.ref} />)
}
