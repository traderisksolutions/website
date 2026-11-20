'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function UnsubscribedCard() {
  const params = useSearchParams()
  const ok = params.get('ok') !== '0'

  return (
    <div className="flex items-center justify-center px-4 bg-white min-h-[calc(100vh/var(--ui-zoom))] text-trs-ink">
      <div className="w-full max-w-[400px] bg-white rounded border border-trs-line px-9 py-10 text-center">
        <div className="inline-flex items-center justify-center rounded mb-5 w-12 h-12 bg-trs-ink">
          <span className="text-white text-heading font-medium">TRS</span>
        </div>
        {ok ? (
          <>
            <h1 className="m-0 text-title font-medium leading-tight text-trs-ink">Unsubscribed</h1>
            <p className="m-0 mt-2.5 text-body leading-relaxed text-trs-muted">
              No further emails will be sent to this address. If you contact us again, we will still reply.
            </p>
          </>
        ) : (
          <>
            <h1 className="m-0 text-title font-medium leading-tight text-trs-ink">Link no longer valid</h1>
            <p className="m-0 mt-2.5 text-body leading-relaxed text-trs-muted">
              This unsubscribe link could not be verified. To stop receiving emails, please reply to any message from us and let us know.
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
