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
  watch: 'Connected read only, but Gmail notifications could not start. TRS operations will look into it.',
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
        <h1 className="m-0 text-[26px] font-medium tracking-[-0.02em]">Gmail access: read only</h1>
        {connected ? (
          <p className="mt-4 mb-0 text-[15px] leading-[1.6]">{connected} is connected, read only. The TRS dashboard can read this mailbox. It cannot send, change or delete any email.</p>
        ) : (
          <>
            <ul className="mt-5 mb-0 pl-0 list-none flex flex-col gap-2.5 text-[15px] leading-[1.5]">
              <li className="flex gap-2.5"><span aria-hidden style={{ color: '#1f6b43' }}>✓</span><span>Reads your inbox and sent mail</span></li>
              <li className="flex gap-2.5"><span aria-hidden style={{ color: '#a23b2c' }}>✕</span><span><b>Cannot send email</b> from your account</span></li>
              <li className="flex gap-2.5"><span aria-hidden style={{ color: '#a23b2c' }}>✕</span><span>Cannot change, move or delete any email</span></li>
            </ul>
            <p className="mt-4 mb-0 text-[14px] leading-[1.6]" style={{ color: '#2a332f' }}>Google will ask you to allow <b>“View your email messages and settings”</b>. That is the only permission requested.</p>
            {error && <p className="text-[14px] mt-3 mb-0" style={{ color: '#a23b2c' }}>{error}</p>}
            <a href="/auth/gmail" className="mt-6 inline-flex items-center justify-center h-11 px-6 rounded-[8px] text-white text-[15px] font-medium no-underline" style={{ background: '#132c1c' }}>Allow read-only access</a>
            <p className="mt-4 mb-0 text-[13px]" style={{ color: '#4a5550' }}>Sign in with your @trade-risksol.com account. Remove access at any time: Google Account → Security → Third-party connections.</p>
          </>
        )}
      </div>
    </main>
  )
}
