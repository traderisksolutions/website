/**
 * Renders a TRS-branded debit note PDF — a 1:1 layout match of the real paper template
 * (verified against TRS DN260607, Propelo Aviation) — logo/letterhead, client + policy details,
 * an itemized premium table (an optional negative "Fee rebate" line, never GST — GST is tracked
 * internally only, per the client not being GST-registered), and a bank/PayNow details block
 * pinned to a fixed position at the bottom of every page (react-pdf `fixed`) so it stays
 * consistent regardless of how many line items are in the table above it. Bank details are
 * currency-dependent (SGD: local DBS + PayNow; USD: wire transfer + correspondent agent bank)
 * and come from `data.bankProfile`, looked up by the caller via getBankProfileForCurrency().
 *
 * NOTE: the real TRS logo and the bank's PayNow QR code image are not available in this
 * repo (public/ is empty). Both are optional image assets — if
 * public/debit-note/trs-logo.png / paynow-qr.png exist at render time they're embedded;
 * otherwise the layout gracefully falls back to text-only (no fake/broken QR is ever
 * generated — scanning a wrong code would misdirect a real payment).
 */
import { Document, Page, Text, View, StyleSheet, Image, renderToBuffer } from '@react-pdf/renderer'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

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
  companyName: 'Trade Risk Solutions Pte Ltd',
  coRegNo:     '202022795H',
  remittanceEmail:     'admin@trade-risksol.com',
  phone:               '6238 0888',
  footerAddress:       '9 Temasek Boulevard, Suntec Tower 2 #32-01, Singapore 038989',
}

