/**
 * Renders a TRS-branded debit note PDF — the 29 Oct 2026 design Jarod signed off (artifact
 * 61HXAuwpZJbygUbcLkuS5A): the TRS 保风 wordmark stacked at the top left beside "Debit note"
 * and its number, client and dates, then ONE plain table (policy details, premium lines, the
 * total as its last row), bank details with the PayNow QR on SGD notes, company details in the
 * footer. Fonts are the brand faces (pdf-fonts.ts); callers register them first. Earlier: a
 * 1:1 match of the paper template (DN260607) — client + policy details,
 * an itemized premium table (an optional negative "Fee rebate" line, never GST — GST is tracked
 * internally only, per the client not being GST-registered), and a bank/PayNow details block
 * pinned to a fixed position at the bottom of every page (react-pdf `fixed`) so it stays
 * consistent regardless of how many line items are in the table above it. Bank details are
 * currency-dependent (SGD: local DBS + PayNow; USD: wire transfer + correspondent agent bank)
 * and come from `data.bankProfile`, looked up by the caller via getBankProfileForCurrency().
 *
 * NOTE: the real TRS logo and the bank's PayNow QR code image are not available in this
 * repo (public/ is empty). Both are optional image assets, passed in as `logoSrc`/`qrSrc`
 * rather than resolved in this file — this component has no filesystem access of its own,
 * which is what keeps it safe to import from a client component (the review form's live
 * preview, see DebitNotePreviewPanel.tsx). The actual existsSync() presence check (never
 * embed a src unless the file is confirmed to exist — no broken image, and no fake/broken QR
 * that could misdirect a real payment) lives server-side in debit-note-pdf-server.tsx, the
 * only caller that can resolve a real file path; the live preview always passes null for both
 * (falls back to text-only), same as production renders today since neither asset exists yet.
 */
import { Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer'
import { PDF_GREEN, PDF_HAIR, PDF_INK, PDF_MUT, PDF_SUB } from '@/lib/pdf-fonts'

export type DebitNotePdfLineItem = { description: string; amount: number }

export interface DebitNoteBankProfile {
  bankName:            string
  bankAccountName:     string
  bankAccountNumber:   string
  bankCode?:            string | null
  branchCode?:          string | null
  swiftCode?:           string | null
  /** SGD-domestic only — a USD (or other wire-transfer) profile omits this, which also hides the PayNow QR. */
  payNowUen?:           string | null
  /** USD (wire transfer) only — the correspondent bank that clears the incoming USD payment. */
  agentBankSwiftBic?:   string | null
  agentBankName?:       string | null
}

export interface DebitNotePdfData {
  debitNoteNo:        string
  issueDate:          string
  coverNoteNo?:        string | null
  policyNumber?:       string | null
  clientName:         string
  clientAddress?:      string | null
  clientContactName?:  string | null   // renders as "ATTN: {name}" under the address, if present
  classOfInsurance?:   string | null
  periodStart?:        string | null
  periodEnd?:          string | null
  insurer?:            string | null
  description?:        string | null
  currency:           string
  lineItems:          DebitNotePdfLineItem[]
  /** Stored/tracked for internal accounting only — never printed on the PDF (the client isn't
   *  GST-registered) — but still folded into `total` below. */
  gstAmount?:          number | null
  /** Rendered as its own negative "Fee rebate" line item when truthy. */
  feeRebate?:          number | null
  /** "Premium Total" shown at the bottom — sum(lineItems) + gstAmount − feeRebate (the DB's
   *  net_amount). Callers must pass the net figure; this component never recomputes it. */
  total:              number
  /** Currency-dependent bank/PayNow-or-wire details — look up via getBankProfileForCurrency(). */
  bankProfile:        DebitNoteBankProfile
  paymentDueDate?:     string | null
  /** endorsement means this debit note bills a mid-term change (e.g. an employee added partway
   *  through the year) rather than the policy's own period_start/period_end — without calling
   *  that out, the payment due date lands well inside (or near the end of) the shown Period of
   *  Insurance and reads as a mismatch/error to the client. */
  eventType?:                  'new_business' | 'renewal' | 'endorsement'
  endorsementEffectiveDate?:   string | null
}

// Not currency-dependent — bank/PayNow/wire details now come from data.bankProfile
// (getBankProfileForCurrency()) instead, so USD debit notes can show a different block.
export const TRS_LETTERHEAD = {
  companyName: 'Trade Risk Solutions Pte. Ltd.',
  coRegNo:     '202022795H',
  remittanceEmail:     'admin@trade-risksol.com',
  phone:               '6238 0888',
  footerAddress:       '9 Temasek Boulevard, #32-01 Suntec Tower 2, Singapore 038989',
}

const styles = StyleSheet.create({
  // paddingBottom reserves room for the `fixed` payment block at the foot of every page, so the
  // table page-breaks before it rather than running underneath it.
  page:      { paddingTop: 40, paddingHorizontal: 44, paddingBottom: 250, fontSize: 9, fontFamily: 'Geist', color: PDF_INK, lineHeight: 1.4 },
  head:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: `1.2pt solid ${PDF_GREEN}` },
  mark:      { alignItems: 'center' },
  markT:     { fontFamily: 'TRS Mark', fontSize: 21, lineHeight: 1, letterSpacing: 4.2, color: PDF_GREEN, paddingLeft: 4.2 },
  markC:     { fontFamily: 'TRS Brush', fontSize: 15, lineHeight: 1, letterSpacing: 5, color: PDF_GREEN, paddingLeft: 5 },
  markGap:   { height: 6 },
  titleBox:  { alignItems: 'flex-end' },
  title:     { fontFamily: 'EB Garamond', fontWeight: 500, fontSize: 26, lineHeight: 1 },
  number:    { fontFamily: 'Geist Mono', fontWeight: 500, fontSize: 11.5, color: PDF_GREEN, marginTop: 4 },
  parties:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  billTo:    { width: '52%' },
  label:     { fontSize: 7, color: PDF_MUT, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 3 },
  client:    { fontWeight: 600 },
  meta:      { width: '40%' },
  metaRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  metaKey:   { color: PDF_SUB },
  metaVal:   { textAlign: 'right' },
  metaStrong:{ textAlign: 'right', fontWeight: 600 },
  table:     { marginTop: 18 },
  th:        { flexDirection: 'row', paddingBottom: 4, borderBottom: `1pt solid ${PDF_INK}` },
  thDesc:    { flex: 1, fontSize: 7.5, color: PDF_SUB, fontWeight: 500 },
  thAmt:     { width: 110, fontSize: 7.5, color: PDF_SUB, fontWeight: 500, textAlign: 'right' },
  tr:        { flexDirection: 'row', paddingVertical: 5, borderBottom: `0.5pt solid ${PDF_HAIR}` },
  tdKey:     { width: '34%', color: PDF_SUB },
  tdVal:     { flex: 1 },
  tdAmt:     { width: 110, textAlign: 'right' },
  sum:       { flexDirection: 'row', paddingVertical: 6, borderTop: `1pt solid ${PDF_INK}`, borderBottom: `1.6pt solid ${PDF_INK}`, marginTop: -0.5 },
  sumLabel:  { flex: 1, fontWeight: 600 },
  sumAmt:    { width: 110, textAlign: 'right', fontWeight: 600 },
  // The payment block sits at the same place on every page (react-pdf `fixed`).
  foot:      { position: 'absolute', bottom: 32, left: 44, right: 44 },
  pay:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  bank:      { flex: 1 },
  bankRow:   { flexDirection: 'row', marginBottom: 2 },
  bankKey:   { width: 112, color: PDF_SUB },
  bankVal:   { flex: 1, fontWeight: 500 },
  qrBox:     { width: 96, alignItems: 'center' },
  qr:        { width: 92, height: 92, border: `0.5pt solid ${PDF_HAIR}` },
  qrCap:     { fontSize: 7, color: PDF_SUB, textAlign: 'center', marginTop: 3 },
  notes:     { marginTop: 12, paddingTop: 8, borderTop: `0.5pt solid ${PDF_HAIR}`, fontSize: 7.5, color: PDF_SUB, lineHeight: 1.45 },
  company:   { marginTop: 8, paddingTop: 7, borderTop: `1.2pt solid ${PDF_GREEN}`, fontSize: 7.5, color: PDF_SUB },
})

const money = (n: number) => n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '–'

