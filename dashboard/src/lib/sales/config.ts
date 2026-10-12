// Switches for the sales workflow. Every stage is off until its setting is in place.
//
//   Email lookup   NETROWS_API_KEY
//   Sending        the dashboard's Gmail connection (GMAIL_CLIENT_ID / _SECRET / _REFRESH_TOKEN,
//                  the same one the inbox uses) with CAMPAIGN_SENDER_EMAIL set up as a
//                  "Send mail as" alias on that mailbox, and CAMPAIGN_SENDING_ENABLED=true.
//   Intake         SALES_INTAKE_KEY (32+ characters) for the lead tool.

const int = (v: string | undefined, fallback: number, max: number) => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback
}

export const salesConfig = {
  /** Netrows calls per day across all lookups, 1 credit each. */
  lookupDailyCap: () => int(process.env.SALES_LOOKUP_DAILY_CAP, 50, 1000),
  senderEmail: () => (process.env.CAMPAIGN_SENDER_EMAIL || 'sales@traderisksolutions.com.sg').trim().toLowerCase(),
  /** Every message counts, follow-ups included. A rolling 30 days holds at most 22 weekdays,
   *  so 45/day caps it at 990: under the Spam Control Act's bulk threshold of 1,000 similar
   *  messages in 30 days. Above 45 the Act's bulk rules apply. */
  dailyCap: () => int(process.env.CAMPAIGN_DAILY_CAP, 30, 45),
  /** The runner is called every 20 minutes in office hours: 24 runs a day. A share per run
   *  spreads the day's sends instead of bursting them in the first run. */
  perRun: () => Math.max(1, Math.ceil(int(process.env.CAMPAIGN_DAILY_CAP, 30, 45) / 24)),
  businessName: () => process.env.OUTBOUND_BUSINESS_NAME || 'Trade Risk Solutions Pte Ltd',
  businessDomain: () => process.env.OUTBOUND_BUSINESS_DOMAIN || 'traderisksolutions.com.sg',
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL || 'https://trs-dashboard-pi.vercel.app',
}

export const lookupConfigured = () => Boolean(process.env.NETROWS_API_KEY)
export const gmailConfigured = () => Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN)
export const sendingEnabled = () => gmailConfigured() && process.env.CAMPAIGN_SENDING_ENABLED === 'true'
export const intakeConfigured = () => (process.env.SALES_INTAKE_KEY ?? '').length >= 32

export type WorkflowStatus = { lookup: boolean; gmail: boolean; sending: boolean; sender: string; dailyCap: number; intake: boolean }

export function workflowStatus(): WorkflowStatus {
  return { lookup: lookupConfigured(), gmail: gmailConfigured(), sending: sendingEnabled(), sender: salesConfig.senderEmail(), dailyCap: salesConfig.dailyCap(), intake: intakeConfigured() }
}
