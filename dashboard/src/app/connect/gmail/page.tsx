/**
 * /connect/gmail — the page a broker is sent. One button: sign in with the TRS Google account and
 * allow read-only Gmail access. Afterwards it says which mailbox is connected.
 */
export const dynamic = 'force-dynamic'

const ERRORS: Record<string, string> = {
  callback: 'Google did not complete the sign-in. Please try again.',
  domain: 'Use your @trade-risksol.com account.',
  scope: 'Gmail access was not allowed. Please try again and tick the Gmail box.',
  too_wide: 'Google granted more than read-only access, so nothing was stored. Remove TRS access in Google Account → Security → Third-party connections, then try again.',
  no_refresh: 'Google did not return lasting access. Please try again.',
  watch: 'Connected read only, but Gmail notifications could not start. TRS operations will look into it.',
  config: 'The dashboard is not set up for this yet. Please contact TRS operations.',
}

export default async function ConnectGmail({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const connected = sp.connected
  const error = sp.error ? ERRORS[sp.error] ?? ERRORS.callback : null
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-trs-tint text-trs-ink">
      <div className="w-full max-w-[460px] bg-white rounded border border-trs-line p-8">
        <div className="text-body mb-3 text-trs-muted">Trade Risk Solutions</div>
        <h1 className="m-0 text-title font-medium">Gmail access: read only</h1>
        {connected ? (
          <p className="mt-4 mb-0 text-body leading-[1.6]">{connected} is connected, read only. The TRS dashboard can read this mailbox. It cannot send, change or delete any email.</p>
        ) : (
          <>
            <ul className="mt-5 mb-0 pl-0 list-none flex flex-col gap-2.5 text-body leading-[1.5]">
              <li className="flex gap-2.5"><span aria-hidden className="text-trs-pos">✓</span><span>Reads your inbox and sent mail</span></li>
              <li className="flex gap-2.5"><span aria-hidden className="text-trs-neg">✕</span><span><b>Cannot send email</b> from your account</span></li>
              <li className="flex gap-2.5"><span aria-hidden className="text-trs-neg">✕</span><span>Cannot change, move or delete any email</span></li>
            </ul>
            <p className="mt-4 mb-0 text-body leading-[1.6] text-trs-ink-2">Google will ask you to allow <b>“View your email messages and settings”</b>. That is the only permission requested.</p>
            {error && <p className="text-body mt-3 mb-0 text-trs-neg">{error}</p>}
            <a href="/auth/gmail" className="mt-6 inline-flex items-center justify-center h-9 px-6 rounded text-white text-body font-medium no-underline bg-trs-green">Allow read-only access</a>
            <p className="mt-4 mb-0 text-body text-trs-muted">Sign in with your @trade-risksol.com account. Remove access at any time: Google Account → Security → Third-party connections.</p>
          </>
        )}
      </div>
    </main>
  )
}
