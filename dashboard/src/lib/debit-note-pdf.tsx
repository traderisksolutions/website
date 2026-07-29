/**
 * Renders a TRS-branded debit note PDF, matching the existing paper template (see the
 * "DEBIT NOTE" sample) — logo/letterhead, client + policy details, an itemized premium
 * table with optional GST, static bank/PayNow details, and the standard footer notes.
 *
 * NOTE: the real TRS logo and the bank's PayNow QR code image are not available in this
 * repo (public/ is empty). Both are optional image assets — if
 * public/debit-note/trs-logo.png / paynow-qr.png exist at render time they're embedded;
 * otherwise the layout gracefully falls back to text-only (no fake/broken QR is ever
 * generated — scanning a wrong code would misdirect a real payment).
 */
import { Document, Page, Text, View, StyleSheet, Image, renderToBuffer } from '@react-pdf/renderer'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type DebitNotePdfLineItem = { description: string; amount: number }

export interface DebitNotePdfData {
  debitNoteNo:       string
  issueDate:         string
  coverNoteNo?:       string | null
  policyNumber?:      string | null
  clientName:        string
  clientAddress?:     string | null
  classOfInsurance?:  string | null
  periodStart?:       string | null
  periodEnd?:         string | null
  insurer?:           string | null
  description?:       string | null
  currency:          string
  lineItems:         DebitNotePdfLineItem[]
  gstAmount?:         number | null
  total:             number
  paymentDueDate?:    string | null
}

export const TRS_LETTERHEAD = {
  companyName: 'Trade Risk Solutions Pte Ltd',
  coRegNo:     '202022795H',
  bankName:            'DBS Bank',
  bankAccountName:     'Trade Risk Solutions Pte. Ltd.',
  bankAccountNumber:   '072-928492-0',
  bankCode:            '7171',
  branchCode:          '072',
  swiftCode:           'DBSSGSG',
  payNowUen:           '202022795HSGD',
  remittanceEmail:     'admin@trade-risksol.com',
  phone:               '6238 0888',
  footerAddress:       '9 Temasek Boulevard, Suntec Tower 2 #32-01, Singapore 038989',
}

