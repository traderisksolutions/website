/**
 * /connect/gmail — the page a broker is sent. One button: sign in with the TRS Google account and
 * allow read-only Gmail access. Afterwards it says which mailbox is connected.
 */
export const dynamic = 'force-dynamic'

const ERRORS: Record<string, string> = {
  callback: 'Google did not complete the sign-in. Please try again.',
  domain: 'Use your @trade-risksol.com account.',
  scope: 'Gmail access was not allowed. Please try again and tick the Gmail box.',
  no_refresh: 'Google did not return lasting access. Please try again.',
  watch: 'Connected, but Gmail notifications could not start. TRS operations will look into it.',
  config: 'The dashboard is not set up for this yet. Please contact TRS operations.',
}

export default async function ConnectGmail({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const connected = sp.connected
  const error = sp.error ? ERRORS[sp.error] ?? ERRORS.callback : null
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-[#fafaf7]" style={{ color: '#0f1412' }}>
      <div className="w-full max-w-[460px] bg-white rounded-[16px] border border-[#e6e8e4] p-8">
        <div className="text-[13px] tracking-[0.08em] uppercase mb-3" style={{ color: '#4a5550' }}>Trade Risk Solutions</div>
        <h1 className="m-0 text-[26px] font-medium tracking-[-0.02em]">Connect your Gmail</h1>
        {connected ? (
          <p className="mt-4 mb-0 text-[15px] leading-[1.6]">{connected} is connected. The TRS dashboard now reads this mailbox, read-only. Nothing is sent from it and nothing is deleted.</p>
        ) : (
          <>
            <p className="mt-4 text-[15px] leading-[1.6]" style={{ color: '#2a332f' }}>
              The TRS dashboard reads your inbox and sent mail, read-only, so client and insurer emails file themselves under each request. It never sends, changes or deletes anything.
            </p>
            {error && <p className="text-[14px] mt-3 mb-0" style={{ color: '#a23b2c' }}>{error}</p>}
            <a href="/auth/gmail" className="mt-6 inline-flex items-center justify-center h-11 px-6 rounded-[8px] text-white text-[15px] font-medium no-underline" style={{ background: '#132c1c' }}>Sign in with Google</a>
            <p className="mt-4 mb-0 text-[13px]" style={{ color: '#4a5550' }}>Use your @trade-risksol.com account. Access can be removed at any time in your Google Account under Security → Third-party connections.</p>
          </>
        )}
      </div>
    </main>
  )
}