export function DebitNotePdfDocument({ data, logoSrc = null, qrSrc = null }: {
  data: DebitNotePdfData
  /** Unused since the wordmark is set in the brand fonts; kept so existing callers compile. */
  logoSrc?: string | null
  /** The PayNow QR (server: file path; preview: URL). Shown on notes whose bank profile has a PayNow UEN. */
  qrSrc?:   string | null
}) {
  void logoSrc
  const cur = data.currency
  const lineItemsTotal = data.lineItems.reduce((s, l) => s + l.amount, 0)
  const b = data.bankProfile
  const usd = !b.payNowUen && !!b.agentBankSwiftBic
  const period = data.periodStart || data.periodEnd ? `${fmtDate(data.periodStart)} to ${fmtDate(data.periodEnd)}` : '–'
  const detail = (k: string, v?: string | null) => (
    <View style={styles.tr} wrap={false}><Text style={styles.tdKey}>{k}</Text><Text style={styles.tdVal}>{v || '–'}</Text><Text style={styles.tdAmt}> </Text></View>
  )

  return (
    <Document title={`Debit note ${data.debitNoteNo}`} author={TRS_LETTERHEAD.companyName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.head}>
          <View style={styles.mark}><View><Text style={styles.markT}>TRS</Text></View><View style={styles.markGap} /><View><Text style={styles.markC}>保风</Text></View></View>
          <View style={styles.titleBox}><Text style={styles.title}>Debit note</Text><Text style={styles.number}>{data.debitNoteNo}</Text></View>
        </View>

        <View style={styles.parties}>
          <View style={styles.billTo}>
            <Text style={styles.label}>Bill to</Text>
            <Text style={styles.client}>{data.clientName}</Text>
            {(data.clientAddress ?? '').split('\n').filter(Boolean).map((l, i) => <Text key={i}>{l}</Text>)}
            {data.clientContactName ? <Text style={{ marginTop: 3, color: PDF_SUB }}>Attn: {data.clientContactName}</Text> : null}
          </View>
          <View style={styles.meta}>
            <View style={styles.metaRow}><Text style={styles.metaKey}>Date</Text><Text style={styles.metaVal}>{fmtDate(data.issueDate)}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaKey}>Policy no.</Text><Text style={styles.metaVal}>{data.policyNumber || '–'}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaKey}>Cover note no.</Text><Text style={styles.metaVal}>{data.coverNoteNo || '–'}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaKey}>Payment due</Text><Text style={styles.metaStrong}>{fmtDate(data.paymentDueDate)}</Text></View>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.th} fixed><Text style={styles.thDesc}>Description</Text><Text style={styles.thAmt}>Amount ({cur})</Text></View>
          {detail('Class of insurance', data.classOfInsurance)}
          {detail('Period of insurance', period)}
          {detail('Insurance company', data.insurer)}
          {data.eventType === 'endorsement' && detail('Endorsement effective', fmtDate(data.endorsementEffectiveDate))}
          {detail('Description', data.description)}
          {data.lineItems.map((li, i) => (
            <View key={i} style={styles.tr} wrap={false}><Text style={{ flex: 1 }}>{li.description}</Text><Text style={styles.tdAmt}>{money(li.amount)}</Text></View>
          ))}
          {data.lineItems.length === 0 && (
            <View style={styles.tr}><Text style={{ flex: 1 }}>Gross premium collected on behalf of the insurance company</Text><Text style={styles.tdAmt}>{money(lineItemsTotal || data.total)}</Text></View>
          )}
          {!!data.feeRebate && (
            <View style={styles.tr}><Text style={{ flex: 1 }}>Fee rebate</Text><Text style={styles.tdAmt}>-{money(data.feeRebate)}</Text></View>
          )}
          <View style={styles.sum} wrap={false}><Text style={styles.sumLabel}>Total ({cur})</Text><Text style={styles.sumAmt}>{money(data.total)}</Text></View>
        </View>

        <View style={styles.foot} fixed>
          <View style={styles.pay}>
            <View style={styles.bank}>
              <Text style={styles.label}>{usd ? `Telegraphic transfer in ${cur}` : 'Bank transfer'}</Text>
              <View style={styles.bankRow}><Text style={styles.bankKey}>Bank</Text><Text style={styles.bankVal}>{b.bankName}</Text></View>
              <View style={styles.bankRow}><Text style={styles.bankKey}>Account name</Text><Text style={styles.bankVal}>{b.bankAccountName}</Text></View>
              <View style={styles.bankRow}><Text style={styles.bankKey}>Account no.</Text><Text style={styles.bankVal}>{b.bankAccountNumber}</Text></View>
              {(b.bankCode || b.branchCode) ? <View style={styles.bankRow}><Text style={styles.bankKey}>Bank / branch code</Text><Text style={styles.bankVal}>{[b.bankCode, b.branchCode].filter(Boolean).join(' / ')}</Text></View> : null}
              {b.swiftCode ? <View style={styles.bankRow}><Text style={styles.bankKey}>SWIFT</Text><Text style={styles.bankVal}>{b.swiftCode}</Text></View> : null}
              {b.agentBankName ? <View style={styles.bankRow}><Text style={styles.bankKey}>Correspondent bank</Text><Text style={styles.bankVal}>{b.agentBankName}</Text></View> : null}
              {b.agentBankSwiftBic ? <View style={styles.bankRow}><Text style={styles.bankKey}>Correspondent SWIFT</Text><Text style={styles.bankVal}>{b.agentBankSwiftBic}</Text></View> : null}
              {b.payNowUen ? <View style={styles.bankRow}><Text style={styles.bankKey}>PayNow UEN</Text><Text style={styles.bankVal}>{b.payNowUen}</Text></View> : null}
            </View>
            {qrSrc && b.payNowUen ? (
              <View style={styles.qrBox}><Image src={qrSrc} style={styles.qr} /><Text style={styles.qrCap}>Scan to pay by PayNow{'\n'}Reference: {data.debitNoteNo}</Text></View>
            ) : null}
          </View>
          <View style={styles.notes}>
            <Text>Quote the debit note number on the remittance advice and email it to {TRS_LETTERHEAD.remittanceEmail}.</Text>
            <Text>This is not a tax invoice. The insurance company&apos;s tax invoice is attached or will follow. A premium payment warranty is imposed by the insurer: the policy ends automatically if payment is not made by the due date.</Text>
          </View>
          <Text style={styles.company}>{TRS_LETTERHEAD.companyName} · Co. Reg. No. {TRS_LETTERHEAD.coRegNo} · {TRS_LETTERHEAD.footerAddress} · +65 {TRS_LETTERHEAD.phone}</Text>
        </View>
      </Page>
    </Document>
  )
}