const styles = StyleSheet.create({
  page:     { padding: 32, fontSize: 9, fontFamily: 'Helvetica', color: '#111' },
  headerRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  logo:       { width: 90, height: 42, objectFit: 'contain' },
  logoText:   { fontSize: 13, fontWeight: 700, textAlign: 'right' },
  coReg:      { textAlign: 'center', fontSize: 8, borderBottom: '1pt solid #111', paddingBottom: 6, marginBottom: 10 },
  title:      { fontSize: 16, fontWeight: 700, textAlign: 'center', marginBottom: 14 },
  topGrid:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  addrBlock:  { width: '50%' },
  metaBlock:  { width: '46%' },
  metaRow:    { flexDirection: 'row', marginBottom: 2 },
  metaLabel:  { width: 90, color: '#444' },
  metaValue:  { flex: 1, fontWeight: 700 },
  section:    { flexDirection: 'row', marginBottom: 5 },
  sectionLabel: { width: 130, color: '#444' },
  sectionValue: { flex: 1 },
  table:      { marginTop: 10, borderTop: '1pt solid #111' },
  tableRow:   { flexDirection: 'row', paddingVertical: 4, borderBottom: '0.5pt solid #ccc' },
  tableDesc:  { flex: 1 },
  tableAmt:   { width: 90, textAlign: 'right' },
  totalRow:   { flexDirection: 'row', paddingVertical: 6, borderTop: '1pt solid #111', marginTop: 2 },
  totalLabel: { flex: 1, fontWeight: 700, fontSize: 11 },
  totalAmt:   { width: 90, textAlign: 'right', fontWeight: 700, fontSize: 11 },
  noteBlock:  { marginTop: 18, fontSize: 8, color: '#333', lineHeight: 1.5 },
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
          <View />
          {logoPath ? <Image src={logoPath} style={styles.logo} /> : <Text style={styles.logoText}>TRADE RISK{'\n'}SOLUTIONS</Text>}
        </View>
        <Text style={styles.coReg}>Co Reg No {TRS_LETTERHEAD.coRegNo}</Text>
        <Text style={styles.title}>DEBIT NOTE</Text>

        <View style={styles.topGrid}>
          <View style={styles.addrBlock}>
            <Text style={{ fontWeight: 700 }}>{data.clientName}</Text>
            {(data.clientAddress ?? '').split('\n').filter(Boolean).map((l, i) => <Text key={i}>{l}</Text>)}
          </View>
          <View style={styles.metaBlock}>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>Date:</Text><Text style={styles.metaValue}>{fmtDate(data.issueDate)}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>Debit Note No</Text><Text style={styles.metaValue}>{data.debitNoteNo}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>Cover Note No:</Text><Text style={styles.metaValue}>{data.coverNoteNo || '—'}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>Policy No:</Text><Text style={styles.metaValue}>{data.policyNumber || '—'}</Text></View>
          </View>
        </View>

        <View style={styles.section}><Text style={styles.sectionLabel}>Class of Insurance</Text><Text style={styles.sectionValue}>{data.classOfInsurance || '—'}</Text></View>
        <View style={styles.section}><Text style={styles.sectionLabel}>Period of Insurance</Text><Text style={styles.sectionValue}>{fmtDate(data.periodStart)} to {fmtDate(data.periodEnd)} (both dates inclusive)</Text></View>
        <View style={styles.section}><Text style={styles.sectionLabel}>Insurance Company</Text><Text style={styles.sectionValue}>{data.insurer || '—'}</Text></View>
        {data.description && (
          <View style={styles.section}><Text style={styles.sectionLabel}>Description</Text><Text style={styles.sectionValue}>{data.description}</Text></View>
        )}

        <View style={styles.table}>
          {data.lineItems.map((li, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.tableDesc}>{li.description}</Text>
              <Text style={styles.tableAmt}>{fmt(li.amount, data.currency)}</Text>
            </View>
          ))}
          {!!data.gstAmount && (
            <View style={styles.tableRow}>
              <Text style={styles.tableDesc}>GST</Text>
              <Text style={styles.tableAmt}>{fmt(data.gstAmount, data.currency)}</Text>
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
          <Text style={styles.totalLabel}>TOTAL</Text>
          <Text style={styles.totalAmt}>{fmt(data.total, data.currency)}</Text>
        </View>

        <View style={styles.noteBlock}>
          <Text>Note: This is not a tax invoice. The insurance company&apos;s tax invoice is attached or will be sent to you shortly.</Text>
          <Text>Premium Payment Warranty is imposed by the insurer. To avoid automatic termination of policy, please make payment by {fmtDate(data.paymentDueDate)}.</Text>
          <Text>Quote debit note no. on the remittance advice and email document to {TRS_LETTERHEAD.remittanceEmail}</Text>
        </View>

        <View style={styles.bankBlock}>
          <View style={styles.bankRows}>
            <View style={styles.bankRow}><Text style={styles.bankLabel}>Bank Name:</Text><Text style={styles.bankValue}>{TRS_LETTERHEAD.bankName}</Text></View>
            <View style={styles.bankRow}><Text style={styles.bankLabel}>Bank Account Name:</Text><Text style={styles.bankValue}>{TRS_LETTERHEAD.bankAccountName}</Text></View>
            <View style={styles.bankRow}><Text style={styles.bankLabel}>Bank Account Number:</Text><Text style={styles.bankValue}>{TRS_LETTERHEAD.bankAccountNumber}</Text></View>
            <View style={styles.bankRow}><Text style={styles.bankLabel}>Bank Code:</Text><Text style={styles.bankValue}>{TRS_LETTERHEAD.bankCode}</Text></View>
            <View style={styles.bankRow}><Text style={styles.bankLabel}>Branch Code:</Text><Text style={styles.bankValue}>{TRS_LETTERHEAD.branchCode}</Text></View>
            <View style={styles.bankRow}><Text style={styles.bankLabel}>SWIFT Code:</Text><Text style={styles.bankValue}>{TRS_LETTERHEAD.swiftCode}</Text></View>
            <View style={{ height: 6 }} />
            <View style={styles.bankRow}><Text style={styles.bankLabel}>PayNow UEN No:</Text><Text style={styles.bankValue}>{TRS_LETTERHEAD.payNowUen}</Text></View>
          </View>
          {qrPath && <Image src={qrPath} style={styles.qr} />}
        </View>

        <Text style={{ marginTop: 10, fontSize: 8 }}>Please call us at {TRS_LETTERHEAD.phone} should you require further clarification.</Text>

        <Text style={styles.footer}>{TRS_LETTERHEAD.footerAddress}</Text>
      </Page>
    </Document>
  )
}

export async function renderDebitNotePdf(data: DebitNotePdfData): Promise<Buffer> {
  return renderToBuffer(<DebitNotePdfDocument data={data} />)
}
