'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

function UnsubscribedCard() {
  const params = useSearchParams()
  const ok = params.get('ok') !== '0'

  return (
    <div
      className="flex items-center justify-center px-4"
      style={{ minHeight: 'calc(100vh / var(--ui-zoom))', background: 'hsl(var(--background))' }}
    >
      <div
        className="w-[380px] bg-card rounded-xl border border-[--border-subtle] px-9 py-10 text-center"
        style={{ boxShadow: 'var(--shadow-modal)' }}
      >
        {ok ? (
          <>
            <CheckCircle2 className="mx-auto mb-4" size={36} style={{ color: 'var(--success)' }} />
            <h1 className="text-[17px] font-bold text-foreground tracking-tight m-0">You&rsquo;re unsubscribed</h1>
            <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed m-0">
              We won&rsquo;t send you any further emails from this address. If you reach out to us again, that&rsquo;s separate — we&rsquo;ll still respond.
            </p>
          </>
        ) : (
          <>
            <XCircle className="mx-auto mb-4" size={36} style={{ color: 'var(--error)' }} />
            <h1 className="text-[17px] font-bold text-foreground tracking-tight m-0">Link no longer valid</h1>
            <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed m-0">
              This unsubscribe link couldn&rsquo;t be verified. If you&rsquo;d still like to stop receiving emails, please reply to any message from us and let us know.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default function UnsubscribedPage() {
  return (
    <Suspense>
      <UnsubscribedCard />
    </Suspense>
  )
}