const styles = StyleSheet.create({
  // paddingBottom is deliberately much larger than the other sides — it reserves room for the
  // `fixed` footer block (sized for its tallest variant: the SGD PayNow QR), so normal-flow
  // content (the line-items table) page-breaks before it ever reaches that zone instead of
  // rendering underneath the footer that's absolutely positioned on top of it.
  page:     { padding: 32, paddingBottom: 260, fontSize: 9, fontFamily: 'Helvetica', color: '#111' },
  headerRow:  { alignItems: 'center', marginBottom: 4 },
  logo:       { width: 90, height: 90, objectFit: 'contain' },
  logoText:   { fontSize: 13, fontWeight: 700, textAlign: 'center' },
  coReg:      { textAlign: 'center', fontSize: 8, borderBottom: '1pt solid #111', paddingBottom: 6, marginBottom: 10 },
  title:      { fontSize: 16, fontWeight: 700, textAlign: 'center', marginBottom: 14 },
  topGrid:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  addrBlock:  { width: '50%' },
  attn:       { marginTop: 6 },
  metaBlock:  { width: '46%' },
  metaRow:    { flexDirection: 'row', marginBottom: 2 },
  metaLabel:  { width: 90, color: '#444' },
  metaValue:  { flex: 1, fontWeight: 700 },
  section:    { flexDirection: 'row', marginBottom: 5 },
  sectionLabel: { width: 130, color: '#444' },
  sectionValue: { flex: 1 },
  endorsementBanner: { backgroundColor: '#fff7ed', border: '0.75pt solid #fdba74', borderRadius: 3, padding: 6, marginBottom: 10 },
  endorsementLabel:  { fontSize: 8, fontWeight: 700, color: '#c2410c', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  endorsementText:   { fontSize: 9, color: '#7c2d12' },
  table:      { marginTop: 10, borderTop: '1pt solid #111' },
  tableRow:   { flexDirection: 'row', paddingVertical: 4, borderBottom: '0.5pt solid #ccc' },
  tableDesc:  { flex: 1 },
  tableAmt:   { width: 90, textAlign: 'right' },
  totalRow:   { flexDirection: 'row', paddingVertical: 6, borderTop: '1pt solid #111', marginTop: 2 },
  totalLabel: { flex: 1, fontWeight: 700, fontSize: 11 },
  totalAmt:   { width: 90, textAlign: 'right', fontWeight: 700, fontSize: 11 },
  // Pinned to the same position on every page (react-pdf `fixed`) so payment terms/bank details
  // never drift with how many line items are in the table above — independent of normal flow.
  footerFixed: { position: 'absolute', bottom: 30, left: 32, right: 32 },
  noteBlock:  { fontSize: 8, color: '#333', lineHeight: 1.5 },
  paymentByRow: { flexDirection: 'row', marginTop: 4 },
  paymentByLabel: { width: 130 },
  paymentByValue: { fontWeight: 700 },
  bankBlock:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  bankRows:   { flex: 1 },
  bankRow:    { flexDirection: 'row', marginBottom: 2 },
  bankLabel:  { width: 130, color: '#444' },
  bankValue:  { flex: 1, fontWeight: 700 },
  qr:         { width: 90, height: 90 },
  footer:     { marginTop: 20, textAlign: 'center', fontSize: 7.5, color: '#666', borderTop: '0.5pt solid #ccc', paddingTop: 8 },
})

const fmt = (n: number, currency: string) => `${currency} ${n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'
const fmtSlashDate = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function assetPath(name: string): string | null {
  const p = join(process.cwd(), 'public', 'debit-note', name)
  return existsSync(p) ? p : null
}

export function DebitNotePdfDocument({ data }: { data: DebitNotePdfData }) {
  const logoPath = assetPath('trs-logo.png')
  const qrPath    = assetPath('paynow-qr.png')
  const lineItemsTotal = data.lineItems.reduce((s, l) => s + l.amount, 0)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          {logoPath ? <Image src={logoPath} style={styles.logo} /> : <Text style={styles.logoText}>TRADE RISK{'\n'}SOLUTIONS</Text>}
        </View>
        <Text style={styles.coReg}>Co Reg No {TRS_LETTERHEAD.coRegNo}</Text>
        <Text style={styles.title}>DEBIT NOTE</Text>

        <View style={styles.topGrid}>
          <View style={styles.addrBlock}>
            <Text style={{ fontWeight: 700 }}>{data.clientName}</Text>
            {(data.clientAddress ?? '').split('\n').filter(Boolean).map((l, i) => <Text key={i}>{l}</Text>)}
            {data.clientContactName && <Text style={styles.attn}>ATTN: {data.clientContactName}</Text>}
          </View>
          <View style={styles.metaBlock}>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>Date:</Text><Text style={styles.metaValue}>{fmtDate(data.issueDate)}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>Debit Note No:</Text><Text style={styles.metaValue}>{data.debitNoteNo}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>Cover Note No:</Text><Text style={styles.metaValue}>{data.coverNoteNo || ''}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>Policy No:</Text><Text style={styles.metaValue}>{data.policyNumber || '—'}</Text></View>
          </View>
        </View>

        <View style={styles.section}><Text style={styles.sectionLabel}>Class of Insurance</Text><Text style={styles.sectionValue}>{data.classOfInsurance || ''}</Text></View>
        <View style={styles.section}><Text style={styles.sectionLabel}>Period of Insurance</Text><Text style={styles.sectionValue}>{fmtSlashDate(data.periodStart)} to {fmtSlashDate(data.periodEnd)}</Text></View>
        <View style={styles.section}><Text style={styles.sectionLabel}>Insurance Company</Text><Text style={styles.sectionValue}>{data.insurer || ''}</Text></View>

        {data.eventType === 'endorsement' ? (
          <View style={styles.endorsementBanner}>
            <Text style={styles.endorsementLabel}>Mid-Term Endorsement — Effective {fmtSlashDate(data.endorsementEffectiveDate)}</Text>
            <Text style={styles.endorsementText}>{data.description || ''}</Text>
          </View>
        ) : (
          <View style={styles.section}><Text style={styles.sectionLabel}>Description</Text><Text style={styles.sectionValue}>{data.description || ''}</Text></View>
        )}

        <View style={styles.table}>
          {data.lineItems.map((li, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.tableDesc}>{li.description}</Text>
              <Text style={styles.tableAmt}>{fmt(li.amount, data.currency)}</Text>
            </View>
          ))}
          {!!data.feeRebate && (
            <View style={styles.tableRow}>
              <Text style={styles.tableDesc}>Fee rebate</Text>
              <Text style={styles.tableAmt}>{`-${fmt(data.feeRebate, data.currency)}`}</Text>
            </View>
          )}
          {data.lineItems.length === 0 && (
            <View style={styles.tableRow}>
              <Text style={styles.tableDesc}>Gross Premium collected on behalf of Insurance Company</Text>
              <Text style={styles.tableAmt}>{fmt(lineItemsTotal, data.currency)}</Text>
            </View>
          )}
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Premium Total</Text>
          <Text style={styles.totalAmt}>{fmt(data.total, data.currency)}</Text>
        </View>

        {/* Pinned to a fixed bottom position on every page — see styles.footerFixed — so it
            stays consistent regardless of how many line items pushed the table above it, and
            still repeats if the table spills onto a second page. */}
        <View style={styles.footerFixed} fixed>
          {/* Matches the real template's exact wording, including the two separate
              "please make payment by" mentions — the first trails off the Warranty sentence,
              the second is its own labelled row with the actual date. */}
          <View style={styles.noteBlock}>
            <Text>Note:    This is not a tax invoice. The insurance company&apos;s tax invoice is attached or will be sent to you shortly.</Text>
            <Text>              Premium Payment Warranty is imposed by the insurer. To avoid automatic termination of policy,</Text>
            <Text>                 please make payment by</Text>
            <View style={styles.paymentByRow}>
              <Text style={styles.paymentByLabel}>Please make payment by</Text>
              <Text style={styles.paymentByValue}>{fmtSlashDate(data.paymentDueDate)}</Text>
            </View>
            <Text style={{ marginTop: 4 }}>Quote debit note no. on the remittance advice and email document to {TRS_LETTERHEAD.remittanceEmail}</Text>
          </View>

          <View style={styles.bankBlock}>
            <View style={styles.bankRows}>
              <View style={styles.bankRow}><Text style={styles.bankLabel}>Bank Name:</Text><Text style={styles.bankValue}>{data.bankProfile.bankName}</Text></View>
              <View style={styles.bankRow}><Text style={styles.bankLabel}>Bank Account Name:</Text><Text style={styles.bankValue}>{data.bankProfile.bankAccountName}</Text></View>
              <View style={styles.bankRow}><Text style={styles.bankLabel}>Bank Account Number:</Text><Text style={styles.bankValue}>{data.bankProfile.bankAccountNumber}</Text></View>
              {data.bankProfile.bankCode && <View style={styles.bankRow}><Text style={styles.bankLabel}>Bank Code:</Text><Text style={styles.bankValue}>{data.bankProfile.bankCode}</Text></View>}
              {data.bankProfile.branchCode && <View style={styles.bankRow}><Text style={styles.bankLabel}>Branch Code:</Text><Text style={styles.bankValue}>{data.bankProfile.branchCode}</Text></View>}
              {data.bankProfile.swiftCode && <View style={styles.bankRow}><Text style={styles.bankLabel}>SWIFT Code:</Text><Text style={styles.bankValue}>{data.bankProfile.swiftCode}</Text></View>}
              {data.bankProfile.agentBankSwiftBic && (
                <>
                  <View style={{ height: 6 }} />
                  <View style={styles.bankRow}><Text style={styles.bankLabel}>Agent Bank Name:</Text><Text style={styles.bankValue}>{data.bankProfile.agentBankName}</Text></View>
                  <View style={styles.bankRow}><Text style={styles.bankLabel}>Agent Bank SWIFT Code BIC:</Text><Text style={styles.bankValue}>{data.bankProfile.agentBankSwiftBic}</Text></View>
                </>
              )}
              {data.bankProfile.payNowUen && (
                <>
                  <View style={{ height: 6 }} />
                  <View style={styles.bankRow}><Text style={styles.bankLabel}>PayNow UEN No:</Text><Text style={styles.bankValue}>{data.bankProfile.payNowUen}</Text></View>
                </>
              )}
            </View>
            {qrPath && data.bankProfile.payNowUen && <Image src={qrPath} style={styles.qr} />}
          </View>

          <Text style={{ marginTop: 10, fontSize: 8 }}>Please call us at {TRS_LETTERHEAD.phone} should you require further clarification.</Text>

          <Text style={styles.footer}>{TRS_LETTERHEAD.footerAddress}</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function renderDebitNotePdf(data: DebitNotePdfData): Promise<Buffer> {
  return renderToBuffer(<DebitNotePdfDocument data={data} />)
}
