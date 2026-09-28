'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const INK = '#202124'
const MUTED = '#5f6368'

function UnsubscribedCard() {
  const params = useSearchParams()
  const ok = params.get('ok') !== '0'

  return (
    <div
      className="flex items-center justify-center px-4 bg-white"
      style={{ minHeight: 'calc(100vh / var(--ui-zoom))', color: INK }}
    >
      <div className="w-full max-w-[400px] bg-white rounded-[16px] px-9 py-10 text-center" style={{ border: '1px solid #e8eaed' }}>
        <div className="inline-flex items-center justify-center rounded-[12px] mb-5 w-12 h-12" style={{ background: INK }}>
          <span className="text-white text-[16px] font-medium tracking-[-0.01em]">TRS</span>
        </div>
        {ok ? (
          <>
            <h1 className="m-0 text-[24px] font-medium tracking-[-0.02em] leading-tight" style={{ color: INK }}>Unsubscribed</h1>
            <p className="m-0 mt-2.5 text-[14px] leading-relaxed" style={{ color: MUTED }}>
              No further emails will be sent to this address. If you contact us again, we will still reply.
            </p>
          </>
        ) : (
          <>
            <h1 className="m-0 text-[24px] font-medium tracking-[-0.02em] leading-tight" style={{ color: INK }}>Link no longer valid</h1>
            <p className="m-0 mt-2.5 text-[14px] leading-relaxed" style={{ color: MUTED }}>
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
